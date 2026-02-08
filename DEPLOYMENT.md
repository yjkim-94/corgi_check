# 🚀 Corgi Check 배포 가이드

무료 호스팅으로 운영 가능한 배포 방법 안내

## 📋 배포 개요

- **Frontend**: Vercel (무료)
- **Backend**: Render 또는 Railway (무료 플랜)
- **Database**: SQLite (Backend와 함께 볼륨 마운트)
- **총 비용**: $0/월

## 🎯 사전 준비

### 1. GitHub 저장소 생성
```bash
cd corgi_check
git init
git add .
git commit -m "feat: Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/corgi-check.git
git push -u origin main
```

### 2. Gmail OAuth 설정

정산 기능 사용 시 필요:

1. [Google Cloud Console](https://console.cloud.google.com/) 접속
2. 프로젝트 생성 → "Corgi Check"
3. API 및 서비스 → 라이브러리 → "Gmail API" 검색 및 활성화
4. 사용자 인증 정보 → OAuth 2.0 클라이언트 ID 생성
   - 애플리케이션 유형: **웹 애플리케이션**
   - 승인된 리디렉션 URI 추가 (배포 후 설정):
     - `https://YOUR-BACKEND-URL.onrender.com/api/admin/gmail/callback`
     - `https://YOUR-BACKEND-URL.up.railway.app/api/admin/gmail/callback`
5. JSON 다운로드 → `client_secret.json` 저장
6. JSON 내용을 한 줄로 압축 (나중에 환경변수로 사용):
```bash
cat client_secret.json | tr -d '\n'
```

---

## 🖥️ Backend 배포 (Render)

### 옵션 1: Render (추천)

**장점**: SQLite 볼륨 지원, 무료 플랜 (750시간/월)

#### 1. Render 계정 생성
- [render.com](https://render.com) 가입 (GitHub 연동)

#### 2. New Web Service 생성
- **Connect Repository**: GitHub에서 `corgi-check` 선택
- **Name**: `corgi-check-backend`
- **Region**: Singapore (가까운 지역)
- **Branch**: `main`
- **Root Directory**: `backend`
- **Runtime**: `Python 3`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- **Plan**: `Free`

#### 3. 환경변수 설정
- `PYTHON_VERSION`: `3.11.0`
- `CLIENT_SECRET_JSON`: (압축한 client_secret.json 내용)

#### 4. Disk 추가 (SQLite 저장용)
- Dashboard → Disks → Add Disk
- **Name**: `corgi-db`
- **Mount Path**: `/opt/render/project/src`
- **Size**: 1GB (무료)

#### 5. 배포 확인
- Deploy 완료 후 URL 복사: `https://corgi-check-backend.onrender.com`

---

### 옵션 2: Railway

**장점**: 간편한 설정, $5 무료 크레딧

#### 1. Railway 계정 생성
- [railway.app](https://railway.app) 가입

#### 2. New Project
- **Deploy from GitHub repo** → `corgi-check` 선택
- **Root Directory**: `backend`

#### 3. 설정
- Settings → **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Variables → 추가:
  - `PYTHON_VERSION`: `3.11`
  - `CLIENT_SECRET_JSON`: (압축한 JSON)

#### 4. Volume 추가
- New → Volume
- **Mount Path**: `/app`
- 프로젝트에 연결

---

## 🌐 Frontend 배포 (Vercel)

**장점**: 무료, 자동 빌드, CDN, HTTPS

### 1. Vercel 계정 생성
- [vercel.com](https://vercel.com) 가입 (GitHub 연동)

### 2. New Project
- **Import Git Repository** → `corgi-check` 선택
- **Root Directory**: `frontend`
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`

### 3. 환경변수 설정
- Settings → Environment Variables:
  - `VITE_API_URL`: `https://corgi-check-backend.onrender.com`

### 4. 배포 확인
- Deploy 완료 후 URL 복사: `https://corgi-check.vercel.app`

---

## ⚙️ 배포 후 설정

### 1. CORS 업데이트
`backend/app/main.py`:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://corgi-check.vercel.app",  # 실제 Vercel URL로 변경
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 2. Gmail OAuth 리디렉션 URI 업데이트
Google Cloud Console → OAuth 2.0 클라이언트 ID:
- 승인된 리디렉션 URI 추가:
  - `https://corgi-check-backend.onrender.com/api/admin/gmail/callback`

### 3. 재배포
```bash
git add .
git commit -m "fix: Update CORS and OAuth redirect URI for production"
git push origin main
```

Render/Railway는 자동으로 재배포됩니다.

---

## 🔧 초기 설정 (배포 후)

### 1. 애플리케이션 접속
`https://corgi-check.vercel.app` 접속

### 2. 관리자 설정
- 관리자 메뉴 → 비밀번호 설정
- 운영진 이름 설정
- Gmail 연동 (OAuth 인증)

### 3. 멤버 등록
- 인원 관리 → 멤버 추가
- 또는 CSV Import 스크립트 실행:
```bash
# 로컬에서 실행 (Backend URL 환경변수 설정 필요)
cd backend
export API_URL=https://corgi-check-backend.onrender.com
python import_csv.py
```

---

## 📊 모니터링 및 유지보수

### Render
- Dashboard에서 로그 확인
- Free 플랜: 15분 비활성 시 sleep (첫 요청 시 재시작)

### Vercel
- Deployments → 빌드 로그 확인
- Analytics (무료) 사용 가능

### Railway
- Deployment Logs 확인
- $5 크레딧 소진 시 서비스 중지 (매월 리셋)

---

## 🛠️ 트러블슈팅

### Backend가 Sleep 상태
- **문제**: Render Free 플랜은 15분 비활성 시 sleep
- **해결**: UptimeRobot 등으로 5분마다 Health Check (`GET /api/auth/check`)

### CORS 에러
- **문제**: Frontend에서 Backend API 호출 실패
- **해결**: `backend/app/main.py`의 `allow_origins`에 Vercel URL 추가

### SQLite DB 초기화됨
- **문제**: Render/Railway 재배포 시 DB 삭제
- **해결**: Disk/Volume 마운트 확인 (`/opt/render/project/src` 또는 `/app`)

### Gmail OAuth 에러
- **문제**: Redirect URI 불일치
- **해결**: Google Cloud Console에서 배포 URL 추가

### 환경변수 읽기 실패
- **문제**: `client_secret.json` 파일 없음
- **해결**: `CLIENT_SECRET_JSON` 환경변수를 파일로 저장하도록 코드 수정:
```python
# backend/app/services/gmail.py
import os
import json

def get_credentials_path():
    secret_json = os.getenv("CLIENT_SECRET_JSON")
    if secret_json:
        with open("/tmp/client_secret.json", "w") as f:
            f.write(secret_json)
        return "/tmp/client_secret.json"
    return "client_secret.json"
```

---

## 💰 비용 예상

### 무료 플랜으로 운영 시
- **Vercel**: 무료 (대역폭 100GB/월, 빌드 6000분/월)
- **Render**: 무료 (750시간/월, 1GB 디스크)
- **Railway**: $5 무료 크레딧/월
- **Google Cloud**: OAuth만 사용 시 무료

**총 비용**: $0/월 (소규모 모임 운영 충분)

### 유료 전환 시 (24/7 운영)
- **Render Starter**: $7/월
- **Railway Hobby**: $5/월 (크레딧 초과 시)
- **Vercel Pro**: $20/월 (선택)

---

## 🔐 보안 권장사항

1. **비밀번호 강화**: 최소 12자 이상
2. **Gmail OAuth**: 필요시에만 연동 (정산 기능)
3. **환경변수**: `client_secret.json` 노출 방지
4. **HTTPS**: Vercel/Render 기본 제공
5. **CORS**: 정확한 도메인만 허용

---

## 📱 업데이트 및 배포

### 코드 변경 시
```bash
git add .
git commit -m "feat: 새 기능 추가"
git push origin main
```

- **Vercel**: 자동 배포 (1분 이내)
- **Render/Railway**: 자동 배포 (5분 이내)

### DB 마이그레이션 필요 시
1. Render Dashboard → Shell 접속
2. `python migrate_add_certified_at.py` 실행

---

## ✅ 체크리스트

배포 전:
- [ ] GitHub 저장소 생성 및 Push
- [ ] Gmail OAuth 클라이언트 ID 생성
- [ ] `client_secret.json` 내용 압축

Backend 배포:
- [ ] Render/Railway 서비스 생성
- [ ] 환경변수 설정 (`CLIENT_SECRET_JSON`)
- [ ] Disk/Volume 마운트
- [ ] 배포 완료 및 URL 확인

Frontend 배포:
- [ ] Vercel 프로젝트 생성
- [ ] 환경변수 설정 (`VITE_API_URL`)
- [ ] 배포 완료 및 URL 확인

배포 후:
- [ ] CORS 설정 업데이트
- [ ] Gmail OAuth 리디렉션 URI 추가
- [ ] 관리자 비밀번호 설정
- [ ] Gmail 연동
- [ ] 멤버 등록
- [ ] 첫 정산 테스트

---

## 📞 문의

배포 관련 이슈는 GitHub Issues에 등록해주세요.
