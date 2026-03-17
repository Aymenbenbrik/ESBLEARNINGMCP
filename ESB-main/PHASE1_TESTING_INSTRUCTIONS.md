# Phase 1 API Testing Instructions

This guide explains how to setup test data and test the Phase 1 API endpoints.

## Quick Start

### Option 1: Using Python Script (Recommended)

```bash
cd ESB-main
python scripts/setup_test_data.py
```

### Option 2: Using Flask CLI

```bash
cd ESB-main
flask setup-test-data
```

### Option 3: Using Flask Shell (Manual)

```bash
cd ESB-main
flask shell
```

Then paste the following code:

```python
from app.models import User, Course, Chapter, Document, Enrollment, TeacherStudent
from app import db
from datetime import datetime

# Create teacher
teacher = User.query.filter_by(username='teacher').first()
if not teacher:
    teacher = User(username='teacher', email='teacher@test.com', is_teacher=True)
    teacher.set_password('01234567')
    db.session.add(teacher)
    db.session.commit()

# Create student
student = User.query.filter_by(username='student').first()
if not student:
    student = User(username='student', email='student@test.com', is_teacher=False)
    student.set_password('12345678')
    db.session.add(student)
    db.session.commit()

# Associate teacher with student
assoc = TeacherStudent.query.filter_by(teacher_id=teacher.id, student_id=student.id).first()
if not assoc:
    assoc = TeacherStudent(teacher_id=teacher.id, student_id=student.id)
    db.session.add(assoc)
    db.session.commit()

# Create course
course = Course(title='Test Course', description='For API testing', teacher_id=teacher.id)
db.session.add(course)
db.session.flush()

# Create chapter
chapter = Chapter(title='Chapter 1', order=1, course_id=course.id)
db.session.add(chapter)
db.session.flush()

# Create document (Note: You'll need to manually upload a PDF via web interface first)
# Or use the scripts which create a minimal PDF automatically

# Enroll student
enrollment = Enrollment(student_id=student.id, course_id=course.id)
db.session.add(enrollment)
db.session.commit()

print(f"Course ID: {course.id}")
print(f"Chapter ID: {chapter.id}")
```

---

## Verify Setup

After running setup, verify everything is correct:

```bash
python scripts/verify_test_data.py
```

Expected output:
```
============================================================
VERIFYING TEST DATA
============================================================

Checking users...
  ✓ Teacher user exists (ID: 1)
  ✓ Student user exists (ID: 2)

Checking teacher-student association...
  ✓ Teacher-student association exists

Checking course...
  ✓ Course exists (ID: 1, Title: 'Test Course for API')

Checking chapter...
  ✓ Chapter exists (ID: 1, Title: 'Chapter 1: Introduction')

Checking document...
  ✓ Document exists (ID: 1, Title: 'Test Document')

Checking enrollment...
  ✓ Student enrolled in course

============================================================
✓ ALL CHECKS PASSED!
============================================================
```

---

## Test API Endpoints

### Automated Testing (PowerShell)

```powershell
cd ESB-main
.\scripts\test_api.ps1
```

This will test all major Phase 1 endpoints:
- ✓ Student login
- ✓ Get enrolled courses
- ✓ Get course details
- ✓ Get chapter documents
- ✓ Create quiz
- ✓ Get quiz questions
- ✓ Submit answers
- ✓ Complete quiz
- ✓ Get quiz results
- ✓ AI chat

### Manual Testing (PowerShell)

First, make sure the Flask server is running:

```bash
cd ESB-main
python run.py
```

Then in a new PowerShell window:

```powershell
# Create a web session to maintain cookies
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$baseUrl = "http://localhost:5000/api/v1"

# 1. Login as student
$loginBody = @{
    username = "student"
    password = "12345678"
} | ConvertTo-Json

$loginResponse = Invoke-WebRequest "$baseUrl/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody `
    -WebSession $session

$loginResponse.Content | ConvertFrom-Json

# 2. Get enrolled courses
$coursesResponse = Invoke-WebRequest "$baseUrl/courses/enrolled" `
    -Method GET `
    -WebSession $session

$courses = ($coursesResponse.Content | ConvertFrom-Json).courses
$courses | Format-Table

# 3. Get course details (use ID from previous step)
$courseId = $courses[0].id
$courseResponse = Invoke-WebRequest "$baseUrl/courses/$courseId" `
    -Method GET `
    -WebSession $session

$course = ($courseResponse.Content | ConvertFrom-Json).course
$course | ConvertTo-Json -Depth 3

# 4. Get chapter documents
$chapterId = $course.chapters[0].id
$docsResponse = Invoke-WebRequest "$baseUrl/chapters/$chapterId/documents" `
    -Method GET `
    -WebSession $session

$docs = ($docsResponse.Content | ConvertFrom-Json).documents
$docs | Format-Table

# 5. Create quiz
$documentId = $docs[0].id
$quizBody = @{
    num_questions = 5
} | ConvertTo-Json

$quizResponse = Invoke-WebRequest "$baseUrl/quiz/setup/$documentId" `
    -Method POST `
    -ContentType "application/json" `
    -Body $quizBody `
    -WebSession $session

$quiz = $quizResponse.Content | ConvertFrom-Json
$quiz

