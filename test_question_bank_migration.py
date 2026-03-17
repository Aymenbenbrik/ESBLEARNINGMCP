"""
Test script for Question Bank Migration Feature
Verifies migration endpoint and data integrity
"""

import requests
import json
from datetime import datetime

# Configuration
BASE_URL = "http://localhost:5000"
API_BASE = f"{BASE_URL}/api/v1"

# Test data
TEST_COURSE_ID = 15  # Replace with actual course ID


def print_section(title):
    """Print formatted section header"""
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}\n")


def test_migration_endpoint(jwt_token, course_id):
    """Test the migration endpoint"""
    print_section(f"Testing Migration for Course {course_id}")

    url = f"{API_BASE}/question-bank/migrate-from-documents"
    headers = {
        "Content-Type": "application/json",
        "Cookie": f"access_token_cookie={jwt_token}"
    }
    payload = {"course_id": course_id}

    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}")

    try:
        response = requests.post(url, headers=headers, json=payload)

        print(f"\nStatus Code: {response.status_code}")
        print(f"Response: {json.dumps(response.json(), indent=2)}")

        if response.status_code == 200:
            data = response.json()
            print(f"\n✅ Migration successful!")
            print(f"   Migrated: {data.get('migrated', 0)} questions")
            print(f"   Skipped: {data.get('skipped', 0)} (duplicates)")
            print(f"   Errors: {data.get('errors', 0)}")
            print(f"   Documents processed: {data.get('documents_processed', 0)}")
            return True
        else:
            print(f"\n❌ Migration failed: {response.json().get('error', 'Unknown error')}")
            return False

    except Exception as e:
        print(f"\n❌ Exception occurred: {str(e)}")
        return False


def verify_questions_list(jwt_token, course_id):
    """Verify questions are retrievable via list endpoint"""
    print_section(f"Verifying Question List for Course {course_id}")

    url = f"{API_BASE}/question-bank/"
    headers = {
        "Cookie": f"access_token_cookie={jwt_token}"
    }
    params = {
        "course_id": course_id,
        "limit": 10
    }

    print(f"GET {url}")
    print(f"Params: {json.dumps(params, indent=2)}")

    try:
        response = requests.get(url, headers=headers, params=params)

        print(f"\nStatus Code: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            questions = data.get('questions', [])
            total = data.get('total', 0)

            print(f"\n✅ Questions retrieved successfully!")
            print(f"   Total questions in bank: {total}")
            print(f"   Questions in this page: {len(questions)}")

            if questions:
                print(f"\n   Sample Question:")
                q = questions[0]
                print(f"   - ID: {q.get('id')}")
                print(f"   - Text: {q.get('question_text', '')[:60]}...")
                print(f"   - Bloom Level: {q.get('bloom_level')}")
                print(f"   - Difficulty: {q.get('difficulty')}")
                print(f"   - CLO/AAA: {q.get('clo')}")
                print(f"   - Approved: {q.get('is_approved')}")

            return total > 0
        else:
            print(f"\n❌ Failed to retrieve questions: {response.json().get('error', 'Unknown error')}")
            return False

    except Exception as e:
        print(f"\n❌ Exception occurred: {str(e)}")
        return False


def check_quiz_documents(jwt_token, course_id):
    """Check how many quiz documents exist for the course"""
    print_section(f"Checking Quiz Documents for Course {course_id}")

    # This would need a custom endpoint or direct DB access
    # For now, we'll just document what to check

    print("To verify quiz documents exist, run this SQL query:")
    print(f"""
    SELECT COUNT(*) as total_docs,
           COUNT(CASE WHEN quiz_data IS NOT NULL THEN 1 END) as with_quiz_data
    FROM document
    WHERE course_id = {course_id}
      AND document_type = 'quiz';
    """)


def run_full_test(jwt_token, course_id):
    """Run full test suite"""
    print(f"\n{'#'*60}")
    print(f"  Question Bank Migration Test Suite")
    print(f"  Course ID: {course_id}")
    print(f"  Timestamp: {datetime.now().isoformat()}")
    print(f"{'#'*60}")

    # Check quiz documents
    check_quiz_documents(jwt_token, course_id)

    # Run migration
    migration_success = test_migration_endpoint(jwt_token, course_id)

    # Verify questions
    questions_exist = verify_questions_list(jwt_token, course_id)

    # Summary
    print_section("Test Summary")
    print(f"Migration: {'✅ PASSED' if migration_success else '❌ FAILED'}")
    print(f"Questions Retrieved: {'✅ PASSED' if questions_exist else '❌ FAILED'}")

    if migration_success and questions_exist:
        print(f"\n🎉 All tests passed! Migration working correctly.")
    else:
        print(f"\n⚠️  Some tests failed. Check logs above for details.")


if __name__ == "__main__":
    print("Question Bank Migration Test Script")
    print("="*60)

    # Get JWT token from user
    jwt_token = input("\nEnter your JWT token (from access_token_cookie): ").strip()

    if not jwt_token:
        print("❌ JWT token is required!")
        exit(1)

    # Get course ID
    course_input = input(f"Enter course ID (default: {TEST_COURSE_ID}): ").strip()
    course_id = int(course_input) if course_input else TEST_COURSE_ID

    # Run tests
    run_full_test(jwt_token, course_id)

    # Test idempotency
    print("\n" + "="*60)
    retry = input("\nRun migration again to test idempotency? (y/n): ").strip().lower()
    if retry == 'y':
        print_section("Testing Idempotency (Should skip all questions)")
        test_migration_endpoint(jwt_token, course_id)
