import os
from flask import Flask, request, jsonify, redirect, url_for
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from datetime import timedelta
import markdown
from markupsafe import Markup
from dotenv import load_dotenv

load_dotenv()  # Charge les variables du fichier .env

# Initialize extensions
db = SQLAlchemy()
migrate = Migrate()
login_manager = LoginManager()
csrf = CSRFProtect()
jwt = JWTManager()


def _bootstrap_db(app: Flask):
    """Ensure DB schema exists without requiring manual migration steps.

    The project is used in a local/dev context where we want `python run.py`
    to "just work". We therefore:
    - call create_all() so missing tables are created
    - apply light-weight column upgrades for both SQLite and PostgreSQL
      (only for columns we rely on at runtime)
    """
    from sqlalchemy import text
    with app.app_context():
        # Import models so SQLAlchemy knows them
        from app import models  # noqa: F401

        # Create missing tables (works for both PostgreSQL and SQLite)
        db.create_all()

        # ── User table migrations (must run BEFORE any User query) ──
        try:
            result = db.session.execute(text("PRAGMA table_info(user)"))
            user_cols = {row[1] for row in result.fetchall()}
            if 'is_active' not in user_cols:
                db.session.execute(text("ALTER TABLE user ADD COLUMN is_active BOOLEAN DEFAULT 1"))
                db.session.commit()
        except Exception:
            pass

        # Auto-create default admin
        from app.models import User
        admin = User.query.filter_by(username='Esprit').first()
        if not admin:
            admin = User(username='Esprit', email='esprit@esprit.tn', is_superuser=True, is_teacher=False)
            admin.set_password('Esprit')
            db.session.add(admin)
            db.session.commit()

        # Column upgrades for existing DBs
        engine_url = str(db.engine.url)

        def table_exists(table_name: str) -> bool:
            if 'sqlite' in engine_url:
                return table_name in [r[0] for r in db.session.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))]
            # PostgreSQL / others
            sql = text("""
                SELECT EXISTS (
                  SELECT 1 FROM information_schema.tables
                  WHERE table_name = :t
                )
            """)
            return bool(db.session.execute(sql, {'t': table_name}).scalar())

        def cols(table: str):
            if 'sqlite' in engine_url:
                return [r[1] for r in db.session.execute(text(f"PRAGMA table_info({table})")).fetchall()]
            # PostgreSQL
            sql = text("""
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = :t
            """)
            return [r[0] for r in db.session.execute(sql, {'t': table}).fetchall()]

        # Add program_id + academic_year to classe
        if table_exists('classe'):
            c = cols('classe')
            if 'program_id' not in c:
                db.session.execute(text('ALTER TABLE classe ADD COLUMN program_id INTEGER'))
            if 'academic_year' not in c:
                db.session.execute(text('ALTER TABLE classe ADD COLUMN academic_year VARCHAR(20)'))

        # Question bank table is created by create_all; add any missing columns just in case
        if table_exists('question_bank_question'):
            c = cols('question_bank_question')
            add_cols = {
                'chapter_id': 'INTEGER',
                'question_type': 'VARCHAR(20)',
                'bloom_level': 'VARCHAR(50)',
                'clo': 'VARCHAR(255)',
                'difficulty': 'VARCHAR(20)',
                'approved_at': 'DATETIME',
                'approved_by_id': 'INTEGER',
                'created_at': 'DATETIME',
                'choice_a': 'TEXT',
                'choice_b': 'TEXT',
                'choice_c': 'TEXT',
                'correct_choice': 'VARCHAR(1)',
                'explanation': 'TEXT',
                'answer': 'TEXT',
            }
            for name, sqlt in add_cols.items():
                if name not in c:
                    db.session.execute(text(f"ALTER TABLE question_bank_question ADD COLUMN {name} {sqlt}"))

        # Chat session: some DBs were created before chapter_id existed
        if table_exists('chat_session'):
            c = cols('chat_session')
            if 'chapter_id' not in c:
                db.session.execute(text('ALTER TABLE chat_session ADD COLUMN chapter_id INTEGER'))

        # TNSection: add parent_section_id for sub-sections support
        if table_exists('tn_section'):
            c = cols('tn_section')
            if 'parent_section_id' not in c:
                db.session.execute(text(
                    'ALTER TABLE tn_section ADD COLUMN parent_section_id INTEGER REFERENCES tn_section(id)'
                ))

        # PracticalWork: add suggestion_context for AI detection flow
        if table_exists('practical_work'):
            c = cols('practical_work')
            if 'suggestion_context' not in c:
                db.session.execute(text('ALTER TABLE practical_work ADD COLUMN suggestion_context TEXT'))

        # ExamSession: add is_preview for teacher preview mode
        if table_exists('exam_session'):
            c = cols('exam_session')
            if 'is_preview' not in c:
                db.session.execute(text("ALTER TABLE exam_session ADD COLUMN is_preview BOOLEAN DEFAULT 0"))

        # SectionQuizSubmission: add is_preview for teacher preview mode
        if table_exists('section_quiz_submission'):
            c = cols('section_quiz_submission')
            if 'is_preview' not in c:
                db.session.execute(text("ALTER TABLE section_quiz_submission ADD COLUMN is_preview BOOLEAN DEFAULT 0"))

        # Program: add program_type, descriptor_file, descriptor_uploaded_at, code
        if table_exists('program'):
            c = cols('program')
            if 'program_type' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN program_type VARCHAR(20)"))
            if 'descriptor_file' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN descriptor_file VARCHAR(255)"))
            if 'descriptor_uploaded_at' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN descriptor_uploaded_at DATETIME"))
            if 'code' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN code VARCHAR(50)"))
            if 'study_plan_file' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN study_plan_file VARCHAR(255)"))
            if 'study_plan_uploaded_at' not in c:
                db.session.execute(text("ALTER TABLE program ADD COLUMN study_plan_uploaded_at DATETIME"))

        db.session.commit()


