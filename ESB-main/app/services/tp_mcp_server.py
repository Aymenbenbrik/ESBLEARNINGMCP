"""
tp_mcp_server.py — Compatibility shim.

The unified MCP server now lives in mcp_server.py.
This module re-exports everything so existing imports keep working.

    python -m app.services.tp_mcp_server   # still works
    python -m app.services.mcp_server      # preferred
"""
# Re-export entire public surface of the unified server
from app.services.mcp_server import (  # noqa: F401
    MCP_SERVER_NAME,
    MCP_SERVER_VERSION,
    TOOL_REGISTRY,
    mcp_tool,
    MCPStdioServer,
    MCPHttpServer,
    _get_all_tool_definitions,
    _register_skill_tools,
    _init_flask_context,
)

# Allow `python -m app.services.tp_mcp_server` to launch the server
if __name__ == "__main__":
    import runpy
    runpy.run_module("app.services.mcp_server", run_name="__main__", alter_sys=True)
