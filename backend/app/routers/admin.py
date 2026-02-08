import os
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AppConfig, Member, WeeklyStatus, WeeklySummary
from app.services import gmail, chat_parser

router = APIRouter()

DAY_NAMES = ['월', '화', '수', '목', '금', '토', '일']

EXCLUDE_LABELS = {
    'illness': '질병',
    'travel': '여행',
    'business': '출장',
    'injury': '부상',
    'surgery': '수술',
    'custom': '직접쓰기',
}


class PasswordSet(BaseModel):
    password: str


class ManagerSet(BaseModel):
    name: str


class SettlementRequest(BaseModel):
    week_start: str  # 월요일 날짜 YYYY-MM-DD


class ResetRequest(BaseModel):
    password: str


def set_config(db: Session, key: str, value: str):
    config = db.query(AppConfig).filter(AppConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = AppConfig(key=key, value=value)
        db.add(config)
    db.commit()


def get_config(db: Session, key: str):
    config = db.query(AppConfig).filter(AppConfig.key == key).first()
    return config.value if config else None


def _format_date(d: date) -> str:
    dn = DAY_NAMES[d.weekday()]
    return f"{d.year}-{d.month:02d}-{d.day:02d}({dn})"


@router.post("/password")
def set_password(body: PasswordSet, db: Session = Depends(get_db)):
    set_config(db, "admin_password", body.password)
    return {"success": True}


@router.put("/manager")
def set_manager(body: ManagerSet, db: Session = Depends(get_db)):
    set_config(db, "manager_name", body.name)
    return {"success": True}


@router.get("/manager")
def get_manager(db: Session = Depends(get_db)):
    name = get_config(db, "manager_name")
    return {"name": name}


@router.get("/gmail/auth-url")
def gmail_auth_url():
    try:
        url = gmail.get_auth_url()
        return {"url": url}
    except FileNotFoundError:
        return {"error": "client_secret.json not found"}


@router.get("/gmail/callback")
def gmail_callback(code: str = Query(...), db: Session = Depends(get_db)):
    gmail.handle_callback(code, db)
    return RedirectResponse(url="http://localhost:5173/admin?gmail=connected")


@router.get("/gmail/status")
def gmail_status(db: Session = Depends(get_db)):
    connected = gmail.is_connected(db)
    return {"connected": connected}


@router.post("/settlement")
def run_settlement(body: SettlementRequest, db: Session = Depends(get_db)):
    if not gmail.is_connected(db):
        return {"error": "Gmail not connected"}

    monday = date.fromisoformat(body.week_start)
    sunday = monday + timedelta(days=6)

    message = gmail.find_latest_chat_mail(db)
    if not message:
        return {"error": "No Kakaotalk_Chat mail found"}

    zip_path = gmail.download_attachment(db, message)
    if not zip_path:
        return {"error": "No zip attachment found"}

    text = chat_parser.unzip_and_read(zip_path)
    if not text:
        return {"error": "No txt file found in zip"}

    photo_counts = chat_parser.parse_chat(text, monday, sunday)

    members = db.query(Member).filter(Member.is_active == True).all()

    # 해당 주차의 weekly_status 조회
    iso = monday.isocalendar()
    week_label = f"{iso[0]}-W{iso[1]:02d}"
    statuses = db.query(WeeklyStatus).filter(
        WeeklyStatus.week_label == week_label
    ).all()
    ws_map = {ws.member_id: ws for ws in statuses}

    results = chat_parser.build_result(photo_counts, members, ws_map)

    # 안내 문구 생성
    manager_name = get_config(db, "manager_name") or "운영진"
    summary = _build_summary(results, monday, sunday, manager_name)

    # WeeklyStatus에 정산 결과 저장
    from datetime import datetime
    now_iso = datetime.now().isoformat()

    for result in results:
        if result["member_id"] is None:
            continue  # DB에 없는 멤버는 스킵

        # 기존 WeeklyStatus 조회
        existing_ws = db.query(WeeklyStatus).filter(
            WeeklyStatus.member_id == result["member_id"],
            WeeklyStatus.week_label == week_label
        ).first()

        if existing_ws:
            # 기존 데이터 업데이트 (제외 상태가 아니면 정산 결과로 덮어쓰기)
            if existing_ws.status != "exclude":
                existing_ws.status = result["status"]
                existing_ws.exclude_reason = result["exclude_reason"]
                existing_ws.exclude_reason_detail = result["exclude_reason_detail"]
                existing_ws.certified_date = result.get("certified_date")
                existing_ws.certified_at = result.get("certified_at")
        else:
            # 새로운 데이터 생성
            new_ws = WeeklyStatus(
                member_id=result["member_id"],
                week_label=week_label,
                status=result["status"],
                exclude_reason=result["exclude_reason"],
                exclude_reason_detail=result["exclude_reason_detail"],
                certified_date=result.get("certified_date"),
                certified_at=result.get("certified_at"),
                created_at=now_iso
            )
            db.add(new_ws)

    # WeeklySummary에 저장 (과거 내역용)
    from app.models import WeeklySummary

    existing_summary = db.query(WeeklySummary).filter(
        WeeklySummary.week_label == week_label
    ).first()

    if existing_summary:
        # 기존 데이터 업데이트
        existing_summary.summary_text = summary
    else:
        # 새로운 데이터 생성
        new_summary = WeeklySummary(
            week_label=week_label,
            summary_text=summary,
            created_at=now_iso
        )
        db.add(new_summary)

    db.commit()

    return {
        "results": results,
        "summary": summary,
        "period": {
            "start": body.week_start,
            "end": sunday.isoformat(),
        },
    }


def _build_summary(results: list, start: date, end: date, manager_name: str) -> str:
    total = len(results)
    injeung_list = [r for r in results if r["status"] == "injeung"]
    exclude_list = [r for r in results if r["status"] == "exclude"]
    fine_list = [r for r in results if r["status"] == "fine"]
    penalty_list = [r for r in results if r["status"] == "penalty"]
    exclude_but_certified_list = [r for r in results if r.get("is_exclude_but_certified", False)]

    # 생년→가나다 순 정렬 함수 (2000년대생 고려)
    def sort_by_birth_name(lst):
        def birth_sort_key(birth_prefix):
            # 빈 값 처리
            if not birth_prefix:
                return (9999, "")
            # 2자리 숫자를 4자리로 변환 (00-29 → 2000-2029, 30-99 → 1930-1999)
            year_2digit = int(birth_prefix)
            if year_2digit <= 29:
                return (2000 + year_2digit, birth_prefix)
            else:
                return (1900 + year_2digit, birth_prefix)

        return sorted(lst, key=lambda r: (birth_sort_key(r["birth_prefix"])[0], r["name"]))

    lines = []
    lines.append(f"집계 기간: {_format_date(start)} ~ {_format_date(end)}")
    lines.append("")
    lines.append(
        f"총 인원: {total}명, "
        f"인증 인원: {len(injeung_list)}명, "
        f"미인증 인원: {len(fine_list) + len(penalty_list)}명, "
        f"인증 제외 인원: {len(exclude_list)}명"
    )
    lines.append("")

    if exclude_list:
        sorted_exclude = sort_by_birth_name(exclude_list)
        names = []
        for r in sorted_exclude:
            label = r["birth_prefix"] + r["name"]
            reason = EXCLUDE_LABELS.get(r["exclude_reason"], r.get("exclude_reason_detail") or "")
            if reason:
                label += f"({reason})"
            names.append(label)
        lines.append(f"인증 제외 인원 ({len(exclude_list)}명): {', '.join(names)}")
    else:
        lines.append("인증 제외 인원이 없습니다.")
    lines.append("")

    # 제외됐지만 인증한 인원 (있을 때만 표시)
    if exclude_but_certified_list:
        sorted_certified = sort_by_birth_name(exclude_but_certified_list)
        names = [r["birth_prefix"] + r["name"] for r in sorted_certified]
        lines.append(f"인증 제외됐지만 인증한 인원 ({len(exclude_but_certified_list)}명): {', '.join(names)} 😎")
        lines.append("")

    if fine_list:
        sorted_fine = sort_by_birth_name(fine_list)
        names = [r["birth_prefix"] + r["name"] for r in sorted_fine]
        lines.append(f"벌금 납부 인원 ({len(fine_list)}명): {', '.join(names)} 💰")
    else:
        lines.append("벌금 납부 인원이 없습니다.")
    lines.append("")

    if penalty_list:
        sorted_penalty = sort_by_birth_name(penalty_list)
        names = [r["birth_prefix"] + r["name"] for r in sorted_penalty]
        lines.append(f"벌점 대상 인원 ({len(penalty_list)}명): {', '.join(names)} 😭")
    else:
        lines.append("벌점 대상 인원이 없습니다. 👍")
    lines.append("")

    lines.append(f"궁금한 사항은 담당 운영진 {manager_name}에게 문의 바랍니다.")

    return "\n".join(lines)


@router.post("/mid-settlement")
def run_mid_settlement(body: SettlementRequest, db: Session = Depends(get_db)):
    if not gmail.is_connected(db):
        return {"error": "Gmail not connected"}

    monday = date.fromisoformat(body.week_start)
    sunday = monday + timedelta(days=6)

    message = gmail.find_latest_chat_mail(db)
    if not message:
        return {"error": "No Kakaotalk_Chat mail found"}

    zip_path = gmail.download_attachment(db, message)
    if not zip_path:
        return {"error": "No zip attachment found"}

    text = chat_parser.unzip_and_read(zip_path)
    if not text:
        return {"error": "No txt file found in zip"}

    photo_counts = chat_parser.parse_chat(text, monday, sunday)

    members = db.query(Member).filter(Member.is_active == True).all()

    iso = monday.isocalendar()
    week_label = f"{iso[0]}-W{iso[1]:02d}"
    statuses = db.query(WeeklyStatus).filter(
        WeeklyStatus.week_label == week_label
    ).all()
    ws_map = {ws.member_id: ws for ws in statuses}

    results = chat_parser.build_result(photo_counts, members, ws_map)

    # 중간정산은 벌점 대상자만 포함 (벌금은 이미 납부했으므로 제외)
    penalty_members = [r for r in results if r["status"] == "penalty"]

    # 생년→가나다 순 정렬 함수 (2000년대생 고려)
    def sort_by_birth_name(lst):
        def birth_sort_key(birth_prefix):
            # 빈 값 처리
            if not birth_prefix:
                return (9999, "")
            # 2자리 숫자를 4자리로 변환 (00-29 → 2000-2029, 30-99 → 1930-1999)
            year_2digit = int(birth_prefix)
            if year_2digit <= 29:
                return (2000 + year_2digit, birth_prefix)
            else:
                return (1900 + year_2digit, birth_prefix)

        return sorted(lst, key=lambda r: (birth_sort_key(r["birth_prefix"])[0], r["name"]))

    sorted_penalty = sort_by_birth_name(penalty_members)
    names = [r["birth_prefix"] + r["name"] for r in sorted_penalty]

    lines = []
    lines.append("[알림] 태그되신 분들은 현재 시간 기준 아직 인증이 되지 않았거나 벌금을 납부하지 않은 것으로 확인 됩니다. 오늘 자정까지 늦지 않게 인증 또는 증빙 또는 벌금 납부 해주시기 바랍니다 ~")
    lines.append(", ".join(names))

    return {"summary": "\n".join(lines)}


@router.post("/reset")
def reset_all_data(body: ResetRequest, db: Session = Depends(get_db)):
    """모든 주차 설정 및 과거 내역 초기화"""
    # 비밀번호 검증
    saved_password = get_config(db, "admin_password")
    if not saved_password or saved_password != body.password:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Invalid password")

    # WeeklyStatus 모든 데이터 삭제
    db.query(WeeklyStatus).delete()

    # WeeklySummary 모든 데이터 삭제
    db.query(WeeklySummary).delete()

    db.commit()

    return {"success": True}
