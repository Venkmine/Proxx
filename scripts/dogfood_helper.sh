#!/bin/bash
# Dogfooding diagnostic helper
# Quick commands for common dogfooding tasks

set -e

BACKEND_URL="http://127.0.0.1:8085"
FRONTEND_URL="http://localhost:3000"

function print_header() {
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo " $1"
  echo "═══════════════════════════════════════════════════════════"
}

function check_backend() {
  print_header "Backend Health Check"
  if curl -s "$BACKEND_URL/health" > /dev/null; then
    echo "✅ Backend is running at $BACKEND_URL"
    echo "   Response: $(curl -s $BACKEND_URL/health)"
  else
    echo "❌ Backend is NOT running"
    echo "   Start with: cd backend && ./run_dev.sh"
    exit 1
  fi
}

function check_frontend() {
  print_header "Frontend Check"
  # Try to detect if frontend is running (this is approximate)
  if curl -s "$FRONTEND_URL" > /dev/null 2>&1; then
    echo "✅ Frontend appears to be running at $FRONTEND_URL"
  else
    echo "⚠️  Cannot reach frontend at $FRONTEND_URL"
    echo "   Start with: cd frontend && npm run dev"
  fi
}

function list_jobs() {
  print_header "Current Jobs"
  JOBS=$(curl -s "$BACKEND_URL/control/jobs" | python3 -m json.tool 2>/dev/null || echo "[]")
  JOB_COUNT=$(echo "$JOBS" | python3 -c "import sys, json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  
  if [ "$JOB_COUNT" -eq "0" ]; then
    echo "No jobs in queue"
  else
    echo "Total jobs: $JOB_COUNT"
    echo ""
    echo "$JOBS" | python3 -c "
import sys, json
jobs = json.load(sys.stdin)
for job in jobs:
    status = job.get('status', 'unknown').upper()
    total = job.get('total_tasks', 0)
    completed = job.get('completed_count', 0)
    failed = job.get('failed_count', 0)
    job_id = job.get('id', 'unknown')[:8]
    
    print(f'• Job {job_id}... | {status:20} | {completed}/{total} done, {failed} failed')
" 2>/dev/null || echo "Could not parse jobs"
  fi
}

function clear_jobs() {
  print_header "Clear All Jobs"
  echo "⚠️  This will DELETE ALL jobs in the queue."
  read -p "Are you sure? (yes/no): " confirm
  
  if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
  fi
  
  JOBS=$(curl -s "$BACKEND_URL/control/jobs")
  echo "$JOBS" | python3 -c "
import sys, json
jobs = json.load(sys.stdin)
for job in jobs:
    job_id = job.get('id')
    print(f'Deleting job {job_id[:8]}...')
" 2>/dev/null
  
  echo ""
  echo "Deletion must be done via UI or API (no bulk delete endpoint)"
  echo "Go to frontend and delete manually, or use API:"
  echo "  curl -X DELETE $BACKEND_URL/control/jobs/{JOB_ID}"
}

function show_test_media() {
  print_header "Test Media Status"
  DOGFOOD_DIR="/Users/leon.grant/projects/Proxx/test_media/dogfood"
  
  if [ ! -d "$DOGFOOD_DIR" ]; then
    echo "❌ Dogfood directory not found: $DOGFOOD_DIR"
    echo "   Run: ./scripts/prepare_dogfood_media.sh"
    exit 1
  fi
  
  echo "📁 $DOGFOOD_DIR"
  echo ""
  
  # Check for expected files
  declare -a expected_files=(
    "short_h264.mp4"
    "long_form.mov"
    "external_volume.mp4"
  )
  
  for file in "${expected_files[@]}"; do
    if [ -f "$DOGFOOD_DIR/$file" ]; then
      size=$(ls -lh "$DOGFOOD_DIR/$file" | awk '{print $5}')
      echo "   ✅ $file ($size)"
    else
      echo "   ❌ $file (missing)"
    fi
  done
  
  echo ""
  
  # Check directories
  declare -a expected_dirs=(
    "multi_clip_folder"
    "mixed_resolution"
    "broken_paths"
    "empty"
  )
  
  for dir in "${expected_dirs[@]}"; do
    if [ -d "$DOGFOOD_DIR/$dir" ]; then
      count=$(find "$DOGFOOD_DIR/$dir" -type f | wc -l | tr -d ' ')
      echo "   ✅ $dir/ ($count files)"
    else
      echo "   ❌ $dir/ (missing)"
    fi
  done
  
  echo ""
  echo "See $DOGFOOD_DIR/README.md for setup instructions"
}

function show_backend_logs() {
  print_header "Recent Backend Logs (last 50 lines)"
  LOG_FILE="/Users/leon.grant/projects/Proxx/backend/backend.log"
  
  if [ -f "$LOG_FILE" ]; then
    tail -n 50 "$LOG_FILE"
  else
    echo "Log file not found: $LOG_FILE"
  fi
}

function show_state_diagram() {
  print_header "Job State Transitions (Backend Truth)"
  cat << 'EOF'
PENDING
  ├─→ RUNNING (start)
  ├─→ FAILED (engine error)
  └─→ CANCELLED (operator cancel)

RUNNING
  ├─→ PAUSED (operator pause)
  ├─→ COMPLETED (all tasks done, no failures)
  ├─→ COMPLETED_WITH_WARNINGS (all tasks done, some failed/skipped/warned)
  ├─→ FAILED (engine error)
  └─→ CANCELLED (operator cancel)

PAUSED
  ├─→ RUNNING (operator resume)
  ├─→ FAILED (engine error)
  └─→ CANCELLED (operator cancel)

RECOVERY_REQUIRED (process restarted mid-job)
  ├─→ RUNNING (operator resume)
  └─→ CANCELLED (operator cancel)

COMPLETED, COMPLETED_WITH_WARNINGS, FAILED, CANCELLED
  └─→ (terminal states, no transitions)

Task States:
  QUEUED → RUNNING → {COMPLETED | FAILED | SKIPPED}
  FAILED → QUEUED (retry)
EOF
}

function usage() {
  cat << EOF
Dogfooding Diagnostic Helper

Usage:
  $0 <command>

Commands:
  check           Check backend & frontend health
  jobs            List all current jobs
  clear           Clear all jobs (interactive)
  media           Show test media status
  logs            Show recent backend logs
  states          Show state transition diagram
  help            Show this help message

Examples:
  $0 check        # Quick health check before starting tests
  $0 jobs         # See current queue state
  $0 media        # Verify test media is ready
  $0 logs         # Debug backend issues
  $0 states       # Reference for state transitions

EOF
}

# Main command router
case "${1:-}" in
  check)
    check_backend
    check_frontend
    ;;
  jobs)
    check_backend
    list_jobs
    ;;
  clear)
    check_backend
    clear_jobs
    ;;
  media)
    show_test_media
    ;;
  logs)
    show_backend_logs
    ;;
  states)
    show_state_diagram
    ;;
  help|--help|-h)
    usage
    ;;
  *)
    echo "Error: Unknown command '${1:-}'"
    echo ""
    usage
    exit 1
    ;;
esac
