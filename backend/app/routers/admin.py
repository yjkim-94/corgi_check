import os
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import AppConfig, Member, WeeklyStatus
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

    lines = []
    lines.append(f"집계 기간: {_format_date(start)} ~ {_format_date(end)}")
    lines.append("")
    lines.append(
        f"총 인원: {total}명, "
        f"인증 인원: {len(injeung_list)}명, "
        f"미인증 인원: {len(fine_list)}명, "
        f"인증 제외 인원: {len(exclude_list)}명"
    )
    lines.append("")

    if exclude_list:
        names = []
        for r in exclude_list:
            label = r["birth_prefix"] + r["name"]
            reason = EXCLUDE_LABELS.get(r["exclude_reason"], r.get("exclude_reason_detail") or "")
            if reason:
                label += f"({reason})"
            names.append(label)
        lines.append(f"인증 제외 인원 ({len(exclude_list)}명): {', '.join(names)}")
    else:
        lines.append("인증 제외 인원이 없습니다.")
    lines.append("")

    if fine_list:
        names = [r["birth_prefix"] + r["name"] for r in fine_list]
        lines.append(f"벌금 납부 인원 ({len(fine_list)}명): {', '.join(names)}")
    else:
        lines.append("벌금 납부 인원이 없습니다.")
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

    fine_members = [r for r in results if r["status"] == "fine"]
    names = [r["birth_prefix"] + r["name"] for r in fine_members]

    lines = []
    lines.append("[알림] 태그되신 분들은 현재 시간 기준 아직 인증이 되지 않았거나 벌금을 납부하지 않은 것으로 확인 됩니다. 오늘 자정까지 늦지 않게 인증 또는 증빙 또는 벌금 납부 해주시기 바랍니다 ~")
    lines.append(", ".join(names))

    return {"summary": "\n".join(lines)}
