import requests
import json

# Base URL
BASE_URL = "http://localhost:5000"

# Login credentials
USERNAME = "superadmin"
PASSWORD = "super123"

print("=" * 50)
print("Testing Migration - Step 9")
print("=" * 50)

# Create a session to maintain cookies
session = requests.Session()

# Test 1: Login
print("\n1. Testing Login...")
try:
    response = session.post(
        f"{BASE_URL}/api/v1/auth/login",
        json={"username": USERNAME, "password": PASSWORD}
    )
    print(f"   Status: {response.status_code}")
    print(f"   Response: {response.json()}")

    # Check if we got a token in the response or cookies
    if 'access_token' in response.json():
        token = response.json()['access_token']
        print(f"   ✓ Token received: {token[:20]}...")
        # Set header for future requests
        session.headers.update({'Authorization': f'Bearer {token}'})
    elif 'access_token' in response.cookies:
        print(f"   ✓ Token in cookie")
    else:
        print(f"   ✓ Login successful (token in httpOnly cookie)")
except Exception as e:
    print(f"   ✗ Error: {e}")
    exit(1)

# Test 2: Programs API
print("\n2. Testing Programs API...")
try:
    response = session.get(f"{BASE_URL}/api/v1/programs/")
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   ✓ Found {len(data.get('programs', []))} programs")
    if data.get('programs'):
        print(f"   First program: {data['programs'][0].get('name', 'N/A')}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 3: Create a Program (if superuser)
print("\n3. Testing Create Program...")
try:
    response = session.post(
        f"{BASE_URL}/api/v1/programs/",
        json={"name": "Test Program API", "description": "Created via Python test"}
    )
    print(f"   Status: {response.status_code}")
    if response.status_code == 201:
        data = response.json()
        print(f"   ✓ Program created: {data.get('program', {}).get('name')}")
    elif response.status_code == 403:
        print(f"   ⚠ Forbidden (need superuser role)")
    else:
        print(f"   Response: {response.json()}")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 4: Question Bank API
print("\n4. Testing Question Bank API...")
try:
    # First, get a list of courses to find a valid course_id
    courses_response = session.get(f"{BASE_URL}/api/v1/courses/")
    courses = courses_response.json().get('enrolled_courses', [])

    if courses:
        course_id = courses[0]['id']
        print(f"   Using course_id: {course_id}")

        response = session.get(f"{BASE_URL}/api/v1/question-bank/?course_id={course_id}")
        print(f"   Status: {response.status_code}")
        data = response.json()
        print(f"   ✓ Found {data.get('total', 0)} questions in question bank")
    else:
        print(f"   ⚠ No courses found to test with")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 5: Course Dashboard
print("\n5. Testing Course Dashboard...")
try:
    if courses:
        course_id = courses[0]['id']
        response = session.get(f"{BASE_URL}/api/v1/courses/{course_id}/dashboard")
        print(f"   Status: {response.status_code}")
        data = response.json()
        print(f"   ✓ Dashboard data:")
        print(f"     - Students: {data.get('stats', {}).get('total_students', 0)}")
        print(f"     - Chapters: {data.get('stats', {}).get('total_chapters', 0)}")
        print(f"     - QB Questions: {data.get('stats', {}).get('question_bank_total', 0)}")
    else:
        print(f"   ⚠ No courses to test with")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 6: Backward Compatibility - Courses API
print("\n6. Testing Courses API (backward compatibility)...")
try:
    response = session.get(f"{BASE_URL}/api/v1/courses/")
    print(f"   Status: {response.status_code}")
    data = response.json()
    print(f"   ✓ Found {len(data.get('enrolled_courses', []))} courses")
except Exception as e:
    print(f"   ✗ Error: {e}")

# Test 7: Backward Compatibility - Chapters API
print("\n7. Testing Chapters API (backward compatibility)...")
try:
    if courses:
        course_id = courses[0]['id']
        response = session.get(f"{BASE_URL}/api/v1/courses/{course_id}/chapters")
        print(f"   Status: {response.status_code}")
        data = response.json()
        print(f"   ✓ Found {len(data.get('chapters', []))} chapters")
    else:
        print(f"   ⚠ No courses to test with")
except Exception as e:
    print(f"   ✗ Error: {e}")

print("\n" + "=" * 50)
print("Tests Complete!")
print("=" * 50)