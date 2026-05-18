#!/bin/sh
set -e

echo "Applying database schema..."
npx prisma db push

echo "Seeding database..."
npx prisma db seed

echo "Starting production server..."
npm run start &
SERVER_PID=$!

echo "Waiting for server to be ready..."
for i in $(seq 1 60); do
  if wget -qO- "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo "Server is up."
    break
  fi
  sleep 2
done

echo "App ready at http://localhost:3000"
wait $SERVER_PID
