"""
Assistant API — /api/v1/assistant/
Conversational AI assistant with TTS and STT endpoints.
"""

import io
import json
import logging
from flask import Blueprint, jsonify, request, Response, stream_with_context, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity

logger = logging.getLogger(__name__)

assistant_api_bp = Blueprint('assistant_api', __name__, url_prefix='/assistant')


def _get_current_user():
    from app.models.users import User
    try:
        user_id = int(get_jwt_identity())
        return User.query.get(user_id)
    except (ValueError, TypeError) as e:
        logger.error(f"Error getting current user: {e}")
        return None


def _determine_role(user) -> str:
    """Determine the user's role string."""
    if user.is_superuser:
        return 'admin'
    if user.is_teacher:
        return 'teacher'
    return 'student'


# ═══════════════════════════════════════════════════════════════════════════════
# POST /assistant/chat
# ═══════════════════════════════════════════════════════════════════════════════

@assistant_api_bp.route('/chat', methods=['POST'])
@jwt_required()
def chat():
    """
    Conversational chat with the AI assistant.

    Body: {
        "message": str,
        "history": [{"role": "user"/"assistant", "content": str}]
    }
    Returns: {
        "response": str,
        "language": str,
        "tools_used": list
    }
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    history = data.get('history', [])
    if not isinstance(history, list):
        history = []

    role = _determine_role(user)

    try:
        from app.services.assistant_agent import chat_with_assistant
        result = chat_with_assistant(
            user_id=user.id,
            message=message,
            conversation_history=history,
            role=role,
        )
        return jsonify(result), 200

    except Exception as e:
        logger.error(f"Assistant chat error: {e}", exc_info=True)
        return jsonify({
            'error': 'An error occurred while processing your request.',
            'details': str(e),
        }), 500


# ═══════════════════════════════════════════════════════════════════════════════
# POST /assistant/chat/stream  — SSE streaming version
# ═══════════════════════════════════════════════════════════════════════════════

@assistant_api_bp.route('/chat/stream', methods=['POST'])
@jwt_required()
def chat_stream():
    """
    Server-Sent Events streaming version of /chat.

    Same request body as POST /chat.
    Emits SSE events with the following structure::

        data: {"type": "tool_call",   "content": "get_my_courses"}
        data: {"type": "thinking",    "content": "D'après tes cours..."}
        data: {"type": "tool_result", "content": "get_my_courses"}
        data: {"type": "done",        "content": "{\"response\":\"...\",\"tools_used\":[...]}"}
        data: {"type": "error",       "content": "Error message"}

    The ``done`` event's ``content`` is a JSON string containing the full
    ``{"response", "language", "tools_used"}`` dict (same as /chat).
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    message = (data.get('message') or '').strip()
    if not message:
        return jsonify({'error': 'Message is required'}), 400

    history = data.get('history', [])
    if not isinstance(history, list):
        history = []

    role = _determine_role(user)
    user_id = user.id

    def _generate():
        try:
            from app.services.assistant_agent import stream_assistant
            for event_type, content in stream_assistant(user_id, message, history, role):
                payload = json.dumps({'type': event_type, 'content': content}, ensure_ascii=False)
                yield f"data: {payload}\n\n"
        except Exception as e:
            logger.error(f"Assistant stream error: {e}", exc_info=True)
            payload = json.dumps({'type': 'error', 'content': str(e)})
            yield f"data: {payload}\n\n"

    return Response(
        stream_with_context(_generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )


# ═══════════════════════════════════════════════════════════════════════════════
# POST /assistant/tts
# ═══════════════════════════════════════════════════════════════════════════════

@assistant_api_bp.route('/tts', methods=['POST'])
@jwt_required()
def text_to_speech():
    """
    Convert text to speech audio.

    Body: { "text": str, "language": "fr"|"en"|"ar" }
    Returns: audio/mpeg binary
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    data = request.get_json(silent=True) or {}
    text = (data.get('text') or '').strip()
    if not text:
        return jsonify({'error': 'Text is required'}), 400

    language = data.get('language', 'fr')
    # Map language codes
    lang_map = {
        'fr': 'fr',
        'en': 'en',
        'ar': 'ar',
        'tn': 'ar',  # Tunisian → Arabic for TTS
    }
    tts_lang = lang_map.get(language, 'fr')

    # Truncate very long text for TTS
    if len(text) > 5000:
        text = text[:5000]

    try:
        from gtts import gTTS

        tts = gTTS(text=text, lang=tts_lang, slow=False)
        audio_buffer = io.BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        return Response(
            audio_buffer.read(),
            mimetype='audio/mpeg',
            headers={
                'Content-Disposition': 'inline; filename="speech.mp3"',
                'Cache-Control': 'no-cache',
            },
        )

    except Exception as e:
        logger.error(f"TTS error: {e}", exc_info=True)
        return jsonify({'error': f'Text-to-speech failed: {str(e)}'}), 500


# ═══════════════════════════════════════════════════════════════════════════════
# POST /assistant/stt
# ═══════════════════════════════════════════════════════════════════════════════

@assistant_api_bp.route('/stt', methods=['POST'])
@jwt_required()
def speech_to_text():
    """
    Transcribe audio to text using Gemini's audio understanding.

    Body: multipart/form-data with 'audio' file (webm/wav/mp3)
    Returns: { "text": str, "language": str }
    """
    user = _get_current_user()
    if not user:
        return jsonify({'error': 'User not found'}), 404

    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file provided'}), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({'error': 'Empty audio file'}), 400

    try:
        audio_bytes = audio_file.read()
        if len(audio_bytes) == 0:
            return jsonify({'error': 'Audio file is empty'}), 400

        # Determine MIME type
        filename = audio_file.filename.lower()
        if filename.endswith('.webm'):
            mime_type = 'audio/webm'
        elif filename.endswith('.wav'):
            mime_type = 'audio/wav'
        elif filename.endswith('.mp3'):
            mime_type = 'audio/mpeg'
        elif filename.endswith('.ogg'):
            mime_type = 'audio/ogg'
        elif filename.endswith('.m4a'):
            mime_type = 'audio/mp4'
        else:
            mime_type = audio_file.content_type or 'audio/webm'

        # Use Gemini for transcription (handles Tunisian Arabic well)
        import google.generativeai as genai

        api_key = current_app.config.get('GOOGLE_API_KEY')
        model_name = current_app.config.get('GEMINI_MODEL', 'gemini-2.5-flash')
        genai.configure(api_key=api_key)

        model = genai.GenerativeModel(model_name)

        prompt = (
            "Transcribe this audio exactly as spoken. The speaker may use French, English, "
            "or Tunisian Arabic dialect (Derja). Return ONLY the transcription text, nothing else. "
            "If the audio is in Tunisian dialect, write it in Latin script (Arabizi) as commonly "
            "written by Tunisians (e.g. '9ra', 'bech', 'kifech')."
        )

        response = model.generate_content([
            prompt,
            {
                "mime_type": mime_type,
                "data": audio_bytes,
            },
        ])

        transcribed_text = response.text.strip() if response.text else ""

        if not transcribed_text:
            return jsonify({'error': 'Could not transcribe audio'}), 422

        # Detect language from transcription
        from app.services.assistant_agent import _detect_language
        detected_lang = _detect_language(transcribed_text)

        return jsonify({
            'text': transcribed_text,
            'language': detected_lang,
        }), 200

    except Exception as e:
        logger.error(f"STT error: {e}", exc_info=True)
        return jsonify({'error': f'Speech-to-text failed: {str(e)}'}), 500


# ── TunBERT status endpoint ──────────────────────────────────────────────────

@assistant_api_bp.route('/tunbert-status', methods=['GET'])
@jwt_required()
def tunbert_status():
    """Check TunBERT model status and capabilities."""
    try:
        from app.services.tunbert_service import get_tunbert_status
        status = get_tunbert_status()
        return jsonify(status), 200
    except ImportError:
        return jsonify({
            'loaded': False,
            'error': 'TunBERT service not available',
        }), 200
    except Exception as e:
        logger.error(f"TunBERT status error: {e}")
        return jsonify({'loaded': False, 'error': str(e)}), 500
