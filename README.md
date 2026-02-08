# 🐶 Corgi Check

웰시코기 운동 인증 모임의 주간 인증 관리 웹 애플리케이션

## 주요 기능

### 📊 인증 현황 관리
- 주차별 멤버 상태 관리 (인증/제외/벌금)
- 제외 사유 설정 (질병, 여행, 출장, 부상, 수술, 직접쓰기)
- 연속 제외 처리 (1~8주, 여행은 1~2주)
- 제외 종료 주차 자동 계산 및 표시
- 생년→가나다 순 정렬 (2000년대생 대응)

### 📧 자동 정산
- Gmail에서 카카오톡 채팅 내보내기 파일 자동 파싱
- 사진 인증 개수 집계 (4장 이상 인증)
- 정산 메시지 자동 생성 및 복사
- 중간정산 기능 (벌점 대상자 알림)

### 📜 과거 내역
- 연도/월/주차별 정산 내역 조회
- 인증 날짜 및 시간 기록
- 멤버별 상태 및 사유 히스토리

### 👥 인원 관리
- 멤버 추가/수정/탈퇴 관리
- 탈퇴 사유 및 날짜 기록
- 재가입 처리
- CSV import 지원 (구글 스프레드시트)

### ⚙️ 관리자 기능
- 비밀번호 보호
- Gmail OAuth 연동
- 운영진 이름 설정
- 전체 데이터 초기화

## 기술 스택

### Frontend
- **React** + **TypeScript** + **Vite**
- **Tailwind CSS** (웰시코기 테마)
- 반응형 디자인 (모바일/데스크탑)

### Backend
- **FastAPI** (Python)
- **SQLAlchemy** ORM
- **SQLite** (경량 단일 파일 DB)
- **Google OAuth 2.0** (Gmail API)

## 로컬 실행

### 1. 환경 설정

```bash
# Backend
cd backend
pip install -r requirements.txt

# Frontend
cd frontend
npm install
```

### 2. Gmail OAuth 설정 (선택)

정산 기능 사용 시 필요:
1. [Google Cloud Console](https://console.cloud.google.com/) 에서 프로젝트 생성
2. Gmail API 활성화
3. OAuth 2.0 클라이언트 ID 생성 (웹 애플리케이션)
4. `backend/client_secret.json` 파일 저장
5. 리디렉션 URI: `http://localhost:8000/api/admin/gmail/callback`

### 3. 서버 실행

```bash
# Backend (터미널 1)
cd backend
uvicorn app.main:app --reload --port 8000

# Frontend (터미널 2)
cd frontend
npm run dev
```

브라우저에서 `http://localhost:5173` 접속

### 4. DB 마이그레이션 (최초 1회)

```bash
cd backend
python migrate_add_certified_at.py
```

## 사용 방법

### 초기 설정
1. 관리자 메뉴에서 비밀번호 설정
2. 운영진 이름 설정
3. Gmail 연동 (정산 기능 사용 시)
4. 인원 관리에서 멤버 등록

### 주간 정산
1. 카카오톡 채팅방에서 "채팅 내보내기" → Gmail로 전송
2. 인증 현황 → 주차 선택 → 정산 실행
3. 생성된 메시지 복사 → 카카오톡 공지

### CSV Import
1. 구글 스프레드시트 작성 (형식: `import_csv.py` 참고)
2. `backend/import_csv.py` 실행
3. 자동으로 멤버 및 주차별 상태 업데이트

## 프로젝트 구조

```
corgi_check/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 엔트리포인트
│   │   ├── models.py            # SQLAlchemy ORM 모델
│   │   ├── routers/             # API 라우터
│   │   └── services/            # Gmail, 정산 로직
│   ├── requirements.txt
│   ├── import_csv.py            # CSV import 스크립트
│   └── migrate_add_certified_at.py
├── frontend/
│   ├── src/
│   │   ├── pages/               # 페이지 컴포넌트
│   │   ├── api/                 # API 클라이언트
│   │   └── App.tsx
│   ├── tailwind.config.js       # 웰시코기 테마
│   └── package.json
└── corgi_check.db               # SQLite DB
```

## 배포

### Backend (Render / Railway)
- Python 3.11+
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- 환경변수: `client_secret.json` 내용을 JSON 문자열로 설정

### Frontend (Vercel / Netlify)
- Node.js 18+
- Build Command: `npm run build`
- Output Directory: `dist`
- API Base URL 환경변수 설정

### 주의사항
- SQLite DB는 볼륨 마운트 필요 (Render Disk / Railway Volume)
- Gmail OAuth 리디렉션 URI를 배포 URL로 업데이트

## 라이선스

MIT License

## 개발자

Claude Code + YJ Kim
