"""
MCP Blueprint — /api/v1/mcp/
=============================
Exposes the ESB-Learning MCP server (21 TP + Exam tools + 12 Skills)
as production HTTP endpoints inside the main Flask application.

Endpoints
---------
POST /api/v1/mcp/          JSON-RPC 2.0 — execute any MCP tool or method
GET  /api/v1/mcp/sse       Server-Sent Events — server info + tool list
GET  /api/v1/mcp/tools     Convenience: list all registered tools (JSON)
GET  /api/v1/mcp/health    Health check (public, no auth required)

Authentication
--------------
All endpoints except /health require a valid JWT.
The caller's role (student/teacher/admin) is resolved from the JWT identity
and attached to the request context so skill handlers can enforce RBAC.

Usage from an external MCP client
----------------------------------
1. Obtain a JWT via POST /api/v1/auth/login
2. Send JSON-RPC 2.0 requests to POST /api/v1/mcp/
   with header: Authorization: Bearer <token>

SSE Discovery
-------------
  GET /api/v1/mcp/sse  →  streams two SSE events:
    event: message  data: {initialize result}
    event: message  data: {tools/list result}
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Optional

from flask import Blueprint, request, jsonify, Response, stream_with_context
from flask_jwt_extended import jwt_required, get_jwt_identity, verify_jwt_in_request

logger = logging.getLogger(__name__)

mcp_api_bp = Blueprint("mcp_api", __name__, url_prefix="/mcp")

# ── Lazy singleton for the MCP server core (shared across requests) ────────────

_server_lock = threading.Lock()
_mcp_server: Optional[object] = None


def _get_mcp_server():
    """Return (and lazily initialise) the MCPStdioServer singleton."""
    global _mcp_server
    if _mcp_server is None:
        with _server_lock:
            if _mcp_server is None:
                from app.services.mcp_server import MCPStdioServer, _register_skill_tools
                _register_skill_tools()
                _mcp_server = MCPStdioServer()
                logger.info(
                    "MCP server initialised — %d tools registered",
                    len(_mcp_server.tools),
                )
    return _mcp_server


# ── Helpers ────────────────────────────────────────────────────────────────────

def _current_user():
    """Return (user, role) for the authenticated JWT caller."""
    from app.models.users import User
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if user is None:
            return None, "student"
        if user.is_superuser:
            return user, "admin"
        if user.is_teacher:
            return user, "teacher"
        return user, "student"
    except (ValueError, TypeError):
        return None, "student"


def _inject_caller_context(body: dict, user, role: str) -> dict:
    """
    For tools/call requests, inject user_id and role into arguments
    so skill handlers receive them without requiring the client to send them.
    """
    if body.get("method") != "tools/call":
        return body
    params = body.get("params", {})
    args = params.get("arguments", {})
    if user and "user_id" not in args:
        args["user_id"] = user.id
    if "role" not in args:
        args["role"] = role
    params["arguments"] = args
    body = {**body, "params": params}
    return body


# ══════════════════════════════════════════════════════════════════════════════
# Routes
# ══════════════════════════════════════════════════════════════════════════════

@mcp_api_bp.route("/health", methods=["GET"])
def health():
    """Public health check — no authentication required."""
    try:
        srv = _get_mcp_server()
        return jsonify({
            "status": "ok",
            "server": "esb-learning-ai",
            "version": "2.0.0",
            "transport": "http",
            "tools_count": len(srv.tools),
        })
    except Exception as exc:
        logger.error("MCP health check error: %s", exc)
        return jsonify({"status": "error", "message": str(exc)}), 500


@mcp_api_bp.route("/", methods=["POST"])
@jwt_required()
def mcp_jsonrpc():
    """
    JSON-RPC 2.0 endpoint.

    Accepts a single request object or a batch array.
    Returns the JSON-RPC response (or 204 for notifications).
    """
    user, role = _current_user()

    try:
        body = request.get_json(force=True, silent=True)
    except Exception:
        body = None

    if body is None:
        return jsonify({
            "jsonrpc": "2.0", "id": None,
            "error": {"code": -32700, "message": "Parse error: invalid JSON"},
        }), 400

    srv = _get_mcp_server()

    # ── Batch request (array) ──
    if isinstance(body, list):
        responses = []
        for item in body:
            item = _inject_caller_context(item, user, role)
            resp = srv.handle_request(item)
            if resp is not None:
                responses.append(resp)
        if not responses:
            return "", 204
        return jsonify(responses)

    # ── Single request ──
    body = _inject_caller_context(body, user, role)
    response = srv.handle_request(body)
    if response is None:
        return "", 204
    return jsonify(response)


@mcp_api_bp.route("/sse", methods=["GET"])
def mcp_sse():
    """
    Server-Sent Events endpoint for MCP discovery.

    Streams:
      1. initialize result  (server capabilities)
      2. tools/list result  (all registered tools)

    JWT is read from query param ?token= or Authorization header
    (SSE does not allow custom headers in browsers).
    """
    # Allow token via query string for browser SSE clients
    token = request.args.get("token")
    if token:
        # Validate manually when token comes via query param
        try:
            from flask_jwt_extended import decode_token
            decode_token(token)
        except Exception as exc:
            return jsonify({"error": f"Invalid token: {exc}"}), 401
    else:
        try:
            verify_jwt_in_request()
        except Exception as exc:
            return jsonify({"error": f"Unauthorized: {exc}"}), 401

    srv = _get_mcp_server()

    def _stream():
        # Event 1 — initialize
        init_payload = json.dumps({
            "jsonrpc": "2.0", "id": "sse-init",
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "esb-learning-ai", "version": "2.0.0"},
            },
        }, ensure_ascii=False)
        yield f"event: message\ndata: {init_payload}\n\n"

        # Event 2 — tools/list
        tools_payload = json.dumps({
            "jsonrpc": "2.0", "id": "sse-tools",
            "result": {"tools": srv.tools},
        }, ensure_ascii=False)
        yield f"event: message\ndata: {tools_payload}\n\n"

        # Keep-alive ping every 15 s so proxies don't close the connection
        import time
        while True:
            time.sleep(15)
            yield ": ping\n\n"

    return Response(
        stream_with_context(_stream()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",   # Disable Nginx buffering
        },
    )


@mcp_api_bp.route("/tools", methods=["GET"])
@jwt_required()
def list_tools():
    """Convenience endpoint — returns all tools as a plain JSON array."""
    srv = _get_mcp_server()
    return jsonify({
        "tools": srv.tools,
        "count": len(srv.tools),
    })
