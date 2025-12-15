#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

echo "=== Starting Proxx Development Environment ==="
echo ""
echo "Backend: http://127.0.0.1:8000"
echo "Frontend: Electron window will open"
echo ""
echo "Press Ctrl+C to stop both services"
echo ""

# Start backend in background
echo "Starting backend..."
cd backend
./run_dev.sh &
BACKEND_PID=$!

# Wait for backend to be ready
sleep 2

# Start frontend
echo "Starting frontend..."
cd ../frontend
npm run dev &
FRONTEND_PID=$!

# Wait for both processes
wait $BACKEND_PID $FRONTEND_PID
