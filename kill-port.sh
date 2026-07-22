#!/usr/bin/env bash

set -euo pipefail

port="${1:-}"

if [[ -z "$port" ]]; then
  read -r -p "Port to kill: " port
fi

if ! [[ "$port" =~ ^[0-9]+$ ]] || (( port < 1 || port > 65535 )); then
  echo "Error: enter a valid port number between 1 and 65535."
  exit 1
fi

pids="$(lsof -ti :"$port" || true)"

if [[ -z "$pids" ]]; then
  echo "No process found on port $port."
  exit 0
fi

echo "Killing process(es) on port $port: $pids"
kill $pids

sleep 1

remaining="$(lsof -ti :"$port" || true)"

if [[ -n "$remaining" ]]; then
  echo "Force killing remaining process(es): $remaining"
  kill -9 $remaining
fi

echo "Done."
