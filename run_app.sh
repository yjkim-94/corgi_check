#!/bin/bash

# Corgi Check 로컬 실행 스크립트

echo "🐶 Corgi Check 시작 중..."

# Conda 환경 활성화
echo "🔧 Conda 환경 활성화..."
eval "$(conda shell.bash hook)"
conda activate corgi_check

# Backend 실행 (백그라운드)
echo "📦 Backend 시작..."
cd backend
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

# Frontend 실행 대기 (Backend 초기화 시간)
sleep 3

# Frontend 실행 (백그라운드)
echo "🌐 Frontend 시작..."
cd frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ Corgi Check 실행 완료!"
echo "📍 Frontend: http://localhost:5173"
echo "📍 Backend:  http://localhost:8000"
echo ""
echo "종료하려면 Ctrl+C를 누르세요"

# Ctrl+C 트랩 설정 (종료 시 프로세스 정리)
trap "echo ''; echo '🛑 Corgi Check 종료 중...'; kill $BACKEND_PID $FRONTEND_PID; exit" INT

# 대기 (프로세스 유지)
wait
