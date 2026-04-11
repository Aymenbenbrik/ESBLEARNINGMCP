"""
MCP Server — ESB Learning Unified AI Tools
============================================
Unified MCP (Model Context Protocol) server that exposes ALL AI tools:
  - TP Agent tools (mcp_tools.py)
  - Exam Agent tools (exam_mcp_tools.py)
  - SkillManager skills (skill_manager.py)

Usage (standalone):
    python -m app.services.mcp_server

Protocol: stdio (default) or HTTP/SSE (set MCP_TRANSPORT=sse)
"""

import asyncio
import json
import logging
import sys
import os
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

MCP_SERVER_NAME = "esb-learning-ai"
MCP_SERVER_VERSION = "2.0.0"

# ─── Tool Registry ─────────────────────────────────────────────────────────────
TOOL_REGISTRY: Dict[str, Any] = {}


def mcp_tool(name: str):
    """Decorator to register a function as an MCP tool."""
    def decorator(fn):
        TOOL_REGISTRY[name] = fn
        return fn
    return decorator


# ─── Flask context ──────────────────────────────────────────────────────────────
_app = None


def _init_flask_context():
    """Initialize Flask app context when running as standalone server."""
    global _app
    if _app is None:
        project_root = os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        )
        if project_root not in sys.path:
            sys.path.insert(0, project_root)
        from app import create_app
        _app = create_app()
        _app.app_context().push()


# ═══════════════════════════════════════════════════════════════════════════════
# TP Tool Handlers  (9 tools from mcp_tools.MCP_TOOL_DEFINITIONS)
# ═══════════════════════════════════════════════════════════════════════════════

@mcp_tool("get_section_context")
def handle_get_section_context(section_id: int, **kwargs) -> dict:
    """Retrieve course content context for a section."""
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
    statement: str, language: str, max_grade: float = 20.0, **kwargs,
) -> dict:
    """Generate reference solution and evaluation criteria."""
    _init_flask_context()
    from app.services.mcp_tools import generate_reference_solution
    return generate_reference_solution(
        statement=statement, language=language, max_grade=max_grade,
    )


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


@mcp_tool("parse_tp_questions")
def handle_parse_tp_questions(
    statement: str, language: str, max_grade: float = 20.0, **kwargs,
) -> dict:
    """Parse a TP statement and extract structured questions."""
    _init_flask_context()
    from app.services.mcp_tools import parse_tp_questions
    return parse_tp_questions(statement=statement, language=language, max_grade=max_grade)


@mcp_tool("generate_question_starter")
def handle_generate_question_starter(question_text: str, language: str, **kwargs) -> dict:
    """Generate question as code comments plus starter code template."""
    _init_flask_context()
    from app.services.mcp_tools import generate_question_starter
    return generate_question_starter(question_text=question_text, language=language)


