from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import WeeklyStatus, WeeklySummary, Member

router = APIRouter()


@router.get("/weeks")
def get_weeks(db: Session = Depends(get_db)):
    rows = (
        db.query(WeeklySummary.week_label)
        .order_by(WeeklySummary.week_label.desc())
        .all()
    )
    return [r[0] for r in rows]


@router.get("/{week_label}")
def get_week_detail(week_label: str, db: Session = Depends(get_db)):
    summary = (
        db.query(WeeklySummary)
        .filter(WeeklySummary.week_label == week_label)
        .first()
    )
    if not summary:
        raise HTTPException(status_code=404, detail="week_not_found")

    statuses = (
        db.query(WeeklyStatus)
        .filter(WeeklyStatus.week_label == week_label)
        .all()
    )
    members_map = {}
    member_ids = [s.member_id for s in statuses]
    if member_ids:
        members = db.query(Member).filter(Member.id.in_(member_ids)).all()
        members_map = {m.id: m for m in members}

    data = []
    for s in statuses:
        m = members_map.get(s.member_id)
        data.append({
            "name": m.name if m else "unknown",
            "birth_date": m.birth_date if m else None,
            "status": s.status,
            "exclude_reason": s.exclude_reason,
            "exclude_reason_detail": s.exclude_reason_detail,
        })

    return {
        "week_label": week_label,
        "summary_text": summary.summary_text,
        "members": data,
    }
