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

    # 토큰 만료 시 자동 갱신 시도
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request
        from google.auth.exceptions import RefreshError
        try:
            print("Access token expired. Attempting to refresh...")
            creds.refresh(Request())
            # 갱신 성공 시 새 토큰 저장
            token_data["token"] = creds.token
            _set_config(db, "gmail_token", json.dumps(token_data))
            print("Token refreshed successfully.")
        except RefreshError as e:
            # Refresh token이 만료되거나 취소된 경우
            print(f"Failed to refresh token: {e}")
            print("Refresh token has expired or been revoked. Clearing stored token.")
            # 저장된 토큰 삭제 (재인증 필요)
            _set_config(db, "gmail_token", "")
            return None

    return creds


def is_connected(db: Session) -> bool:
    token = _get_config(db, "gmail_token")
    return token is not None and token != ""


def find_latest_chat_mail(db: Session):
    from google.auth.exceptions import RefreshError
    from googleapiclient.errors import HttpError

    print("=== find_latest_chat_mail START ===")
    creds = _get_credentials(db)
    if not creds:
        print("ERROR: No credentials available")
        return None

    print(f"Credentials loaded: token={creds.token[:20] if creds.token else 'None'}..., refresh_token={'exists' if creds.refresh_token else 'None'}")
    print(f"Token expired: {creds.expired}, Valid: {creds.valid}")

    try:
        print("Building Gmail service...")
        service = build("gmail", "v1", credentials=creds)

        print("Searching for emails with subject:Kakaotalk_Chat")
        results = service.users().messages().list(
            userId="me", q='subject:"Kakaotalk_Chat"', maxResults=1
        ).execute()

        messages = results.get("messages", [])
        print(f"Found {len(messages)} messages")

        if not messages:
            print("No messages found. Trying broader search...")
            # 더 넓은 검색 시도
            results2 = service.users().messages().list(
                userId="me", q='subject:Kakaotalk OR subject:KakaoTalk', maxResults=5
            ).execute()
            messages2 = results2.get("messages", [])
            print(f"Broader search found {len(messages2)} messages")

            if messages2:
                print("Found messages with broader search. Returning first one.")
                msg_id = messages2[0]["id"]
                message = service.users().messages().get(
                    userId="me", id=msg_id, format="full"
                ).execute()
                # 제목 출력
                headers = message.get("payload", {}).get("headers", [])
                subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "Unknown")
                print(f"Email subject: {subject}")
                return message

            return None

        msg_id = messages[0]["id"]
        print(f"Getting message {msg_id}...")
        message = service.users().messages().get(
            userId="me", id=msg_id, format="full"
        ).execute()

        # 제목 출력
        headers = message.get("payload", {}).get("headers", [])
        subject = next((h["value"] for h in headers if h["name"].lower() == "subject"), "Unknown")
        print(f"Email subject: {subject}")
        print("=== find_latest_chat_mail SUCCESS ===")
        return message

    except (RefreshError, HttpError) as e:
        print(f"Gmail API error: {e}")
        print(f"Error type: {type(e)}")
        # 인증 에러인 경우 토큰 삭제
        if isinstance(e, RefreshError) or (isinstance(e, HttpError) and e.resp.status == 401):
            print("Authentication failed. Clearing stored token.")
            _set_config(db, "gmail_token", "")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        print(f"Error type: {type(e)}")
        import traceback
        traceback.print_exc()
        return None


def download_attachment(db: Session, message) -> str:
    from google.auth.exceptions import RefreshError
    from googleapiclient.errors import HttpError

    creds = _get_credentials(db)
    if not creds:
        return ""

    try:
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
    except (RefreshError, HttpError) as e:
        print(f"Gmail API error: {e}")
        # 인증 에러인 경우 토큰 삭제
        if isinstance(e, RefreshError) or (isinstance(e, HttpError) and e.resp.status == 401):
            print("Authentication failed. Clearing stored token.")
            _set_config(db, "gmail_token", "")
        return ""