@mcp_tool("chat_with_student")
def handle_chat_with_student(
    question_text: str,
    language: str,
    student_message: str,
    conversation_history: list = None,
    student_code: str = "",
    **kwargs,
) -> dict:
    """Socratic chatbot that guides students without giving direct answers."""
    _init_flask_context()
    from app.services.mcp_tools import chat_with_student
    return chat_with_student(
        question_text=question_text,
        language=language,
        student_message=student_message,
        conversation_history=conversation_history,
        student_code=student_code,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Exam Tool Handlers  (10 tools from exam_mcp_tools.EXAM_MCP_TOOL_DEFINITIONS)
# ═══════════════════════════════════════════════════════════════════════════════

@mcp_tool("extract_exam_text")
def handle_extract_exam_text(file_path: str, **kwargs) -> dict:
    """Extract raw text from an uploaded exam file."""
    _init_flask_context()
    from app.services.exam_mcp_tools import extract_exam_text
    result = extract_exam_text(file_path)
    if isinstance(result, str):
        return {"text": result}
    return result


@mcp_tool("extract_exam_questions")
def handle_extract_exam_questions(exam_text: str, language: str = "fr", **kwargs) -> dict:
    """Parse exam text and extract structured list of questions."""
    _init_flask_context()
    from app.services.exam_mcp_tools import extract_exam_questions
    questions = extract_exam_questions(exam_text=exam_text, language=language)
    return {"questions": questions}


@mcp_tool("classify_questions_aa")
def handle_classify_questions_aa(questions: list, aa_list: list, **kwargs) -> dict:
    """Classify each question against course AA codes."""
    _init_flask_context()
    from app.services.exam_mcp_tools import classify_questions_aa
    result = classify_questions_aa(questions=questions, aa_list=aa_list)
    return {"questions": result}


@mcp_tool("classify_questions_bloom")
def handle_classify_questions_bloom(questions: list, **kwargs) -> dict:
    """Classify each question by Bloom's Taxonomy level."""
    _init_flask_context()
    from app.services.exam_mcp_tools import classify_questions_bloom
    result = classify_questions_bloom(questions=questions)
    return {"questions": result}


@mcp_tool("assess_question_difficulty")
def handle_assess_question_difficulty(
    questions: list, course_context: str = "", **kwargs,
) -> dict:
    """Assess difficulty of each question relative to course content."""
    _init_flask_context()
    from app.services.exam_mcp_tools import assess_question_difficulty
    result = assess_question_difficulty(questions=questions, course_context=course_context)
    return {"questions": result}


@mcp_tool("compare_module_vs_exam")
def handle_compare_module_vs_exam(
    questions: list, aa_list: list, course_context: str = "", **kwargs,
) -> dict:
    """Compare module content distribution vs exam content."""
    _init_flask_context()
    from app.services.exam_mcp_tools import compare_module_vs_exam
    return compare_module_vs_exam(
        questions=questions, aa_list=aa_list, course_context=course_context,
    )


@mcp_tool("generate_exam_feedback")
def handle_generate_exam_feedback(
    comparison_report: dict, questions: list, **kwargs,
) -> dict:
    """Generate pedagogical feedback from comparison analysis."""
    _init_flask_context()
    from app.services.exam_mcp_tools import generate_exam_feedback
    result = generate_exam_feedback(
        comparison_report=comparison_report, questions=questions,
    )
    if isinstance(result, str):
        return {"feedback": result}
    return result


@mcp_tool("suggest_exam_adjustments")
def handle_suggest_exam_adjustments(
    feedback: str, questions: list, aa_list: list, **kwargs,
) -> dict:
    """Suggest specific adjustments to improve exam balance and coverage."""
    _init_flask_context()
    from app.services.exam_mcp_tools import suggest_exam_adjustments
    adjustments = suggest_exam_adjustments(
        feedback=feedback, questions=questions, aa_list=aa_list,
    )
    return {"adjustments": adjustments}


@mcp_tool("generate_exam_latex")
def handle_generate_exam_latex(
    questions: list,
    adjustments: list = None,
    exam_title: str = "Examen Final",
    course_name: str = "Module",
    course_id: int = 0,
    **kwargs,
) -> dict:
    """Generate a LaTeX exam document and compile to PDF."""
    _init_flask_context()
    from app.services.exam_mcp_tools import generate_exam_latex
    return generate_exam_latex(
        questions=questions,
        adjustments=adjustments or [],
        exam_title=exam_title,
        course_name=course_name,
        course_id=course_id,
    )


@mcp_tool("evaluate_exam_proposal")
def handle_evaluate_exam_proposal(
    latex_source: str, original_feedback: str = "", aa_list: list = None, **kwargs,
) -> dict:
    """Evaluate a newly generated exam proposal against pedagogical criteria."""
    _init_flask_context()
    from app.services.exam_mcp_tools import evaluate_exam_proposal
    return evaluate_exam_proposal(
        latex_source=latex_source,
        original_feedback=original_feedback,
        aa_list=aa_list or [],
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Skill Tool Handlers  (dynamically registered from SkillManager)
# ═══════════════════════════════════════════════════════════════════════════════

def _register_skill_tools():
    """Register all active SkillManager skills as MCP tools."""
    try:
        _init_flask_context()
        from app.services.skill_manager import SkillManager
        manager = SkillManager()
        skills = manager.list_skills()

        for skill in skills:
            skill_id = skill["id"]

            def _make_handler(sid):
                def handler(**kwargs):
                    _init_flask_context()
                    from app.services.skill_manager import SkillManager, SkillContext
                    mgr = SkillManager()
                    ctx = SkillContext(
                        user_id=kwargs.pop("user_id", 0),
                        course_id=kwargs.pop("course_id", None),
                        role=kwargs.pop("role", "teacher"),
                        agent_id=kwargs.pop("agent_id", "mcp"),
                    )
                    result = mgr.execute(sid, ctx, kwargs)
                    return result.to_dict()
                return handler

            TOOL_REGISTRY[f"skill_{skill_id}"] = _make_handler(skill_id)
            logger.info("Registered skill tool: skill_%s", skill_id)

    except Exception as exc:
        logger.warning("Skill tool registration skipped: %s", exc)


# ═══════════════════════════════════════════════════════════════════════════════
# Combined Tool Definitions
# ═══════════════════════════════════════════════════════════════════════════════

def _get_all_tool_definitions() -> List[Dict]:
    """Merge TP + Exam + Skill definitions into a single list."""
    all_defs: List[Dict] = []

    # TP tools
    try:
        from app.services.mcp_tools import MCP_TOOL_DEFINITIONS
        all_defs.extend(MCP_TOOL_DEFINITIONS)
    except Exception as exc:
        logger.warning("Could not load TP tool definitions: %s", exc)

    # Exam tools
    try:
        from app.services.exam_mcp_tools import EXAM_MCP_TOOL_DEFINITIONS
        all_defs.extend(EXAM_MCP_TOOL_DEFINITIONS)
    except Exception as exc:
        logger.warning("Could not load Exam tool definitions: %s", exc)

    # Skill tools (dynamic)
    try:
        _init_flask_context()
        from app.services.skill_manager import SkillManager
        manager = SkillManager()
        for skill in manager.list_skills():
            input_schema: Dict[str, Any] = {
                "type": "object",
                "properties": {
                    "user_id": {"type": "integer", "description": "User ID"},
                    "course_id": {"type": "integer", "description": "Course ID (optional)"},
                    "role": {"type": "string", "description": "User role (student|teacher)"},
                    "agent_id": {"type": "string", "description": "Agent ID"},
                },
                "additionalProperties": True,
            }
            # Merge skill's own input_schema properties if available
            if skill.get("input_schema") and isinstance(skill["input_schema"], dict):
                extra_props = skill["input_schema"].get("properties", {})
                input_schema["properties"].update(extra_props)
                extra_required = skill["input_schema"].get("required", [])
                if extra_required:
                    input_schema["required"] = extra_required

            all_defs.append({
                "name": f"skill_{skill['id']}",
                "description": skill.get("description") or skill.get("name", skill["id"]),
                "inputSchema": input_schema,
            })
    except Exception as exc:
        logger.warning("Skill tool definitions skipped: %s", exc)

    return all_defs


# ═══════════════════════════════════════════════════════════════════════════════
# MCP Protocol — stdio transport
# ═══════════════════════════════════════════════════════════════════════════════

class MCPStdioServer:
    """
    MCP server implementing the stdio transport (JSON-RPC 2.0, line-delimited).
    Handles: initialize, tools/list, tools/call, notifications/*
    """

    def __init__(self):
        self._tools: Optional[List[Dict]] = None

    @property
    def tools(self) -> List[Dict]:
        if self._tools is None:
            self._tools = _get_all_tool_definitions()
        return self._tools

    def handle_request(self, request: dict) -> Optional[dict]:
        method = request.get("method", "")
        req_id = request.get("id")
        params = request.get("params", {})

        # Notifications (no id) — never return a response
        if req_id is None and method.startswith("notifications/"):
            logger.debug("Notification received: %s", method)
            return None

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

            if method == "notifications/initialized":
                return None

            if method == "notifications/cancelled":
                logger.info("Client cancelled request %s", params.get("requestId"))
                return None

            if method == "tools/list":
                return self._respond(req_id, {"tools": self.tools})

            if method == "tools/call":
                tool_name = params.get("name", "")
                tool_args = params.get("arguments", {})
                handler = TOOL_REGISTRY.get(tool_name)
                if not handler:
                    return self._error(req_id, -32601, f"Tool not found: {tool_name}")
                result = handler(**tool_args)
                text = json.dumps(result, ensure_ascii=False, indent=2, default=str)
                return self._respond(req_id, {
                    "content": [{"type": "text", "text": text}],
                })

            return self._error(req_id, -32601, f"Method not found: {method}")

        except Exception as exc:
            logger.error("MCP handler error: %s", exc, exc_info=True)
            return self._error(req_id, -32603, str(exc))

    # ── JSON-RPC helpers ──────────────────────────────────────────────────

    @staticmethod
    def _respond(req_id, result: dict) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "result": result}

    @staticmethod
    def _error(req_id, code: int, message: str) -> dict:
        return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}

    # ── Main loop ─────────────────────────────────────────────────────────

    def run(self):
        """Run the MCP server over stdio (JSON-RPC 2.0 line-delimited)."""
        logger.info(
            "MCP Server '%s' v%s starting (stdio) — %d tools registered",
            MCP_SERVER_NAME, MCP_SERVER_VERSION, len(TOOL_REGISTRY),
        )
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            try:
                request = json.loads(line)
                response = self.handle_request(request)
                if response is not None:
                    print(json.dumps(response, ensure_ascii=False), flush=True)
            except json.JSONDecodeError as exc:
                err = {
                    "jsonrpc": "2.0",
                    "id": None,
                    "error": {"code": -32700, "message": f"Parse error: {exc}"},
                }
                print(json.dumps(err), flush=True)


