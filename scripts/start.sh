#!/bin/bash
# Starts the Shadow Tasks backend + frontend and opens it in your browser.
# Safe to run more than once - it won't start duplicate servers.

set -u
ROOT="/Users/hdahneem/Desktop/Solo Leveling App"
RUN_DIR="$ROOT/scripts/.run"
mkdir -p "$RUN_DIR"

# Double-clicking the .app in Finder launches this script via launchd, which
# only provides a bare-bones PATH (/usr/bin:/bin:/usr/sbin:/sbin) - it does NOT
# load ~/.zshrc or ~/.zprofile, so nvm-installed node/npm/npx are invisible.
# Explicitly add the known node/homebrew locations before anything else runs.
NVM_NODE_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort -V | tail -n 1)
export PATH="$NVM_NODE_BIN:/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$PATH"

BACKEND_PORT=4000
FRONTEND_PORT=5555
APP_URL="http://localhost:$FRONTEND_PORT"

notify() {
  osascript -e "display notification \"$1\" with title \"Shadow Tasks\"" >/dev/null 2>&1
}

port_responds() {
  curl -s -o /dev/null -m 2 "http://localhost:$1" 2>/dev/null
}

kill_stale_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    sleep 1
    kill -9 "$pid" 2>/dev/null
  fi
}

wait_for_port() {
  local port="$1"
  local tries=30
  while [ $tries -gt 0 ]; do
    if port_responds "$port"; then
      return 0
    fi
    sleep 1
    tries=$((tries - 1))
  done
  return 1
}

# --- Backend ---
if port_responds "$BACKEND_PORT"; then
  echo "Backend already running on $BACKEND_PORT"
else
  kill_stale_port "$BACKEND_PORT"
  cd "$ROOT/backend" || exit 1
  nohup npm run dev > "$RUN_DIR/backend.log" 2>&1 &
  echo $! > "$RUN_DIR/backend.pid"
  echo "Starting backend (pid $!)..."
fi

# --- Frontend ---
if port_responds "$FRONTEND_PORT"; then
  echo "Frontend already running on $FRONTEND_PORT"
else
  kill_stale_port "$FRONTEND_PORT"
  cd "$ROOT/app" || exit 1
  nohup npx vite --port "$FRONTEND_PORT" --strictPort > "$RUN_DIR/frontend.log" 2>&1 &
  echo $! > "$RUN_DIR/frontend.pid"
  echo "Starting frontend (pid $!)..."
fi

notify "Starting up..."

if wait_for_port "$FRONTEND_PORT"; then
  notify "Ready - opening in your browser."
  open "$APP_URL"
else
  notify "Something went wrong starting the app. Check scripts/.run/*.log"
fi
