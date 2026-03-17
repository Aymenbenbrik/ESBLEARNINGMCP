#!/usr/bin/env python3
"""
Test script for quiz approval workflow.
Run this after starting the Flask server to verify the new endpoints.

Usage:
    python test_quiz_approval.py <teacher_jwt_token> <course_id>

Example:
    python test_quiz_approval.py eyJhbGc... 1
"""

import sys
import json
import requests

BASE_URL = "http://localhost:5000/api/v1"


def test_quiz_generation(token, course_id):
    """Test quiz generation (should NOT save to database)"""
    print(f"\n{'='*60}")
    print("TEST 1: Quiz Generation (No Database Save)")
    print(f"{'='*60}")

    url = f"{BASE_URL}/courses/{course_id}/quiz/teacher-generate"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "chapter_ids": [1],
        "num_mcq": 5,
        "num_open": 2,
        "bloom_distribution": {
            "remember": 20,
            "understand": 30,
            "apply": 20,
            "analyze": 15,
            "evaluate": 10,
            "create": 5
        },
        "difficulty_distribution": {
            "easy": 33,
            "medium": 34,
            "hard": 33
        }
    }

    print(f"POST {url}")
    print(f"Request: {json.dumps(data, indent=2)}")

    try:
        response = requests.post(url, headers=headers, json=data)
        print(f"\nStatus Code: {response.status_code}")

        if response.status_code == 200:
            print("✅ SUCCESS: Quiz generated without saving (status 200)")
            result = response.json()
            print(f"\nResponse keys: {list(result.keys())}")
            print(f"Number of questions: {result.get('num_questions')}")
            print(f"Title: {result.get('title')}")

            # Check if questions array exists
            if 'questions' in result:
                print(f"✅ Questions array present ({len(result['questions'])} questions)")
                return result
            else:
                print("❌ FAIL: Questions array missing in response")
                return None
        else:
            print(f"❌ FAIL: Expected status 200, got {response.status_code}")
            print(f"Response: {response.text}")
            return None

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return None


def test_quiz_approval(token, course_id, quiz_data):
    """Test quiz approval (should save to database)"""
    print(f"\n{'='*60}")
    print("TEST 2: Quiz Approval (Save to Database)")
    print(f"{'='*60}")

    if not quiz_data:
        print("❌ SKIP: No quiz data from generation test")
        return False

    url = f"{BASE_URL}/courses/{course_id}/quiz/approve"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "questions": quiz_data.get('questions', []),
        "title": quiz_data.get('title', 'Test Quiz'),
        "metadata": quiz_data.get('metadata', {})
    }

    print(f"POST {url}")
    print(f"Approving {len(data['questions'])} questions")

    try:
        response = requests.post(url, headers=headers, json=data)
        print(f"\nStatus Code: {response.status_code}")

        if response.status_code == 201:
            print("✅ SUCCESS: Quiz approved and saved (status 201)")
            result = response.json()
            print(f"\nDocument ID: {result.get('document_id')}")
            print(f"Number of questions: {result.get('num_questions')}")
            print(f"Title: {result.get('title')}")
            return True
        else:
            print(f"❌ FAIL: Expected status 201, got {response.status_code}")
            print(f"Response: {response.text}")
            return False

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def test_unauthorized_access(course_id):
    """Test that endpoints require authentication"""
    print(f"\n{'='*60}")
    print("TEST 3: Unauthorized Access (Should Fail)")
    print(f"{'='*60}")

    url = f"{BASE_URL}/courses/{course_id}/quiz/teacher-generate"

    print(f"POST {url} (no auth token)")

    try:
        response = requests.post(url, json={})
        print(f"Status Code: {response.status_code}")

        if response.status_code == 401:
            print("✅ SUCCESS: Unauthorized access blocked (status 401)")
            return True
        else:
            print(f"❌ FAIL: Expected status 401, got {response.status_code}")
            return False

    except Exception as e:
        print(f"❌ ERROR: {e}")
        return False


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    token = sys.argv[1]
    course_id = sys.argv[2]

    print(f"\nTesting Quiz Approval Workflow")
    print(f"Course ID: {course_id}")
    print(f"Token: {token[:20]}...")

    # Test 1: Generate quiz (no save)
    quiz_data = test_quiz_generation(token, course_id)

    # Test 2: Approve quiz (save)
    if quiz_data:
        test_quiz_approval(token, course_id, quiz_data)

    # Test 3: Unauthorized access
    test_unauthorized_access(course_id)

    print(f"\n{'='*60}")
    print("Tests Complete")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
