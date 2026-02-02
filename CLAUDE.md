# CLAUDE.md - Corgi Check Web App

이 파일은 Corgi Check 프로젝트의 Claude Code 지침입니다.

## 대답 지시사항
1. 모든 대답은 한국어로 하세요.
2. 전문 용어는 번역하지 마세요.
3. 코드 작성 시 특수문자는 지양하세요. *인코딩 문제

## 프로젝트 개요

웰시코기 운동 인증 모임의 주간 인증 관리 웹 애플리케이션입니다.
Gmail에서 인증 메일을 파싱하여 주간 정산을 자동화하고, 멤버 상태/벌금/제외 사유를 관리합니다.

## 기술 스택

- **Frontend**: React + TypeScript + Vite
- **UI**: Tailwind CSS + Headless UI
- **Backend**: FastAPI (Python)
- **DB**: SQLite (경량 단일 파일 DB)
- **인증**: Google OAuth 2.0 (Gmail API)
- **배포**: 추후 결정

## 디자인 가이드

- 색상 테마: 웰시코기 Orange (#E8751A), Black (#1A1A1A), White (#FFFFFF)
- 반응형: 모바일 가로 스크롤 또는 카드형 전환
- 컴포넌트: Tailwind CSS + Headless UI (Modal, Select 등)

## 프로젝트 구조

```
corgi_check/
  backend/
    app/
      main.py            # FastAPI 엔트리포인트
      config.py          # 설정 (DB 경로, 시크릿 등)
      models.py          # SQLAlchemy ORM 모델
      database.py        # DB 연결 및 세션
      routers/
        auth.py          # 비밀번호 인증 API
        status.py        # 인증 현황 API
        history.py       # 과거 인증 내역 API
        members.py       # 인원 관리 API
        admin.py         # 관리자 메뉴 API
      services/
        gmail.py         # Gmail OAuth + 메일 파싱
        settlement.py    # 정산 로직
    requirements.txt
  frontend/
    src/
      components/        # 공통 컴포넌트
      pages/
        StatusPage.tsx   # 인증 현황
        HistoryPage.tsx  # 과거 인증 내역
        MembersPage.tsx  # 인원 관리
        AdminPage.tsx    # 관리자 메뉴
      api/               # API 호출 함수
      App.tsx
      main.tsx
    tailwind.config.js
    package.json
  corgi_check.db         # SQLite DB 파일
```

## DB 스키마

### members 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| name | TEXT NOT NULL | 이름 |
| birth_date | TEXT | 생년월일 (YYYY-MM-DD) |
| is_active | BOOLEAN | 활동 여부 (기본 true) |
| left_date | TEXT | 탈퇴 날짜 |
| left_reason | TEXT | 탈퇴 사유 |
| created_at | TEXT | 등록일 |

### weekly_status 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| member_id | INTEGER FK | members.id 참조 |
| week_label | TEXT | 주차 라벨 (예: 2026-W05) |
| status | TEXT | 인증 / 제외 / 벌금 |
| exclude_reason | TEXT | 제외 사유 (질병, 여행, 출장, 부상, 수술, 직접쓰기) |
| exclude_reason_detail | TEXT | 직접쓰기 상세 내용 |
| created_at | TEXT | 생성일 |

### weekly_summary 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | INTEGER PK | 고유 ID |
| week_label | TEXT UNIQUE | 주차 라벨 |
| summary_text | TEXT | 생성된 안내 문구 |
| created_at | TEXT | 생성일 |

### app_config 테이블
| 컬럼 | 타입 | 설명 |
|------|------|------|
| key | TEXT PK | 설정 키 |
| value | TEXT | 설정 값 |

설정 키 목록: admin_password, manager_name, gmail_token 등

## API 엔드포인트

### 인증
- `POST /api/auth/login` - 비밀번호 확인
- `GET /api/auth/check` - 비밀번호 설정 여부 확인

### 인증 현황
- `GET /api/status/current` - 현재 주차 멤버 상태 목록
- `PUT /api/status/{member_id}` - 상태 변경

### 과거 내역
- `GET /api/history/weeks` - 주차 목록
- `GET /api/history/{week_label}` - 특정 주차 상세

### 인원 관리
- `GET /api/members` - 멤버 목록 (쿼리: include_left)
- `POST /api/members` - 멤버 추가
- `PUT /api/members/{id}` - 멤버 수정
- `PUT /api/members/{id}/leave` - 탈퇴 처리

### 관리자
- `POST /api/admin/password` - 비밀번호 설정/변경
- `PUT /api/admin/manager` - 운영진 이름 설정
- `POST /api/admin/gmail/connect` - Gmail OAuth 연결
- `POST /api/admin/settlement` - 정산 실행

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
```

## 주요 설계 결정

1. SQLite 사용: 소규모 모임 관리 앱이므로 경량 DB로 충분
2. 세션 기반 인증: JWT 대신 브라우저 세션 스토리지 활용 (단순 비밀번호 방식)
3. FastAPI: Python 기반으로 Gmail API 연동 및 텍스트 파싱에 유리
4. React + Vite: 빠른 개발 및 빌드
