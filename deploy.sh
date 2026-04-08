#!/bin/bash

echo "🚀 Starting Deployment Process..."

# 1. 최신 코드 가져오기
echo "📥 Pulling latest changes from GitHub..."
git pull

# 2. 의존성 설치
echo "📦 Installing dependencies..."
npm install

# 3. 프론트엔드 빌드 (dist 폴더 생성)
echo "🏗️ Building frontend..."
npm run build

# 4. 기존 서버 프로세스 종료 및 재시작 (PM2)
echo "🔄 Restarting PM2 process..."
# 기존에 my-app 이라는 이름으로 돌고 있다면 삭제
pm2 delete my-app 2>/dev/null || true

# 통합 서버 실행 (3000번 포트)
pm2 start server/index.js --name "my-app"

# 상태 저장
pm2 save

echo "✅ Deployment Successful! Check http://YOUR_LIGHTSAIL_IP:3000"