# ═══════════════════════════════════════════════════════════════════════════════
# MCP Protocol — HTTP/SSE transport
# ═══════════════════════════════════════════════════════════════════════════════

class MCPHttpServer:
    """
    MCP server over HTTP with SSE support for web clients.
    Exposes a /mcp endpoint that accepts JSON-RPC POST requests
    and a /mcp/sse endpoint for Server-Sent Events streaming.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 5100):
        self.host = host
        self.port = port
        self._stdio = MCPStdioServer()

    def create_flask_app(self):
        from flask import Flask, request as flask_request, jsonify, Response

        app = Flask(__name__)

        @app.route("/mcp", methods=["POST"])
        def mcp_endpoint():
            """Handle JSON-RPC requests over HTTP POST."""
            try:
                body = flask_request.get_json(force=True)
            except Exception:
                return jsonify({
                    "jsonrpc": "2.0", "id": None,
                    "error": {"code": -32700, "message": "Invalid JSON"},
                }), 400

            response = self._stdio.handle_request(body)
            if response is None:
                return "", 204
            return jsonify(response)

        @app.route("/mcp/sse")
        def mcp_sse():
            """SSE endpoint — streams tool list on connect."""
            def _stream():
                tools = self._stdio.tools
                payload = json.dumps({
                    "jsonrpc": "2.0", "id": "init",
                    "result": {
                        "protocolVersion": "2024-11-05",
                        "capabilities": {"tools": {}},
                        "serverInfo": {
                            "name": MCP_SERVER_NAME,
                            "version": MCP_SERVER_VERSION,
                        },
                    },
                }, ensure_ascii=False)
                yield f"event: message\ndata: {payload}\n\n"

                tools_payload = json.dumps({
                    "jsonrpc": "2.0", "id": "tools",
                    "result": {"tools": tools},
                }, ensure_ascii=False)
                yield f"event: message\ndata: {tools_payload}\n\n"

            return Response(_stream(), mimetype="text/event-stream")

        @app.route("/health")
        def health():
            return jsonify({
                "status": "ok",
                "server": MCP_SERVER_NAME,
                "version": MCP_SERVER_VERSION,
                "tools_count": len(TOOL_REGISTRY),
            })

        return app

    def run(self):
        app = self.create_flask_app()
        logger.info(
            "MCP HTTP/SSE Server '%s' v%s starting on %s:%d — %d tools",
            MCP_SERVER_NAME, MCP_SERVER_VERSION, self.host, self.port,
            len(TOOL_REGISTRY),
        )
        app.run(host=self.host, port=self.port, debug=False)


# ═══════════════════════════════════════════════════════════════════════════════
# Entry point
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        stream=sys.stderr,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    # Register dynamic skill tools
    _register_skill_tools()

    transport = os.environ.get("MCP_TRANSPORT", "stdio").lower()

    if transport == "sse":
        host = os.environ.get("MCP_HOST", "0.0.0.0")
        port = int(os.environ.get("MCP_PORT", "5100"))
        server = MCPHttpServer(host=host, port=port)
        server.run()
    else:
        server = MCPStdioServer()
        server.run()
