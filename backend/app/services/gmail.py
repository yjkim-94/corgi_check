import os
import json
import base64
import tempfile
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from sqlalchemy.orm import Session
from app.models import AppConfig

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
CLIENT_SECRETS_FILE = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    "client_secret.json",
)
REDIRECT_URI = "http://localhost:8000/api/admin/gmail/callback"


def _get_config(db: Session, key: str):
    config = db.query(AppConfig).filter(AppConfig.key == key).first()
    return config.value if config else None


def _set_config(db: Session, key: str, value: str):
    config = db.query(AppConfig).filter(AppConfig.key == key).first()
    if config:
        config.value = value
    else:
        config = AppConfig(key=key, value=value)
        db.add(config)
    db.commit()


def get_auth_url() -> str:
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES, redirect_uri=REDIRECT_URI
    )
    auth_url, _ = flow.authorization_url(
        access_type="offline", prompt="consent"
    )
    return auth_url


def handle_callback(code: str, db: Session) -> bool:
    flow = Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES, redirect_uri=REDIRECT_URI
    )
    flow.fetch_token(code=code)
    creds = flow.credentials
    token_data = {
        "token": creds.token,
        "refresh_token": creds.refresh_token,
        "token_uri": creds.token_uri,
        "client_id": creds.client_id,
        "client_secret": creds.client_secret,
        "scopes": creds.scopes,
    }
    _set_config(db, "gmail_token", json.dumps(token_data))
    return True


def _get_credentials(db: Session):
    token_json = _get_config(db, "gmail_token")
    if not token_json:
        return None
    token_data = json.loads(token_json)
    creds = Credentials(
        token=token_data["token"],
        refresh_token=token_data.get("refresh_token"),
        token_uri=token_data["token_uri"],
        client_id=token_data["client_id"],
        client_secret=token_data["client_secret"],
        scopes=token_data.get("scopes"),
    )
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        creds.refresh(Request())
        token_data["token"] = creds.token
        _set_config(db, "gmail_token", json.dumps(token_data))
    return creds


def is_connected(db: Session) -> bool:
    return _get_config(db, "gmail_token") is not None


def find_latest_chat_mail(db: Session):
    creds = _get_credentials(db)
    if not creds:
        return None
    service = build("gmail", "v1", credentials=creds)
    results = service.users().messages().list(
        userId="me", q='subject:"Kakaotalk_Chat"', maxResults=1
    ).execute()
    messages = results.get("messages", [])
    if not messages:
        return None
    msg_id = messages[0]["id"]
    message = service.users().messages().get(
        userId="me", id=msg_id, format="full"
    ).execute()
    return message


def download_attachment(db: Session, message) -> str:
    creds = _get_credentials(db)
    service = build("gmail", "v1", credentials=creds)
    parts = message.get("payload", {}).get("parts", [])
    for part in parts:
        filename = part.get("filename", "")
        if filename.endswith(".zip"):
            att_id = part["body"].get("attachmentId")
            if att_id:
                att = service.users().messages().attachments().get(
                    userId="me", messageId=message["id"], id=att_id
                ).execute()
                data = base64.urlsafe_b64decode(att["data"])
                tmp_dir = tempfile.mkdtemp()
                zip_path = os.path.join(tmp_dir, filename)
                with open(zip_path, "wb") as f:
                    f.write(data)
                return zip_path
    return ""
