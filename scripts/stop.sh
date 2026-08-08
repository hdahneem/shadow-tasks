#!/bin/bash
# Stops the Shadow Tasks backend + frontend dev servers.

set -u
ROOT="/Users/hdahneem/Desktop/Solo Leveling App"
RUN_DIR="$ROOT/scripts/.run"

BACKEND_PORT=4000
FRONTEND_PORT=5555

notify() {
  osascript -e "display notification \"$1\" with title \"Shadow Tasks\"" >/dev/null 2>&1
}

kill_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null)
  if [ -n "$pid" ]; then
    kill "$pid" 2>/dev/null
    sleep 1
    kill -9 "$pid" 2>/dev/null
    return 0
  fi
  return 1
}

stopped_any=0
if kill_port "$BACKEND_PORT"; then stopped_any=1; fi
if kill_port "$FRONTEND_PORT"; then stopped_any=1; fi

rm -f "$RUN_DIR/backend.pid" "$RUN_DIR/frontend.pid"

if [ "$stopped_any" = "1" ]; then
  notify "Shadow Tasks stopped."
else
  notify "Shadow Tasks wasn't running."
fi
