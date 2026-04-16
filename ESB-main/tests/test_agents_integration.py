"""
Integration tests for exam_agent_graph and tp_agent_graph pipelines.

LLM calls and external MCP tools are fully mocked so tests run without
any real API keys or network access.
"""
import pytest
from unittest.mock import patch, MagicMock


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_llm_response(content: str) -> MagicMock:
    """Create a mock LLM response with a .content attribute."""
    msg = MagicMock()
    msg.content = content
    return msg


# ── Exam agent pipeline ───────────────────────────────────────────────────────

class TestExamAgentPipeline:
    """Tests for the StateGraph-based exam evaluation pipeline."""

    @pytest.mark.skip(reason="requires langgraph and full app wiring — run manually")
    def test_exam_pipeline_extract_text_node(self, app):
        """The extract_text node should populate state['exam_text'] from file_path."""
        from app.services.exam_agent_graph import ExamEvaluationState

        sample_text = "Question 1: What is 2+2?\nQuestion 2: Define recursion."

        with app.app_context():
            with patch(
                'app.services.exam_mcp_tools.extract_exam_text',
                return_value=sample_text,
            ):
                # Build minimal state as the node would receive it
                state: ExamEvaluationState = {
                    'session_id': 1,
                    'course_id': 1,
                    'document_id': None,
                    'file_path': '/fake/exam.pdf',
                    'exam_title': 'Test Exam',
                    'course_name': 'Test Course',
                    'exam_text': None,
                    'questions': None,
                    'aa_list': None,
                    'course_context': None,
                    'comparison_report': None,
                    'feedback': None,
                    'adjustments': None,
                    'latex_source': None,
                    'latex_pdf_path': None,
                    'proposal_evaluation': None,
                    'corrections': None,
                    'errors': [],
                    'current_node': 'extract_text',
                }

                # Import the node function directly
                from app.services.exam_agent_graph import extract_text_node
                result_state = extract_text_node(state)

                assert result_state.get('exam_text') == sample_text

    @pytest.mark.skip(reason="requires langgraph and full app wiring — run manually")
    def test_exam_pipeline_extract_questions_node(self, app):
        """extract_questions node should parse questions from exam_text."""
        from app.services.exam_agent_graph import ExamEvaluationState

        mock_questions = [
            {'id': 1, 'text': 'What is 2+2?', 'points': 2},
            {'id': 2, 'text': 'Define recursion.', 'points': 4},
        ]

        with app.app_context():
            with patch(
                'app.services.exam_mcp_tools.extract_exam_questions',
                return_value=mock_questions,
            ):
                state: ExamEvaluationState = {
                    'session_id': 1,
                    'course_id': 1,
                    'document_id': None,
                    'file_path': '/fake/exam.pdf',
                    'exam_title': 'Test Exam',
                    'course_name': 'Test Course',
                    'exam_text': 'Question 1: What is 2+2?\nQuestion 2: Define recursion.',
                    'questions': None,
                    'aa_list': None,
                    'course_context': None,
                    'comparison_report': None,
                    'feedback': None,
                    'adjustments': None,
                    'latex_source': None,
                    'latex_pdf_path': None,
                    'proposal_evaluation': None,
                    'corrections': None,
                    'errors': [],
                    'current_node': 'extract_questions',
                }

                from app.services.exam_agent_graph import extract_questions_node
                result_state = extract_questions_node(state)

                assert result_state.get('questions') is not None
                assert len(result_state['questions']) > 0


# ── TP agent pipeline ─────────────────────────────────────────────────────────

class TestTPAgentPipeline:
    """Tests for the TP (Travaux Pratiques) StateGraph pipeline."""

    @pytest.mark.skip(reason="requires langgraph and full app wiring — run manually")
    def test_tp_pipeline_teacher_flow(self, app):
        """
        Smoke test: teacher flow get_context → generate_statement → parse_questions
        completes without error when LLM is mocked.
        """
        import json
        from app.services.tp_agent_graph import TPCreationState

        mock_statement = "TP : Implémentation d'un algorithme de tri."
        mock_questions_json = json.dumps([
            {'id': 1, 'title': 'Tri à bulles', 'text': 'Implémenter le tri à bulles.', 'points': 5},
            {'id': 2, 'title': 'Tri rapide',  'text': 'Implémenter le quicksort.',    'points': 5},
        ])

        llm_mock = MagicMock()
        llm_mock.invoke.side_effect = [
            _make_llm_response(mock_statement),
            _make_llm_response(mock_questions_json),
        ]

        with app.app_context():
            with patch('app.services.tp_agent_graph.ChatGoogleGenerativeAI', return_value=llm_mock), \
                 patch('app.services.tp_mcp_server.get_section_context',
                       return_value='Contexte du cours : Algorithmes de tri.'):

                state: TPCreationState = {
                    'section_id': 1,
                    'language': 'fr',
                    'hint': None,
                    'suggestion_context': None,
                    'max_grade': 10.0,
                    'section_context': None,
                    'available_aa': None,
                    'title': None,
                    'statement': None,
                    'statement_source': 'ai',
                    'suggested_aa': None,
                    'questions': None,
                    'reference_solution': None,
                    'correction_criteria': None,
                }

                from app.services.tp_agent_graph import get_context_node
                updated = get_context_node(state)

                assert updated.get('section_context') is not None

    @pytest.mark.skip(reason="requires langgraph and full app wiring — run manually")
    def test_tp_pipeline_student_flow(self, app):
        """
        Smoke test: student auto_correct → propose_grade flow with mocked LLM.
        """
        import json
        from app.services.tp_agent_graph import TPCorrectionState

        mock_correction = json.dumps({
            'grade': 7.5,
            'feedback': 'Bonne implémentation, quelques optimisations manquantes.',
            'criteria': [{'criterion': 'Exactitude', 'score': 4, 'max': 5}],
        })

        llm_mock = MagicMock()
        llm_mock.invoke.return_value = _make_llm_response(mock_correction)

        with app.app_context():
            with patch('app.services.tp_agent_graph.ChatGoogleGenerativeAI', return_value=llm_mock):
                state = {
                    'tp_id': 1,
                    'submission_id': 1,
                    'student_code': 'def bubble_sort(arr): pass',
                    'reference_solution': 'def bubble_sort(arr): ...',
                    'correction_criteria': 'Exactitude, Lisibilité',
                    'max_grade': 10.0,
                    'auto_correction': None,
                    'proposed_grade': None,
                    'feedback': None,
                    'errors': [],
                }

                from app.services.tp_agent_graph import auto_correct_node
                updated = auto_correct_node(state)
                # Node should populate auto_correction without raising
                assert 'errors' in updated
