#!/usr/bin/env bash
# GradeGuide AI - start both servers on macOS/Linux:   bash start-mac-linux.sh   (Ctrl+C stops both)
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/backend"
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt --quiet
[ -f .env ] || cp .env.example .env
.venv/bin/python -m uvicorn main:app --reload --port 8000 &
BACK=$!
cd "$ROOT/frontend"
[ -d node_modules ] || npm install
trap 'kill $BACK 2>/dev/null' EXIT
npm run dev
