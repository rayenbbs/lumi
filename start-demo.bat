@echo off
echo =============================================
echo    LUMI - AI Study Companion
echo =============================================
echo.

:: Check if Ollama is running
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo [1/3] Starting Ollama...
    start "" ollama serve
    timeout /t 3 /nobreak >nul
) else (
    echo [1/3] Ollama already running.
)

:: Start MCP server
echo [2/3] Starting MCP course server...
start "Lumi MCP Server" cmd /k "cd mcp-server && node index.js"
timeout /t 2 /nobreak >nul

:: Start Lumi
echo [3/3] Starting Lumi app...
npm run dev

echo.
echo Done! Lumi is running.
pause