# 6. Get quiz questions
$quizId = $quiz.quiz_id
$questionsResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/questions" `
    -Method GET `
    -WebSession $session

$questions = $questionsResponse.Content | ConvertFrom-Json
$questions.questions | Format-List

# 7. Submit an answer
$answerBody = @{
    answer = "A"
} | ConvertTo-Json

$answerResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/answer/0" `
    -Method POST `
    -ContentType "application/json" `
    -Body $answerBody `
    -WebSession $session

$answerResponse.Content | ConvertFrom-Json

# 8. Complete quiz
$completeResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/complete" `
    -Method POST `
    -WebSession $session

$completeResponse.Content | ConvertFrom-Json

# 9. Get quiz results
$resultsResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/results" `
    -Method GET `
    -WebSession $session

$results = $resultsResponse.Content | ConvertFrom-Json
$results

# 10. AI Chat
$chatBody = @{
    message = "What is this document about?"
} | ConvertTo-Json

$chatResponse = Invoke-WebRequest "$baseUrl/documents/$documentId/chat" `
    -Method POST `
    -ContentType "application/json" `
    -Body $chatBody `
    -WebSession $session

$chat = $chatResponse.Content | ConvertFrom-Json
$chat.response
```

---

## Test Credentials

After running the setup script, use these credentials:

**Teacher Account:**
- Username: `teacher`
- Password: `01234567`

**Student Account:**
- Username: `student`
- Password: `12345678`

---

## Common Issues

### 1. "404 Not Found" when creating quiz

**Cause:** Document doesn't exist or student not enrolled

**Solution:**
```bash
python scripts/verify_test_data.py
```

If any checks fail, re-run:
```bash
python scripts/setup_test_data.py
```

### 2. "Access denied" error

**Cause:** Not logged in or session expired

**Solution:**
- Make sure you're using `-WebSession $session` in all requests
- Re-login if needed

### 3. "Only students can take quizzes"

**Cause:** Logged in as teacher instead of student

**Solution:**
- Login with student credentials (username: student, password: 12345678)

### 4. Quiz generation fails

**Cause:** Missing Gemini API key or syllabus data

**Solution:**
- Add Gemini API key to user settings
- For now, quiz generation might skip syllabus-dependent features

---

## API Endpoint Reference

### Authentication
- `POST /api/v1/auth/register` - Register new user
- `POST /api/v1/auth/login` - Login user
- `POST /api/v1/auth/logout` - Logout user
- `GET /api/v1/auth/me` - Get current user info

### Courses
- `GET /api/v1/courses/enrolled` - Get enrolled courses (student)
- `GET /api/v1/courses/teaching` - Get teaching courses (teacher)
- `GET /api/v1/courses/<id>` - Get course details
- `POST /api/v1/courses/` - Create course (teacher)
- `PUT /api/v1/courses/<id>` - Update course (teacher)
- `DELETE /api/v1/courses/<id>` - Delete course (teacher)
- `POST /api/v1/courses/<id>/enroll` - Enroll student (teacher)

### Chapters
- `GET /api/v1/chapters/<course_id>` - Get course chapters
- `GET /api/v1/chapters/<id>/details` - Get chapter details
- `POST /api/v1/chapters/<course_id>` - Create chapter (teacher)
- `PUT /api/v1/chapters/<id>` - Update chapter (teacher)
- `DELETE /api/v1/chapters/<id>` - Delete chapter (teacher)

### Documents
- `GET /api/v1/chapters/<id>/documents` - Get chapter documents
- `GET /api/v1/documents/<id>` - Get document details
- `POST /api/v1/chapters/<id>/documents` - Upload document (teacher)
- `DELETE /api/v1/documents/<id>` - Delete document (teacher)
- `GET /api/v1/documents/<id>/content` - Get document content

### Quiz
- `POST /api/v1/quiz/setup/<document_id>` - Create quiz (student)
- `GET /api/v1/quiz/<id>/questions` - Get quiz questions
- `POST /api/v1/quiz/<id>/answer/<index>` - Submit answer
- `POST /api/v1/quiz/<id>/complete` - Complete quiz
- `GET /api/v1/quiz/<id>/results` - Get quiz results
- `GET /api/v1/quiz/history` - Get quiz history (student)

### AI Chat
- `POST /api/v1/documents/<id>/chat` - Chat with document
- `GET /api/v1/documents/<id>/chat/history` - Get chat history

### Notes
- `GET /api/v1/notes/<document_id>` - Get document notes
- `POST /api/v1/notes/<document_id>` - Create note
- `PUT /api/v1/notes/<id>` - Update note
- `DELETE /api/v1/notes/<id>` - Delete note

### Syllabus
- `GET /api/v1/syllabus/<course_id>` - Get course syllabus
- `POST /api/v1/syllabus/<course_id>/generate` - Generate syllabus (teacher)

---

## Next Steps

After successfully testing Phase 1 API:

1. Create Postman collection for all endpoints
2. Document any issues or edge cases
3. Begin Next.js frontend integration
4. Setup production-ready seed data
5. Implement Phase 2 features (video analysis, advanced analytics)

---

## Need Help?

If you encounter issues:

1. Check Flask server logs in terminal
2. Verify test data with `python scripts/verify_test_data.py`
3. Check database state with `flask shell`
4. Review API implementation in `ESB-main/app/api/v1/`
