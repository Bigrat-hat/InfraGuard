#!/bin/bash
# InfraGuard Frontend Start Script

cd "$(dirname "$0")/infraguard/frontend"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting InfraGuard frontend on http://localhost:3000"
npm start