def create_app(config_name=None):
    app = Flask(__name__)
    
    # Load configuration
    if config_name is None:
        from app.config import DevelopmentConfig
        app.config.from_object(DevelopmentConfig)
    else:
        config_module = __import__(f'app.config', fromlist=[f'{config_name}Config'])
        config_class = getattr(config_module, f'{config_name}Config')
        app.config.from_object(config_class)
        config_class.init_app(app)
    
    # 🔑 Charger la clé Google globale depuis .env
    app.config['GOOGLE_API_KEY'] = os.environ.get('GOOGLE_API_KEY')
    if not app.config['GOOGLE_API_KEY']:
        # Fallback provided key if not in env (though env is preferred)
        app.config['GOOGLE_API_KEY'] = ""  # Clé manquante — définir GOOGLE_API_KEY dans .env
    app.config['GEMINI_MODEL'] = os.environ.get('GEMINI_MODEL', 'gemini-2.5-flash')
    app.config['GEMINI_MODEL_ROBUST'] = os.environ.get('GEMINI_MODEL_ROBUST', 'gemini-2.5-pro')
    
    # SET FILE UPLOAD SIZE LIMITS
    # Maximum file size: 500MB (adjust based on your needs and server storage)
    app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB in bytes
    
    # JSON content length (for API requests)
    app.config['JSON_MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB in bytes
    
    # Ensure upload directory exists
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)
    
    # Initialize extensions with app
    db.init_app(app)
    migrate.init_app(app, db)
    login_manager.init_app(app)
    csrf.init_app(app)

    # Configure JWT
    app.config['JWT_SECRET_KEY'] = os.environ.get('JWT_SECRET_KEY', 'dev-secret-key-change-in-production')
    app.config['JWT_TOKEN_LOCATION'] = ['cookies']
    app.config['JWT_COOKIE_SECURE'] = False  # Set True in production with HTTPS
    app.config['JWT_COOKIE_CSRF_PROTECT'] = False  # Using SameSite instead
    app.config['JWT_COOKIE_SAMESITE'] = 'Lax'  # Changed from Strict for development
    app.config['JWT_COOKIE_PATH'] = '/'  # Ensure cookies are sent to all paths
    app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours=1)
    app.config['JWT_REFRESH_TOKEN_EXPIRES'] = timedelta(days=30)
    app.config['JWT_COOKIE_DOMAIN'] = None  # Don't restrict domain (allows localhost)
    jwt.init_app(app)

    # JWT error handlers
    @jwt.expired_token_loader
    def expired_token_callback(jwt_header, jwt_payload):
        from flask import jsonify
        return jsonify({
            'error': 'Token has expired',
            'error_code': 'token_expired'
        }), 401

    @jwt.invalid_token_loader
    def invalid_token_callback(error):
        from flask import jsonify
        return jsonify({
            'error': 'Invalid token',
            'error_code': 'invalid_token',
            'message': str(error)
        }), 422

    @jwt.unauthorized_loader
    def missing_token_callback(error):
        from flask import jsonify
        return jsonify({
            'error': 'Request does not contain an access token',
            'error_code': 'missing_token',
            'message': str(error)
        }), 401

    @jwt.revoked_token_loader
    def revoked_token_callback(jwt_header, jwt_payload):
        from flask import jsonify
        return jsonify({
            'error': 'Token has been revoked',
            'error_code': 'token_revoked'
        }), 401

    # Add request/response logging for JWT errors
    @app.after_request
    def log_response(response):
        from flask import request
        if response.status_code in [401, 422]:
            app.logger.warning(f"Auth error {response.status_code}: {request.path} - Response: {response.get_data(as_text=True)[:200]}")
        return response

    # Configure CORS
    CORS(app,
         origins=['http://localhost:3000'],
         supports_credentials=True,
         allow_headers=['Content-Type', 'Authorization'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])

    # Handle CORS preflight requests - OPTIONS must bypass all authentication
    @app.before_request
    def handle_preflight():
        if request.method == 'OPTIONS':
            # Return immediately for preflight, let CORS add headers
            return '', 204

    # Configure login
    login_manager.login_view = 'auth.login'
    login_manager.login_message_category = 'info'

    # Custom unauthorized handler to prevent redirects on API routes
    @login_manager.unauthorized_handler
    def unauthorized():
        # For API routes, return JSON 401 instead of redirecting
        if request.path.startswith('/api/'):
            return jsonify({'error': 'Unauthorized', 'message': 'Authentication required'}), 401
        # For web routes, redirect to login page as normal
        return redirect(url_for('auth.login'))

    # Suppress verbose logging from libraries
    import logging
    logging.getLogger('pdfminer').setLevel(logging.WARNING)
    logging.getLogger('httpcore').setLevel(logging.WARNING)
    logging.getLogger('httpx').setLevel(logging.WARNING)
    logging.getLogger('google_genai').setLevel(logging.WARNING)
    logging.getLogger('urllib3').setLevel(logging.WARNING)

    # Register template filters
    register_template_filters(app)
    
    # Register blueprints
    from app.routes.auth import auth_bp
    from app.routes.courses import courses_bp
    from app.routes.chapters import chapters_bp
    from app.routes.documents import documents_bp
    from app.routes.ai import ai_bp
    from app.routes.quiz import quiz_bp
    from app.routes.notes import notes
    from app.routes.insights_routes import insights_bp
    from app.routes.superuser import superuser
    from app.routes.syllabus import syllabus_bp
    from app.routes.evaluate import evaluate_bp
    from app.routes.tn_syllabus import tn_syllabus_bp
    from app.routes.admin import admin_bp
    from app.routes.question_bank import question_bank_bp

    app.register_blueprint(insights_bp, url_prefix='/insights')
    app.register_blueprint(quiz_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(courses_bp)
    app.register_blueprint(chapters_bp)
    app.register_blueprint(documents_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(superuser)
    app.register_blueprint(notes, url_prefix='/notes')
    app.register_blueprint(syllabus_bp)
    app.register_blueprint(evaluate_bp)
    app.register_blueprint(tn_syllabus_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(question_bank_bp)

    # Register API v1 blueprint
    from app.api.v1 import api_v1_bp
    from app.api.v1.auth import auth_api_bp
    from app.api.v1.users import users_api_bp
    from app.api.v1.courses import courses_api_bp
    from app.api.v1.chapters import chapters_api_bp
    from app.api.v1.documents import documents_api_bp
    from app.api.v1.quiz import quiz_api_bp
    from app.api.v1.ai import ai_api_bp
    from app.api.v1.syllabus import syllabus_api_bp
    from app.api.v1.notes import notes_api_bp
    from app.api.v1.chapter_quiz import chapter_quiz_api_bp
    from app.api.v1.programs import programs_api_bp
    from app.api.v1.admin import admin_api_bp
    from app.api.v1.question_bank import question_bank_api_bp
    from app.api.v1.practice_quiz import practice_quiz_api_bp
    from app.api.v1.dashboards import dashboards_api_bp
    from app.api.v1.class_chat import class_chat_api_bp
    from app.api.v1 import course_question_bank as _cqb  # noqa: F401 – registers routes on api_v1_bp
    from app.api.v1 import practical_work as _pw  # noqa: F401 – registers TP routes on api_v1_bp
    from app.api.v1 import chapter_sidebar as _cs  # noqa: F401 – registers sidebar routes on api_v1_bp
    from app.api.v1.tn_exams import tn_exams_api_bp
    from app.api.v1.exam_bank import exam_bank_api_bp
    from app.api.v1.chapter_pipeline import chapter_pipeline_bp
    from app.api.v1.progress import progress_api_bp
    from app.api.v1.coach import coach_api_bp
    from app.api.v1.calendar import calendar_api_bp
    from app.api.v1.feedback import feedback_api_bp
    from app.api.v1.student_evaluation import student_eval_bp
    api_v1_bp.register_blueprint(auth_api_bp)
    api_v1_bp.register_blueprint(users_api_bp)
    api_v1_bp.register_blueprint(courses_api_bp)
    api_v1_bp.register_blueprint(chapters_api_bp)
    api_v1_bp.register_blueprint(documents_api_bp)
    api_v1_bp.register_blueprint(quiz_api_bp)
    api_v1_bp.register_blueprint(ai_api_bp)
    api_v1_bp.register_blueprint(syllabus_api_bp)
    api_v1_bp.register_blueprint(notes_api_bp)
    api_v1_bp.register_blueprint(chapter_quiz_api_bp)
    api_v1_bp.register_blueprint(programs_api_bp)
    api_v1_bp.register_blueprint(admin_api_bp)
    api_v1_bp.register_blueprint(question_bank_api_bp)
    api_v1_bp.register_blueprint(practice_quiz_api_bp)
    api_v1_bp.register_blueprint(dashboards_api_bp)
    api_v1_bp.register_blueprint(class_chat_api_bp)
    api_v1_bp.register_blueprint(tn_exams_api_bp)
    api_v1_bp.register_blueprint(exam_bank_api_bp)
    api_v1_bp.register_blueprint(chapter_pipeline_bp)
    api_v1_bp.register_blueprint(progress_api_bp)
    api_v1_bp.register_blueprint(coach_api_bp)
    api_v1_bp.register_blueprint(calendar_api_bp)
    api_v1_bp.register_blueprint(feedback_api_bp)
    api_v1_bp.register_blueprint(student_eval_bp)
    app.register_blueprint(api_v1_bp)

    # Exempt API routes from CSRF
    csrf.exempt(api_v1_bp)

    from app.cli import register_cli_commands
    register_cli_commands(app)

    # Bootstrap DB schema and columns
    _bootstrap_db(app)

    return app

def register_template_filters(app):
    @app.template_filter('markdown')
    def markdown_filter(text):
        if text is None:
            return ""
        html = markdown.markdown(text, extensions=['extra'])
        return Markup(html)
