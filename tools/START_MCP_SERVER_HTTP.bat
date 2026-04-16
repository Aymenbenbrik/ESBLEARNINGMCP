@echo off
REM ============================================================
REM  ESB-Learning — Standalone MCP HTTP/SSE Server
REM  Exposes all 21 MCP tools + 12 Skills over HTTP on port 5100
REM
REM  Use this when you need a standalone MCP endpoint (e.g. for
REM  external MCP clients like Claude Desktop, Cursor, etc.).
REM
REM  For production use, the MCP server is already embedded inside
REM  the main Flask app at:  POST /api/v1/mcp/
REM
REM  Endpoints (standalone mode):
REM    POST http://localhost:5100/mcp         JSON-RPC 2.0
REM    GET  http://localhost:5100/mcp/sse     SSE discovery
REM    GET  http://localhost:5100/health      Health check
REM ============================================================

echo.
echo  =========================================
echo   ESB-Learning MCP Server (HTTP/SSE mode)
echo  =========================================
echo.

REM Move to project root
cd /d "%~dp0.."

REM Activate virtual environment
IF EXIST "venv\Scripts\activate.bat" (
    call venv\Scripts\activate.bat
) ELSE IF EXIST ".venv\Scripts\activate.bat" (
    call .venv\Scripts\activate.bat
) ELSE (
    echo [WARN] No venv found — using system Python
)

REM Transport and port (override via env)
IF "%MCP_TRANSPORT%"=="" SET MCP_TRANSPORT=sse
IF "%MCP_PORT%"==""      SET MCP_PORT=5100
IF "%MCP_HOST%"==""      SET MCP_HOST=0.0.0.0

echo  Transport : %MCP_TRANSPORT%
echo  Address   : http://%MCP_HOST%:%MCP_PORT%
echo  Endpoints :
echo    POST  /mcp       (JSON-RPC 2.0)
echo    GET   /mcp/sse   (SSE discovery)
echo    GET   /health    (health check)
echo.
echo  Press Ctrl+C to stop.
echo.

python -m app.services.mcp_server

pause
