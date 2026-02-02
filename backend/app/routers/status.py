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


class StatusUpdate(BaseModel):
    status: str
    exclude_reason: Optional[str] = None
    exclude_reason_detail: Optional[str] = None


@router.get("/current")
def get_current_status(db: Session = Depends(get_db)):
    week_label = get_current_week_label()
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
            "week_display": get_week_display_label(),
        })
    return result


@router.put("/{member_id}")
def update_status(member_id: int, body: StatusUpdate, db: Session = Depends(get_db)):
    week_label = get_current_week_label()
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")

    ws = (
        db.query(WeeklyStatus)
        .filter(
            WeeklyStatus.member_id == member_id,
            WeeklyStatus.week_label == week_label,
        )
        .first()
    )
    now = datetime.now().isoformat()
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
            created_at=now,
        )
        db.add(ws)
    db.commit()
    return {"success": True}
