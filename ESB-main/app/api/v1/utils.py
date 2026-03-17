"""
API v1 Utilities
Shared decorators, helpers, and utilities for API endpoints
"""

from flask import jsonify
from flask_jwt_extended import get_jwt_identity
from functools import wraps
from app.models import User
import logging

logger = logging.getLogger(__name__)


def get_current_user():
    """
    Get current authenticated user from JWT token

    Returns:
        User: The authenticated user object or None if not found
    """
    try:
        user_id = int(get_jwt_identity())
        return User.query.get(user_id)
    except (ValueError, TypeError) as e:
        logger.error(f"Error getting current user: {e}")
        return None


def superuser_required(f):
    """
    Decorator to require superuser access

    Usage:
        @jwt_required()
        @superuser_required
        def my_endpoint():
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user or not user.is_superuser:
            return jsonify({'error': 'Superuser access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def teacher_required(f):
    """
    Decorator to require teacher access (teacher or superuser)

    Usage:
        @jwt_required()
        @teacher_required
        def my_endpoint():
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user or not (user.is_teacher or user.is_superuser):
            return jsonify({'error': 'Teacher access required'}), 403
        return f(*args, **kwargs)
    return decorated_function


def parse_int_list(value, separator=','):
    """
    Parse comma-separated string into list of integers

    Args:
        value: String with comma-separated values or None
        separator: Delimiter to split on (default: ',')

    Returns:
        list: List of integers, empty list if value is None/empty

    Examples:
        parse_int_list('1,2,3') -> [1, 2, 3]
        parse_int_list('') -> []
        parse_int_list(None) -> []
        parse_int_list('1,abc,3') -> [1, 3]
    """
    if not value:
        return []

    try:
        return [
            int(v.strip())
            for v in str(value).split(separator)
            if v.strip() and v.strip().isdigit()
        ]
    except (ValueError, AttributeError) as e:
        logger.warning(f"Error parsing int list from '{value}': {e}")
        return []


def parse_string_list(value, separator=','):
    """
    Parse comma-separated string into list of strings

    Args:
        value: String with comma-separated values or None
        separator: Delimiter to split on (default: ',')

    Returns:
        list: List of strings, empty list if value is None/empty

    Examples:
        parse_string_list('a,b,c') -> ['a', 'b', 'c']
        parse_string_list('') -> []
        parse_string_list(None) -> []
    """
    if not value:
        return []

    try:
        return [
            v.strip()
            for v in str(value).split(separator)
            if v.strip()
        ]
    except AttributeError as e:
        logger.warning(f"Error parsing string list from '{value}': {e}")
        return []


def validate_pagination(limit=None, offset=None, max_limit=100, default_limit=50):
    """
    Validate and normalize pagination parameters

    Args:
        limit: Requested limit (None uses default)
        offset: Requested offset (None uses 0)
        max_limit: Maximum allowed limit
        default_limit: Default limit if not specified

    Returns:
        tuple: (validated_limit, validated_offset)

    Examples:
        validate_pagination(10, 20) -> (10, 20)
        validate_pagination(200, 0) -> (100, 0)  # capped at max
        validate_pagination(None, None) -> (50, 0)  # defaults
    """
    # Validate limit
    if limit is None:
        limit = default_limit
    else:
        try:
            limit = int(limit)
            limit = max(1, min(limit, max_limit))  # Clamp between 1 and max_limit
        except (ValueError, TypeError):
            limit = default_limit

    # Validate offset
    if offset is None:
        offset = 0
    else:
        try:
            offset = int(offset)
            offset = max(0, offset)  # Ensure non-negative
        except (ValueError, TypeError):
            offset = 0

    return limit, offset
