"""
Code Execution API
==================
Endpoints:
  POST /code/execute         — run student code via Piston (live "Run" button)
  POST /code/generate-answer — AI generates a model answer for a code question
"""
import logging

from flask import request, jsonify, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage

from app.api.v1 import api_v1_bp
from app import db
from app.models import User, QuestionBankQuestion
from app.services.piston_service import execute_code, LANGUAGE_VERSIONS

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = sorted(LANGUAGE_VERSIONS.keys())


def _get_user():
    return User.query.get(int(get_jwt_identity()))


@api_v1_bp.route('/code/execute', methods=['POST'])
@jwt_required()
def run_code():
    """
    Execute code on the Piston sandbox.
    Body: { language, code, stdin? }
    Returns: { stdout, stderr, exit_code, success, error? }
    """
    data = request.get_json(silent=True) or {}
    language = (data.get('language') or '').strip().lower()
    code = (data.get('code') or '').strip()
    stdin = data.get('stdin', '')

    if not language:
        return jsonify({'error': 'language required'}), 400
    if not code:
        return jsonify({'error': 'code required'}), 400
    if language not in LANGUAGE_VERSIONS:
        return jsonify({'error': f'Unsupported language. Supported: {", ".join(SUPPORTED_LANGUAGES)}'}), 400

    result = execute_code(language, code, stdin)
    return jsonify(result), 200


@api_v1_bp.route('/code/generate-answer', methods=['POST'])
@jwt_required()
def generate_code_answer():
    """
    AI generates a model answer (complete working code) for a practical question.
    Body: { question_text, language, question_id? }
    Returns: { answer }
    Also saves the answer if question_id is provided.
    """
    user = _get_user()
    if not (user.is_teacher or user.is_superuser):
        return jsonify({'error': 'Teachers only'}), 403

    data = request.get_json(silent=True) or {}
    question_text = (data.get('question_text') or '').strip()
    language = (data.get('language') or 'python').strip()
    question_id = data.get('question_id')

    if not question_text:
        return jsonify({'error': 'question_text required'}), 400

    api_key = current_app.config.get('GOOGLE_API_KEY', '')
    model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')

    try:
        llm = ChatGoogleGenerativeAI(
            model=model_name, google_api_key=api_key,
            temperature=0.2, max_tokens=1000,
        )
        prompt = f"""Tu es un expert en programmation {language}. 
Génère une solution complète et correcte pour la question pratique suivante.
Réponds UNIQUEMENT avec le code source, sans explication ni commentaires markdown.

Langage : {language}

Question :
{question_text}

Code solution (complet, exécutable, commenté en français) :"""

        resp = llm.invoke([HumanMessage(content=prompt)])
        answer = resp.content.strip()
        # Strip markdown code fences if present
        if answer.startswith('```'):
            lines = answer.split('\n')
            answer = '\n'.join(lines[1:-1] if lines[-1] == '```' else lines[1:])

        # Save to question if question_id provided
        if question_id:
            q = QuestionBankQuestion.query.get(question_id)
            if q and (q.course.teacher_id == user.id or user.is_superuser):
                q.answer = answer
                q.programming_language = language
                db.session.commit()

        return jsonify({'answer': answer}), 200

    except Exception as exc:
        logger.error(f'AI answer generation failed: {exc}', exc_info=True)
        return jsonify({'error': str(exc)}), 500


@api_v1_bp.route('/code/supported-languages', methods=['GET'])
@jwt_required()
def get_supported_languages():
    """Return list of supported programming languages for Piston."""
    return jsonify({'languages': SUPPORTED_LANGUAGES}), 200
