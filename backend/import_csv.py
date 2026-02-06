import sys
import csv
from datetime import datetime
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# 현재 스크립트의 상위 디렉토리를 sys.path에 추가
sys.path.insert(0, str(Path(__file__).parent))

from app.models import Base, Member, WeeklyStatus
from app.database import engine, SessionLocal

def parse_status(value):
    """상태값 파싱: Y/N/N(벌점)/P(사유)/- 등"""
    if not value or value.strip() in ['-', '']:
        return None, None, None

    value = value.strip()

    # Y: 인증
    if value == 'Y':
        return 'injeung', None, None

    # N(벌점): 벌점
    if value.startswith('N(') or value.startswith('N ('):
        return 'penalty', None, None

    # N: 벌금
    if value == 'N':
        return 'fine', None, None

    # P(제외사유): 제외
    if value.startswith('P(') or value.startswith('P ('):
        # P(여행) 형식에서 사유 추출
        start = value.find('(')
        end = value.find(')')
        if start != -1 and end != -1:
            reason_text = value[start+1:end].strip()
            # 제외 사유 매핑
            reason_map = {
                '질병': 'illness',
                '여행': 'travel',
                '출장': 'business',
                '부상': 'injury',
                '수술': 'surgery',
            }
            reason = reason_map.get(reason_text, 'custom')
            detail = reason_text if reason == 'custom' else None
            return 'exclude', reason, detail

    # 알 수 없는 값
    print(f"경고: 알 수 없는 상태값 '{value}'")
    return None, None, None


def date_to_week_label(date_str):
    """날짜 문자열을 ISO week label로 변환: '2026. 1. 5' -> '2026-W01'"""
    try:
        # '2026. 1. 5' 형식 파싱
        date_str = date_str.strip().replace(' ', '')
        parts = date_str.split('.')
        year = int(parts[0])
        month = int(parts[1])
        day = int(parts[2])

        date_obj = datetime(year, month, day)
        iso = date_obj.isocalendar()
        return f"{iso[0]}-W{iso[1]:02d}"
    except Exception as e:
        print(f"날짜 파싱 오류: {date_str} - {e}")
        return None


def main():
    csv_path = r"C:\Users\dydwl\Desktop\헬톡 인원 및 인증관리 - 26년.csv"

    print(f"CSV 파일 읽는 중: {csv_path}")

    # CSV 파일 읽기 (인코딩 시도)
    encodings = ['utf-8-sig', 'cp949', 'euc-kr', 'utf-8']
    rows = None

    for encoding in encodings:
        try:
            with open(csv_path, 'r', encoding=encoding) as f:
                reader = csv.reader(f)
                rows = list(reader)
            print(f"인코딩 성공: {encoding}")
            break
        except Exception as e:
            continue

    if not rows:
        print("CSV 파일을 읽을 수 없습니다.")
        return

    # 헤더 확인
    header = rows[0]
    print(f"헤더: {header[:10]}...")  # 처음 10개만 출력

    # 주차 열 찾기 (인덱스 6부터 날짜 컬럼)
    week_columns = []
    for i, col in enumerate(header[6:], start=6):
        week_label = date_to_week_label(col)
        if week_label:
            week_columns.append((i, week_label))

    print(f"주차 컬럼 수: {len(week_columns)}")

    db = SessionLocal()

    try:
        # Members 및 WeeklyStatus 처리
        member_count = 0
        status_count = 0

        for row_idx, row in enumerate(rows[1:], start=2):  # 헤더 제외
            if len(row) < 6:
                continue

            name = row[0].strip()
            birth_year = row[1].strip()
            is_left = row[3].strip().upper() == 'Y'
            left_date = row[4].strip() if row[4].strip() not in ['-', ''] else None
            left_reason = row[5].strip() if row[5].strip() not in ['-', ''] else None

            if not name or not birth_year:
                continue

            # Member 찾기 또는 생성 (동명이인 방지: 이름 + 생년)
            member = db.query(Member).filter(
                Member.name == name,
                Member.birth_date == birth_year
            ).first()

            if member:
                # 기존 멤버 업데이트
                if birth_year and not member.birth_date:
                    member.birth_date = birth_year
                member.is_active = not is_left
                if left_date:
                    member.left_date = left_date
                if left_reason:
                    member.left_reason = left_reason
                print(f"멤버 업데이트: {name}")
            else:
                # 새 멤버 추가
                member = Member(
                    name=name,
                    birth_date=birth_year if birth_year else None,
                    is_active=not is_left,
                    left_date=left_date,
                    left_reason=left_reason
                )
                db.add(member)
                db.flush()  # ID 생성
                member_count += 1
                print(f"멤버 추가: {name} (ID: {member.id})")

            # 주차별 상태 처리
            for col_idx, week_label in week_columns:
                if col_idx >= len(row):
                    continue

                status_value = row[col_idx].strip() if col_idx < len(row) else ''
                status, exclude_reason, exclude_detail = parse_status(status_value)

                if status is None:
                    continue  # null 값은 저장 안 함

                # 기존 WeeklyStatus 확인
                existing = db.query(WeeklyStatus).filter(
                    WeeklyStatus.member_id == member.id,
                    WeeklyStatus.week_label == week_label
                ).first()

                if existing:
                    # 기존 데이터 업데이트
                    existing.status = status
                    existing.exclude_reason = exclude_reason
                    existing.exclude_reason_detail = exclude_detail
                else:
                    # 새 WeeklyStatus 추가
                    ws = WeeklyStatus(
                        member_id=member.id,
                        week_label=week_label,
                        status=status,
                        exclude_reason=exclude_reason,
                        exclude_reason_detail=exclude_detail
                    )
                    db.add(ws)
                    status_count += 1

        db.commit()
        print(f"\n완료!")
        print(f"- 새로운 멤버: {member_count}명")
        print(f"- 주차별 상태: {status_count}개")

    except Exception as e:
        db.rollback()
        print(f"오류 발생: {e}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()


if __name__ == '__main__':
    main()
