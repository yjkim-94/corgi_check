import os
import re
import zipfile
from datetime import date
from typing import Optional


def unzip_and_read(zip_path: str) -> str:
    tmp_dir = os.path.dirname(zip_path)
    extract_dir = os.path.join(tmp_dir, "extracted")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)
    for root, dirs, files in os.walk(extract_dir):
        for f in files:
            if f.endswith(".txt"):
                file_path = os.path.join(root, f)
                for encoding in ["utf-8", "cp949", "euc-kr"]:
                    try:
                        with open(file_path, "r", encoding=encoding) as fh:
                            return fh.read()
                    except (UnicodeDecodeError, LookupError):
                        continue
    return ""


def parse_chat(
    text: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> dict:
    """txt 파싱하여 인원별 사진 수 집계."""
    photo_counts = {}
    date_header_pattern = re.compile(
        r"(\d{4})년 (\d{1,2})월 (\d{1,2})일"
    )
    line_pattern = re.compile(
        r"(\d{4})\. (\d{1,2})\. (\d{1,2})\. \d{2}:\d{2}, (.+?) : 사진 (\d+)장"
    )

    for line in text.splitlines():
        header_match = date_header_pattern.search(line)
        if header_match:
            continue

        match = line_pattern.search(line)
        if match:
            y, m, d = int(match.group(1)), int(match.group(2)), int(match.group(3))
            line_date = date(y, m, d)
            if start_date and line_date < start_date:
                continue
            if end_date and line_date > end_date:
                continue
            nickname = match.group(4).strip()

            # 닉네임 매핑
            if nickname == ".":
                nickname = "94김용진"

            count = int(match.group(5))
            photo_counts[nickname] = photo_counts.get(nickname, 0) + count

    return photo_counts


def extract_name_from_nickname(nickname: str) -> str:
    """닉네임에서 이름 추출. 예: 헬톡96장영범_7 -> 장영범, 94김용진 -> 김용진"""
    # 패턴 1: 헬톡\d{2}이름_\d+ (예: 헬톡96장영범_7)
    m = re.match(r"헬톡\d{2}(.+?)_\d+", nickname)
    if m:
        return m.group(1)

    # 패턴 2: \d{2}이름 (예: 94김용진)
    m = re.match(r"\d{2}(.+)", nickname)
    if m:
        return m.group(1)

    return nickname


def extract_birth_prefix(nickname: str) -> str:
    """닉네임에서 생년 2자리 추출. 예: 헬톡96장영범_7 -> 96, 94김용진 -> 94"""
    # 패턴 1: 헬톡\d{2}이름_\d+ (예: 헬톡96장영범_7)
    m = re.match(r"헬톡(\d{2}).+?_\d+", nickname)
    if m:
        return m.group(1)

    # 패턴 2: \d{2}이름 (예: 94김용진)
    m = re.match(r"(\d{2}).+", nickname)
    if m:
        return m.group(1)

    return ""


def get_birth_prefix_from_date(birth_date: str) -> str:
    """birth_date(YYYY-MM-DD 또는 YY)에서 2자리 추출."""
    if not birth_date:
        return ""
    if len(birth_date) == 2:
        return birth_date
    if len(birth_date) >= 4:
        return birth_date[2:4]
    return ""


def build_result(photo_counts: dict, members: list, weekly_statuses: dict = None) -> list:
    """DB 멤버와 매칭하여 인증 결과 생성.
    weekly_statuses: {member_id: WeeklyStatus} - 제외/벌금 상태 참조용
    """
    if weekly_statuses is None:
        weekly_statuses = {}

    member_name_map = {}
    for member in members:
        member_name_map[member.name] = member

    results = []
    matched_member_ids = set()

    for nickname, count in photo_counts.items():
        name = extract_name_from_nickname(nickname)
        birth_prefix = extract_birth_prefix(nickname)
        member = member_name_map.get(name)

        # 활동 중인 멤버만 집계
        if not member or not member.is_active:
            continue

        if not birth_prefix and member:
            birth_prefix = get_birth_prefix_from_date(member.birth_date)

        ws = weekly_statuses.get(member.id) if member else None

        # 상태 결정 로직
        is_exclude_but_certified = False
        if ws and ws.status == "exclude":
            status = "exclude"
            exclude_reason = ws.exclude_reason
            exclude_reason_detail = ws.exclude_reason_detail
            # 제외 처리됐지만 4장 이상 인증한 경우 플래그 설정
            if count >= 4:
                is_exclude_but_certified = True
        elif ws and ws.status == "fine":
            # 수동으로 벌금 처리된 경우
            status = "fine"
            exclude_reason = None
            exclude_reason_detail = None
        elif count >= 4:
            status = "injeung"
            exclude_reason = None
            exclude_reason_detail = None
        else:
            # 사진 부족 (벌점 대상)
            status = "penalty"
            exclude_reason = None
            exclude_reason_detail = None

        result = {
            "nickname": nickname,
            "name": name,
            "birth_prefix": birth_prefix,
            "photo_count": count,
            "status": status,
            "exclude_reason": exclude_reason,
            "exclude_reason_detail": exclude_reason_detail,
            "member_id": member.id if member else None,
            "is_exclude_but_certified": is_exclude_but_certified,
        }
        results.append(result)
        if member:
            matched_member_ids.add(member.id)

    for member in members:
        if member.id not in matched_member_ids and member.is_active:
            birth_prefix = get_birth_prefix_from_date(member.birth_date)
            ws = weekly_statuses.get(member.id)

            # 상태 결정
            if ws and ws.status == "exclude":
                status = "exclude"
                exclude_reason = ws.exclude_reason
                exclude_reason_detail = ws.exclude_reason_detail
            elif ws and ws.status == "fine":
                # 수동으로 벌금 처리
                status = "fine"
                exclude_reason = None
                exclude_reason_detail = None
            else:
                # 인증 없음 (벌점 대상)
                status = "penalty"
                exclude_reason = None
                exclude_reason_detail = None

            results.append({
                "nickname": "",
                "name": member.name,
                "birth_prefix": birth_prefix,
                "photo_count": 0,
                "status": status,
                "exclude_reason": exclude_reason,
                "exclude_reason_detail": exclude_reason_detail,
                "member_id": member.id,
                "is_exclude_but_certified": False,
            })

    results.sort(key=lambda x: x["name"])
    return results
