#!/bin/bash

echo "🚀 Starting Deployment Process on OCI..."

# 1. 최신 코드 가져오기
echo "📥 Pulling latest changes from GitHub..."
git pull origin main

# 2. 의존성 설치
echo "📦 Installing dependencies..."
npm install

# 3. 프론트엔드 빌드 (dist 폴더 생성)
echo "🏗️ Building frontend..."
npm run build

# 4. 서버 프로세스 재시작 (PM2)
echo "🔄 Restarting PM2 process..."
# ai-bongchae 라는 이름으로 재시작 시도, 없으면 새로 시작
pm2 restart ai-bongchae || pm2 start server/index.js --name "ai-bongchae"

# 상태 저장
pm2 save

echo "✅ Deployment Successful! Check http://152.69.239.188:3000"
