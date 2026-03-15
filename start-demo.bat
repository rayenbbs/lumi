@echo off
echo =============================================
echo    LUMI - AI Study Companion
echo =============================================
echo.

:: 1. Check Python dependencies
echo [1/4] Checking Python dependencies...
py -m pip show mediapipe >nul 2>&1
if %errorlevel% neq 0 (
    echo       Installing Python packages...
    py -m pip install mediapipe opencv-python websockets numpy --quiet
)

:: 2. Start Driver State Detection (camera + fatigue/gaze tracking)
echo [2/4] Starting Driver State Detection server (port 8000)...
start "Lumi Driver State" cmd /k "cd Driver-State-Detection\driver_state_detection && py main.py --debug"
timeout /t 2 /nobreak >nul

:: 3. Start MCP server (PDF syllabus search)
echo [3/4] Starting MCP course server (port 3001)...
start "Lumi MCP Server" cmd /k "cd mcp-server && node index.js"
timeout /t 2 /nobreak >nul

:: 4. Start Lumi Electron app
echo [4/4] Starting Lumi app...
npm run dev

echo.
echo Done! Lumi is running.
pause
