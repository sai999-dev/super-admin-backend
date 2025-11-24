#!/bin/bash
# Quick script to restart the backend server

echo "🛑 Stopping existing server..."
pkill -f "node.*server.js" || echo "No server process found"

sleep 2

echo "🚀 Starting server..."
cd "$(dirname "$0")"
node server.js


