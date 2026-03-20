"""
MCP Server — ESB Learning TP Agents
=====================================
Standalone MCP (Model Context Protocol) server that exposes TP agent tools.

This server implements the MCP specification (https://modelcontextprotocol.io)
and can be connected to by any MCP-compatible client (LangChain, Claude, etc.).

Usage (standalone, outside Flask):
    python -m app.services.tp_mcp_server

Usage (from within Flask app context) — tools are called directly via mcp_tools.py.

Protocol: stdio (default) or HTTP/SSE (set MCP_TRANSPORT=sse)
"""

import asyncio
import json
import logging
import sys
import os
from typing import Any

logger = logging.getLogger(__name__)


# ─── MCP Server Implementation ────────────────────────────────────────────────

MCP_SERVER_NAME = "esb-tp-agent"
MCP_SERVER_VERSION = "1.0.0"

# Tool registry — maps tool name → handler function
TOOL_REGISTRY: dict[str, Any] = {}


def mcp_tool(name: str):
    """Decorator to register a function as an MCP tool."""
    def decorator(fn):
        TOOL_REGISTRY[name] = fn
        return fn
    return decorator


# ─── Tool Handlers ────────────────────────────────────────────────────────────

@mcp_tool("get_section_context")
def handle_get_section_context(section_id: int, **kwargs) -> dict:
    """Retrieve course content context for a section."""
    # Import Flask app context
    _init_flask_context()
    from app.services.mcp_tools import get_section_context
    return get_section_context(section_id)


@mcp_tool("generate_tp_statement")
def handle_generate_tp_statement(context: str, language: str, hint: str = "", **kwargs) -> dict:
    """Generate a TP statement from course context."""
    _init_flask_context()
    from app.services.mcp_tools import generate_tp_statement
    return generate_tp_statement(context=context, language=language, hint=hint)


@mcp_tool("suggest_aa_codes")
def handle_suggest_aa_codes(section_id: int, statement: str, **kwargs) -> dict:
    """Suggest AA codes for a TP statement."""
    _init_flask_context()
    from app.services.mcp_tools import suggest_aa_codes
    return suggest_aa_codes(section_id=section_id, statement=statement)


@mcp_tool("generate_reference_solution")
def handle_generate_reference_solution(
    statement: str, language: str, max_grade: float = 20.0, **kwargs
) -> dict:
    """Generate reference solution and evaluation criteria."""
    _init_flask_context()
    from app.services.mcp_tools import generate_reference_solution
    return generate_reference_solution(statement=statement, language=language, max_grade=max_grade)


@mcp_tool("auto_correct_submission")
def handle_auto_correct_submission(
    statement: str,
    reference_solution: str,
    student_code: str,
    language: str,
    correction_criteria: str = "",
    max_grade: float = 20.0,
    **kwargs,
) -> dict:
    """Auto-correct a student code submission."""
    _init_flask_context()
    from app.services.mcp_tools import auto_correct_submission
    return auto_correct_submission(
        statement=statement,
        reference_solution=reference_solution,
        student_code=student_code,
        language=language,
        correction_criteria=correction_criteria,
        max_grade=max_grade,
    )


@mcp_tool("propose_grade")
def handle_propose_grade(correction_report: str, max_grade: float = 20.0, **kwargs) -> dict:
    """Propose a grade based on the correction report."""
    _init_flask_context()
    from app.services.mcp_tools import propose_grade
    return propose_grade(correction_report=correction_report, max_grade=max_grade)


# ─── Flask context helper ─────────────────────────────────────────────────────

_app = None

def _init_flask_context():
    """Initialize Flask app context when running as standalone server."""
    global _app
    if _app is None:
        # Add project root to path
        project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from app import create_app
        _app = create_app()
        _app.app_context().push()


# ─── MCP Protocol (stdio transport) ──────────────────────────────────────────

class MCPStdioServer:
    """
    Minimal MCP server implementing the stdio transport.
    Handles: initialize, tools/list, tools/call
    """

    def __init__(self):
        from app.services.mcp_tools import MCP_TOOL_DEFINITIONS
        self.tools = MCP_TOOL_DEFINITIONS

    def handle_request(self, request: dict) -> dict:
        method = request.get("method", "")
        req_id = request.get("id")
        params = request.get("params", {})

        try:
            if method == "initialize":
                return self._respond(req_id, {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": MCP_SERVER_NAME,
                        "version": MCP_SERVER_VERSION,
                    },
                })

            elif method == "tools/list":
                return self._respond(req_id, {"tools": self.tools})

            elif method == "tools/call":
                tool_name = params.get("name", "")
                tool_args = params.get("arguments", {})
                handler = TOOL_REGISTRY.get(tool_name)
                if not handler:
                    return self._error(req_id, -32601, f"Tool not found: {tool_name}")
                result = handler(**tool_args)
                return self._respond(req_id, {
                    "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, indent=2)}]
                })

            elif method == "notifications/initialized":
                return None  # No response for notifications

            else:
                return self._error(req_id, -32601, f"Method not found: {method}")

        except Exception as e:
            logger.error(f"MCP handler error: {e}", exc_info=True)
            return self._error(req_id, -32603, str(e))

    def _respond(self, req_id, result: dict) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    def _error(self, req_id, code: int, message: str) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

    def run(self):
        """Run the MCP server over stdio (JSON-RPC 2.0 line-delimited)."""
        logger.info(f"MCP Server '{MCP_SERVER_NAME}' v{MCP_SERVER_VERSION} starting (stdio)")
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                response = self.handle_request(request)
                if response is not None:
                    print(json.dumps(response, ensure_ascii=False), flush=True)
            except json.JSONDecodeError as e:
                error = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}
                print(json.dumps(error), flush=True)


# ─── Entry point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    server = MCPStdioServer()
    server.run()
