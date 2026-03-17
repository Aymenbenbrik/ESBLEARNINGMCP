import os
from datetime import timedelta
from functools import lru_cache

class Config:
    # Flask configuration
    SECRET_KEY = os.environ.get('SECRET_KEY', 'dev-key-for-development-only')
    
    # Database configuration
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # PostgreSQL connection pool settings
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_size': 10,           # Maximum number of connections
        'pool_recycle': 3600,      # Recycle connections after 1 hour
        'pool_pre_ping': True,     # Verify connections before using
        'max_overflow': 5,         # Allow 5 extra connections beyond pool_size
    }
    
    # File upload configuration
    UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'uploads')
    MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16 MB max file size
    # Allow common learning content formats.
    # (Routes may further restrict per-feature.)
    ALLOWED_EXTENSIONS = {
        'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv',
        # plain text / notes
        'txt', 'md',
        # notebooks / code
        'ipynb', 'py', 'js', 'ts', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'sql',
        'json', 'yaml', 'yml',
        # archives (e.g., project code)
        'zip',
        # video (for future pipeline)
        'mp4', 'avi', 'mov', 'mkv', 'webm', 'flv'
    }
    
    # Gemini API configuration
    GOOGLE_API_KEY = None
    GEMINI_MODEL = "gemini-2.5-flash" 
    GEMINI_TEMPERATURE = 0.3
    # config.py
    PAGEINDEX_API_KEY = os.getenv('PAGEINDEX_API_KEY')
    PAGEINDEX_MODEL = os.getenv('PAGEINDEX_MODEL', 'pageindex-gpt-v1') 
    # Session configuration
    PERMANENT_SESSION_LIFETIME = timedelta(days=7)


class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL', 'sqlite:///esb_dev.db')
    WTF_CSRF_ENABLED = False  # Disable CSRF for development
    # SQLite doesn't support connection pool settings — override to empty
    SQLALCHEMY_ENGINE_OPTIONS = {}


class TestingConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
    if SQLALCHEMY_DATABASE_URI and SQLALCHEMY_DATABASE_URI.startswith('postgres://'):
        # Heroku compatibility: postgres:// -> postgresql://
        SQLALCHEMY_DATABASE_URI = SQLALCHEMY_DATABASE_URI.replace('postgres://', 'postgresql://', 1)
    
    # In production, ensure you set a strong secret key in environment variables
    SECRET_KEY = os.environ.get('SECRET_KEY')
    
    # Production specific settings
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_HTTPONLY = True
    WTF_CSRF_ENABLED = True  # Enable CSRF in production


# Create a config dictionary for easier access
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}