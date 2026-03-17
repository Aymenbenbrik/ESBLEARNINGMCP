from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    get_jwt,
    verify_jwt_in_request,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies
)
from app import db
from app.models import User, UserSession
from datetime import datetime

auth_api_bp = Blueprint('auth_api', __name__, url_prefix='/auth')

@auth_api_bp.route('/login', methods=['POST'])
def api_login():
    """
    JWT-based login endpoint
    Accepts: { username: str, password: str }
    Returns: { user: {...} } with JWT in httpOnly cookie
    """
    try:
        data = request.get_json()

        if not data or not data.get('username') or not data.get('password'):
            return jsonify({'error': 'Username and password are required'}), 400

        # Find user by username or email
        user = User.query.filter(
            (User.username == data['username']) | (User.email == data['username'])
        ).first()

        if not user or not user.check_password(data['password']):
            return jsonify({'error': 'Invalid credentials'}), 401

        # Create access and refresh tokens with user claims
        access_token = create_access_token(
            identity=str(user.id),
            additional_claims={
                'is_teacher': user.is_teacher,
                'is_superuser': user.is_superuser,
                'username': user.username
            }
        )
        refresh_token = create_refresh_token(identity=str(user.id))

        # Record session
        session = UserSession(
            user_id=user.id,
            ip_address=request.remote_addr,
            user_agent=request.headers.get('User-Agent')
        )
        db.session.add(session)
        db.session.commit()

        # Prepare response
        response = jsonify({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_teacher': user.is_teacher,
                'is_superuser': user.is_superuser
            }
        })

        # Set JWT cookies
        set_access_cookies(response, access_token)
        set_refresh_cookies(response, refresh_token)

        return response, 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/logout', methods=['POST'])
@jwt_required(optional=True)
def api_logout():
    """
    Logout endpoint - clears JWT cookies
    JWT is optional to allow logout even with invalid/corrupted tokens
    """
    try:
        identity = get_jwt_identity()
        user_id = int(identity) if identity else None

        # Only record session logout if user was authenticated
        if user_id:
            # Find and close the most recent active session
            active_session = UserSession.query.filter_by(
                user_id=user_id,
                logout_time=None
            ).order_by(UserSession.login_time.desc()).first()

            if active_session:
                active_session.record_logout()
                db.session.commit()

        response = jsonify({'message': 'Logout successful'})
        unset_jwt_cookies(response)
        return response, 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/me', methods=['GET'])
@jwt_required()
def get_current_user():
    """
    Get current authenticated user
    Returns: { user: {...} }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_teacher': user.is_teacher,
                'is_superuser': user.is_superuser,
                'google_api_key': user.google_api_key,
                'created_at': user.created_at.isoformat() if user.created_at else None
            }
        }), 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/debug/token', methods=['GET'])
def debug_token():
    """
    Debug endpoint to check JWT token status (development only)
    """
    if not current_app.debug:
        return jsonify({'error': 'Only available in debug mode'}), 403

    try:
        verify_jwt_in_request(optional=True)
        user_id = get_jwt_identity()
        claims = get_jwt()

        return jsonify({
            'token_present': user_id is not None,
            'user_id': user_id,
            'claims': claims,
            'cookies_received': {
                'access_token': 'access_token_cookie' in request.cookies,
                'refresh_token': 'refresh_token_cookie' in request.cookies
            }
        }), 200
    except Exception as e:
        return jsonify({
            'error': str(e),
            'cookies_received': {
                'access_token': 'access_token_cookie' in request.cookies,
                'refresh_token': 'refresh_token_cookie' in request.cookies
            }
        }), 200


@auth_api_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """
    Refresh access token using refresh token
    """
    try:
        user_id = int(get_jwt_identity())
        access_token = create_access_token(identity=str(user_id))

        response = jsonify({'message': 'Token refreshed'})
        set_access_cookies(response, access_token)
        return response, 200

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/register', methods=['POST'])
def register():
    """
    User registration endpoint
    Accepts: { username: str, email: str, password: str, is_teacher: bool }
    Returns: { user: {...} }
    """
    try:
        data = request.get_json()

        # Validate required fields
        if not data or not all(k in data for k in ['username', 'email', 'password']):
            return jsonify({'error': 'Username, email, and password are required'}), 400

        # Check if username already exists
        if User.query.filter_by(username=data['username']).first():
            return jsonify({'error': 'Username already exists'}), 400

        # Check if email already exists
        if User.query.filter_by(email=data['email']).first():
            return jsonify({'error': 'Email already exists'}), 400

        # Validate password length
        if len(data['password']) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Create new user
        user = User(
            username=data['username'],
            email=data['email'],
            is_teacher=data.get('is_teacher', False),
            is_first_login=False
        )
        user.set_password(data['password'])

        db.session.add(user)
        db.session.commit()

        return jsonify({
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'is_teacher': user.is_teacher,
                'is_superuser': user.is_superuser
            },
            'message': 'Registration successful'
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/profile', methods=['PUT'])
@jwt_required()
def update_profile():
    """
    Update user profile
    Accepts: { username: str, email: str, google_api_key: str }
    Returns: updated user object
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()

        # Update username if provided and not duplicate
        if 'username' in data and data['username'] != user.username:
            existing = User.query.filter_by(username=data['username']).first()
            if existing:
                return jsonify({'error': 'Username already exists'}), 400
            user.username = data['username']

        # Update email if provided and not duplicate
        if 'email' in data and data['email'] != user.email:
            existing = User.query.filter_by(email=data['email']).first()
            if existing:
                return jsonify({'error': 'Email already exists'}), 400
            user.email = data['email']

        # Update Google API key if provided
        if 'google_api_key' in data:
            user.google_api_key = data['google_api_key']

        db.session.commit()

        return jsonify({
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'is_teacher': user.is_teacher,
            'is_superuser': user.is_superuser,
            'google_api_key': user.google_api_key,
            'created_at': user.created_at.isoformat() if user.created_at else None
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@auth_api_bp.route('/change-password', methods=['POST'])
@jwt_required()
def change_password():
    """
    Change user password
    Accepts: { current_password: str, new_password: str }
    """
    try:
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)

        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()

        if not data or not all(k in data for k in ['current_password', 'new_password']):
            return jsonify({'error': 'Current password and new password are required'}), 400

        # Verify current password
        if not user.check_password(data['current_password']):
            return jsonify({'error': 'Current password is incorrect'}), 401

        # Validate new password length
        if len(data['new_password']) < 8:
            return jsonify({'error': 'Password must be at least 8 characters'}), 400

        # Set new password
        user.set_password(data['new_password'])
        user.is_first_login = False
        db.session.add(user)  # Ensure object is tracked by session
        db.session.commit()

        return jsonify({'message': 'Password changed successfully'}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
