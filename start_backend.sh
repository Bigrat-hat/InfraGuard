#!/bin/bash
# InfraGuard Backend Start Script
# NOTE: iptables and smartctl require sudo/root privileges

cd "$(dirname "$0")/backend"

if [ ! -d "venv" ]; then
  echo "Creating virtual environment..."
  python3 -m venv venv
fi

source venv/bin/activate
pip install -r requirements.txt -q

echo "Starting InfraGuard backend on http://localhost:8080"
echo "API docs available at http://localhost:8080/docs"
uvicorn main:app --host 0.0.0.0 --port 8080 --reload
