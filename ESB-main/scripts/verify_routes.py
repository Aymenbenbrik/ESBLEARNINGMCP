#!/usr/bin/env python
"""
Script to verify all API v1 routes are registered correctly.
Run with: python scripts/verify_routes.py
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app import create_app

def verify_api_routes():
    """Check if all Phase 1 API endpoints are registered."""
    app = create_app()

    # Expected endpoints from Phase 1
    expected_endpoints = {
        # Quiz API (8 endpoints)
        'POST /api/v1/quiz/setup/<int:document_id>',
        'GET /api/v1/quiz/<int:quiz_id>',
        'GET /api/v1/quiz/<int:quiz_id>/questions',
        'POST /api/v1/quiz/<int:quiz_id>/answer/<int:question_index>',
        'POST /api/v1/quiz/<int:quiz_id>/complete',
        'GET /api/v1/quiz/<int:quiz_id>/results',
        'GET /api/v1/quiz/history/<int:document_id>',
        'DELETE /api/v1/quiz/<int:quiz_id>',

        # AI Chat API (6 endpoints)
        'POST /api/v1/ai/chat/<int:document_id>',
        'GET /api/v1/ai/chat/<int:document_id>/history',
        'POST /api/v1/ai/chat/<int:document_id>/clear',
        'POST /api/v1/ai/chapter-chat/<int:chapter_id>',
        'GET /api/v1/ai/chapter-chat/<int:chapter_id>/history',
        'POST /api/v1/ai/chapter-chat/<int:chapter_id>/clear',

        # Syllabus API (8 endpoints)
        'POST /api/v1/syllabus/<int:course_id>/upload',
        'GET /api/v1/syllabus/<int:course_id>',
        'POST /api/v1/syllabus/<int:course_id>/extract',
        'POST /api/v1/syllabus/<int:course_id>/classify',
        'GET /api/v1/syllabus/<int:course_id>/clo',
        'GET /api/v1/syllabus/<int:course_id>/plo',
        'GET /api/v1/syllabus/<int:course_id>/weekly-plan',
        'GET /api/v1/syllabus/<int:course_id>/download',

        # Notes API (4 endpoints)
        'POST /api/v1/notes/',
        'GET /api/v1/notes/document/<int:document_id>',
        'DELETE /api/v1/notes/<int:note_id>',
        'GET /api/v1/notes/image/<path:filename>',

        # Documents API extensions (2 endpoints)
        'GET /api/v1/documents/<int:document_id>/extraction',
        'GET /api/v1/documents/<int:document_id>/notes',
    }

    # Get all registered routes
    registered_routes = set()
    for rule in app.url_map.iter_rules():
        if '/api/v1/' in rule.rule:
            # Convert rule to normalized format
            methods = [m for m in rule.methods if m not in ['HEAD', 'OPTIONS']]
            for method in methods:
                route_str = f"{method} {rule.rule}"
                registered_routes.add(route_str)

    # Check which endpoints are registered
    print("=" * 80)
    print("PHASE 1 API ENDPOINTS VERIFICATION")
    print("=" * 80)
    print()

    found_count = 0
    missing_count = 0

    print("✅ REGISTERED ENDPOINTS:")
    print("-" * 80)
    for endpoint in sorted(expected_endpoints):
        if endpoint in registered_routes:
            print(f"✅ {endpoint}")
            found_count += 1
        else:
            print(f"❌ MISSING: {endpoint}")
            missing_count += 1

    print()
    print("=" * 80)
    print(f"SUMMARY: {found_count}/{len(expected_endpoints)} endpoints registered")
    print("=" * 80)

    if missing_count == 0:
        print("🎉 SUCCESS! All Phase 1 endpoints are registered.")
        return 0
    else:
        print(f"⚠️  WARNING: {missing_count} endpoints are missing.")
        return 1

    print()
    print("All registered /api/v1/ routes:")
    print("-" * 80)
    for route in sorted(registered_routes):
        print(route)

if __name__ == '__main__':
    sys.exit(verify_api_routes())
