#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push

echo "Seeding database..."
npx prisma db seed

echo "Starting server..."
npm run dev &
SERVER_PID=$!

echo "Waiting for server..."
for i in $(seq 1 60); do
  if wget -qO- "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "Warming up pages (first compile — please wait)..."
wget -qO- "http://127.0.0.1:3000/" >/dev/null 2>&1 || true
wget -qO- "http://127.0.0.1:3000/dashboard" >/dev/null 2>&1 || true
wget -qO- "http://127.0.0.1:3000/request-service" >/dev/null 2>&1 || true

echo "App ready at http://localhost:3000"
wait $SERVER_PID
