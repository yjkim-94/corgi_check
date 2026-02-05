from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Member, WeeklyStatus

router = APIRouter()


def get_current_week_label():
    """월요일 기준 주차 라벨. 예: 2026-W05 (내부용)"""
    now = datetime.now()
    # isocalendar는 월요일 기준
    iso = now.isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def get_week_display_label():
    """표시용 주차 라벨. 예: 26년 2월 2일(월) 주"""
    now = datetime.now()
    # 이번 주 월요일 구하기
    monday = now - timedelta(days=now.weekday())
    day_names = ['월', '화', '수', '목', '금', '토', '일']
    day_name = day_names[monday.weekday()]
    return f"{monday.year % 100}년 {monday.month}월 {monday.day}일({day_name}) 주"


def get_future_week_labels(num_weeks: int) -> list:
    """현재 주차부터 N주까지의 week_label 리스트 반환

    Args:
        num_weeks: 생성할 주차 수 (1-8)

    Returns:
        ["2026-W05", "2026-W06", ...] 형식의 리스트
    """
    labels = []
    now = datetime.now()
    for i in range(num_weeks):
        target_date = now + timedelta(weeks=i)
        iso = target_date.isocalendar()
        labels.append(f"{iso[0]}-W{iso[1]:02d}")
    return labels


class StatusUpdate(BaseModel):
    status: str
    exclude_reason: Optional[str] = None
    exclude_reason_detail: Optional[str] = None
    consecutive_weeks: Optional[int] = 1
    week_start: Optional[str] = None  # 특정 주차부터 시작 (YYYY-MM-DD)


@router.get("/current")
def get_current_status(week_start: Optional[str] = None, db: Session = Depends(get_db)):
    # week_start가 제공되면 해당 날짜로 week_label 계산
    if week_start:
        from datetime import date
        monday = date.fromisoformat(week_start)
        iso = monday.isocalendar()
        week_label = f"{iso[0]}-W{iso[1]:02d}"
        # 표시용 라벨 생성
        day_names = ['월', '화', '수', '목', '금', '토', '일']
        day_name = day_names[monday.weekday()]
        week_display = f"{monday.year % 100}년 {monday.month}월 {monday.day}일({day_name}) 주"
    else:
        week_label = get_current_week_label()
        week_display = get_week_display_label()

    members = db.query(Member).filter(Member.is_active == True).all()
    result = []
    for m in members:
        ws = (
            db.query(WeeklyStatus)
            .filter(
                WeeklyStatus.member_id == m.id,
                WeeklyStatus.week_label == week_label,
            )
            .first()
        )
        result.append({
            "id": m.id,
            "name": m.name,
            "birth_date": m.birth_date,
            "status": ws.status if ws else "injeung",
            "exclude_reason": ws.exclude_reason if ws else None,
            "exclude_reason_detail": ws.exclude_reason_detail if ws else None,
            "week_label": week_label,
            "week_display": week_display,
        })
    return result


@router.get("/{member_id}/exclude-end")
def get_exclude_end(member_id: int, db: Session = Depends(get_db)):
    """해당 멤버의 제외 종료 주차 조회"""
    current_week = get_current_week_label()

    # 현재 주차부터 미래로 8주까지 조회
    future_weeks = get_future_week_labels(8)

    last_exclude_week = None
    for week_label in future_weeks:
        ws = (
            db.query(WeeklyStatus)
            .filter(
                WeeklyStatus.member_id == member_id,
                WeeklyStatus.week_label == week_label,
                WeeklyStatus.status == "exclude"
            )
            .first()
        )
        if ws:
            last_exclude_week = week_label
        else:
            break

    return {"last_week_label": last_exclude_week}


@router.put("/{member_id}")
def update_status(member_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    from datetime import date

    # consecutive_weeks 검증
    num_weeks = body.consecutive_weeks or 1
    if num_weeks < 1 or num_weeks > 8:
        raise HTTPException(status_code=400, detail="consecutive_weeks must be 1-8")

    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")

    # week_start가 제공되면 해당 날짜부터, 아니면 현재 주차부터
    if body.week_start:
        start_monday = date.fromisoformat(body.week_start)
        start_iso = start_monday.isocalendar()
        start_week_label = f"{start_iso[0]}-W{start_iso[1]:02d}"

        # start_monday부터 N주까지의 week_label 생성
        week_labels = []
        for i in range(num_weeks):
            target_date = start_monday + timedelta(weeks=i)
            iso = target_date.isocalendar()
            week_labels.append(f"{iso[0]}-W{iso[1]:02d}")
    else:
        # 현재 주차부터 N주까지
        week_labels = get_future_week_labels(num_weeks)

    now_iso = datetime.now().isoformat()

    # 각 주차에 대해 WeeklyStatus 생성/업데이트
    for week_label in week_labels:
        ws = (
            db.query(WeeklyStatus)
            .filter(
                WeeklyStatus.member_id == member_id,
                WeeklyStatus.week_label == week_label,
            )
            .first()
        )
        if ws:
            ws.status = body.status
            ws.exclude_reason = body.exclude_reason
            ws.exclude_reason_detail = body.exclude_reason_detail
        else:
            ws = WeeklyStatus(
                member_id=member_id,
                week_label=week_label,
                status=body.status,
                exclude_reason=body.exclude_reason,
                exclude_reason_detail=body.exclude_reason_detail,
                created_at=now_iso,
            )
            db.add(ws)

    db.commit()

    # 마지막 제외 주차 계산
    last_week_label = week_labels[-1] if week_labels else None

    return {
        "success": True,
        "weeks_processed": num_weeks,
        "member_name": member.name,
        "last_week_label": last_week_label
    }
