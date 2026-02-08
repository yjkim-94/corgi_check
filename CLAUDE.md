# CLAUDE.md - Corgi Check

웰시코기 운동 인증 모임 관리 웹 애플리케이션

## 일반 지침
- 커밋 메시지: 30줄 이내, 한글 작성
- 모든 대답: 한국어 (전문 용어는 번역 안 함)
- 코드 주석: 한글
- 특수문자 지양 (인코딩 문제)

## 프로젝트 개요
Gmail에서 카카오톡 채팅 내보내기를 파싱하여 주간 정산 자동화, 멤버 상태 관리

## 기술 스택
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: FastAPI + SQLAlchemy + SQLite
- Auth: Google OAuth 2.0 (Gmail API)
- 배포: Vercel (Frontend) + Render/Railway (Backend)

## 핵심 기능

### 1. 연속 제외 처리
- 데이터 책임: 주차 단위 상태 저장, 연속 구간은 조회 시 계산
- 주차별 사유 보존: 덮어쓰지 않고 누적 가능
- 부분 해제: 중간 주차 변경 시 자동 분할
- 제외 해제 시 이후 연속 구간 일괄 해제

### 2. 정산 자동화
- Gmail에서 "Kakaotalk_Chat" 메일 자동 검색
- ZIP 첨부파일 다운로드 및 TXT 파싱
- 사진 4장 이상 → 인증, 미만 → 벌점
- 생년→가나다 순 정렬 (2000년대생 대응)
- 인증 날짜/시간 기록 (YY-MM-DD HH:MM)

### 3. CSV Import
- 구글 스프레드시트 직접 다운로드 (`gviz/tq?tqx=out:csv&sheet=26년`)
- 멤버 및 주차별 상태 일괄 업데이트

## DB 스키마

### members
- id, name, birth_date (YY or YYYY-MM-DD), is_active, left_date, left_reason

### weekly_status
- id, member_id, week_label (ISO week: 2026-W05)
- status (injeung/exclude/fine/penalty)
- exclude_reason, exclude_reason_detail
- certified_date (YY-MM-DD), certified_at (HH:MM)

### weekly_summary
- week_label (UNIQUE), summary_text

### app_config
- key (admin_password, manager_name, gmail_token), value

## API 주요 엔드포인트

### Status
- `GET /api/status/current?week_start=YYYY-MM-DD` → 주차별 상태 + exclude_end_label
- `PUT /api/status/{id}` → 상태 변경 (consecutive_weeks 지원)
- `GET /api/status/{id}/exclude-end` → 연속 제외 종료 주차

### Admin
- `POST /api/admin/settlement` → 정산 실행 (Gmail 파싱)
- `POST /api/admin/mid-settlement` → 중간정산 (벌점 대상자)
- `POST /api/admin/reset` → 전체 데이터 초기화

### History
- `GET /api/history/weeks` → 정산 완료 주차 목록
- `GET /api/history/{week_label}` → 주차별 상세 (certified_date, certified_at 포함)

## 개발 명령어

```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev

# DB 마이그레이션
cd backend
python migrate_add_certified_at.py

# CSV Import
cd backend
python import_csv.py
```

## 배포 가이드

### Frontend (Vercel)
- Build: `npm run build`
- Output: `dist`
- Environment Variables: `VITE_API_URL=https://your-backend.com`

### Backend (Render / Railway)
- Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Disk/Volume 마운트 필요 (SQLite DB 영구 저장)
- 환경변수: `client_secret.json` 내용을 JSON 문자열로 설정
- Gmail OAuth Redirect URI: `https://your-backend.com/api/admin/gmail/callback`

## 주요 설계 원칙

### 연속 제외 로직
1. 저장: 주차 단위로만 상태 저장
2. 조회: 서버가 연속 구간 계산 (`calc_exclude_end`)
3. 사유: 주차별 보존, 절대 덮어쓰지 않음 (consecutive_weeks > 1일 때)
4. 해제: 제외→인증/벌금 변경 시 이후 연속 구간 모두 해제

### 정산 메시지 정렬
- 2자리 생년을 4자리로 변환 (00-29 → 2000-2029, 30-99 → 1930-1999)
- 생년 오름차순 → 가나다순

### 인증 시간 추출
- 정규식: `(\d{4})\. (\d{1,2})\. (\d{1,2})\. (\d{2}):(\d{2}), (.+?) : 사진 (\d+)장`
- 마지막 인증 날짜/시간 저장 (status == "injeung"일 때만)

## 파일 구조
```
backend/
  app/
    routers/status.py     # 연속 제외 로직
    routers/admin.py      # 정산 및 정렬
    services/chat_parser.py  # 카카오톡 파싱
  import_csv.py           # 구글 시트 import
  migrate_add_certified_at.py  # DB 마이그레이션
frontend/
  src/pages/
    StatusPage.tsx        # 인증 현황
    HistoryPage.tsx       # 과거 내역 (certified_date/at 표시)
corgi_check.db            # SQLite DB
```

## 트러블슈팅

### SQLite 컬럼 없음 에러
→ `python migrate_add_certified_at.py` 실행

### 구글 시트 다운로드 실패
→ "링크가 있는 사용자에게 공개" 설정 확인

### 정산 시 멤버 매칭 안 됨
→ 닉네임 패턴 확인 (`extract_name_from_nickname` 함수)

### 2000년대생 정렬 오류
→ `sort_by_birth_name` 함수가 00-29를 2000-2029로 변환하는지 확인
