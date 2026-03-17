from app import create_app, db
from app.models import User, Course, Chapter, Document, Enrollment, ChatSession, ChatMessage

app = create_app()


# Create a shell context for Flask CLI
@app.shell_context_processor
def make_shell_context():
    return {
        'db': db,
        'User': User,
        'Course': Course,
        'Chapter': Chapter,
        'Document': Document,
        'Enrollment': Enrollment,
        'ChatSession': ChatSession,
        'ChatMessage': ChatMessage
    }

@app.template_filter('nl2br')
def nl2br(value):
    """Convert newlines to <br> tags"""
    if value:
        return value.replace('\n', '<br>')
    return ''

if __name__ == '__main__':
    app.run(debug=False)