#!/bin/bash
set -e

echo "============================================="
echo "   LUMI - AI Study Companion"
echo "============================================="

# Check / start Ollama
if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "[1/3] Starting Ollama..."
    ollama serve &
    sleep 3
else
    echo "[1/3] Ollama already running."
fi

# Start MCP server in background
echo "[2/3] Starting MCP course server..."
cd mcp-server && node index.js &
MCP_PID=$!
cd ..
sleep 1

# Start Lumi
echo "[3/3] Starting Lumi..."
npm run dev

# Cleanup on exit
trap "kill $MCP_PID 2>/dev/null" EXIT
