from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AppConfig

router = APIRouter()


class LoginRequest(BaseModel):
    password: str


@router.get("/check")
def check_password_exists(db: Session = Depends(get_db)):
    config = db.query(AppConfig).filter(AppConfig.key == "admin_password").first()
    return {"exists": config is not None and config.value is not None}


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    config = db.query(AppConfig).filter(AppConfig.key == "admin_password").first()
    if not config or not config.value:
        raise HTTPException(status_code=400, detail="password_not_set")
    if req.password != config.value:
        raise HTTPException(status_code=401, detail="invalid_password")
    return {"success": True}
