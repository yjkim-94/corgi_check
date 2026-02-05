from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models import Member

router = APIRouter()


class MemberCreate(BaseModel):
    name: str
    birth_year: Optional[int] = None


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    birth_year: Optional[int] = None


class MemberLeave(BaseModel):
    left_date: str
    left_reason: str


@router.get("")
def get_members(include_left: bool = False, db: Session = Depends(get_db)):
    query = db.query(Member)
    if not include_left:
        query = query.filter(Member.is_active == True)
    members = query.order_by(Member.name).all()
    return [
        {
            "id": m.id,
            "name": m.name,
            "birth_date": m.birth_date,
            "is_active": m.is_active,
            "left_date": m.left_date,
            "left_reason": m.left_reason,
            "created_at": m.created_at,
        }
        for m in members
    ]


@router.post("")
def create_member(body: MemberCreate, db: Session = Depends(get_db)):
    member = Member(
        name=body.name,
        birth_date=str(body.birth_year) if body.birth_year else None,
        created_at=datetime.now().isoformat(),
    )
    db.add(member)
    db.commit()
    db.refresh(member)
    return {"id": member.id, "name": member.name}


@router.put("/{member_id}")
def update_member(member_id: int, body: MemberUpdate, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")
    if body.name is not None:
        member.name = body.name
    if body.birth_year is not None:
        member.birth_date = str(body.birth_year)
    db.commit()
    return {"success": True}


@router.put("/{member_id}/leave")
def leave_member(member_id: int, body: MemberLeave, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")
    member.is_active = False
    member.left_date = body.left_date
    member.left_reason = body.left_reason
    db.commit()
    return {"success": True}


@router.put("/{member_id}/return")
def return_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")
    member.is_active = True
    # 탈퇴 이력은 유지 (left_date, left_reason 그대로)
    db.commit()
    return {"success": True}


@router.delete("/{member_id}")
def delete_member(member_id: int, db: Session = Depends(get_db)):
    member = db.query(Member).filter(Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="member_not_found")
    from app.models import WeeklyStatus
    db.query(WeeklyStatus).filter(WeeklyStatus.member_id == member_id).delete()
    db.delete(member)
    db.commit()
    return {"success": True}
