# PowerShell Script for Testing Phase 1 API Endpoints
# Run: .\scripts\test_api.ps1

$ErrorActionPreference = "Continue"
$baseUrl = "http://localhost:5000/api/v1"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "PHASE 1 API TESTING SCRIPT" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# Helper function for colored output
function Write-Success {
    param($message)
    Write-Host "[OK] " -ForegroundColor Green -NoNewline
    Write-Host $message
}

function Write-Error-Message {
    param($message)
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $message
}

function Write-Info {
    param($message)
    Write-Host "  -> " -ForegroundColor Blue -NoNewline
    Write-Host $message
}

# Create web session
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

# Test 1: Login as student
Write-Host "`nTest 1: Student Login" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $loginBody = @{
        username = "student"
        password = "12345678"
    } | ConvertTo-Json

    $loginResponse = Invoke-WebRequest "$baseUrl/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody `
        -WebSession $session `
        -ErrorAction Stop

    $loginData = $loginResponse.Content | ConvertFrom-Json
    Write-Success "Student logged in successfully"
    Write-Info "User ID: $($loginData.user.id)"
    Write-Info "Username: $($loginData.user.username)"
} catch {
    Write-Error-Message "Student login failed"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test 2: Get enrolled courses
Write-Host "`nTest 2: Get Enrolled Courses" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $coursesResponse = Invoke-WebRequest "$baseUrl/courses/" `
        -Method GET `
        -WebSession $session `
        -ErrorAction Stop

    $coursesData = $coursesResponse.Content | ConvertFrom-Json
    Write-Success "Retrieved courses"
    Write-Info "Number of enrolled courses: $($coursesData.enrolled_courses.Count)"

    if ($coursesData.enrolled_courses.Count -eq 0) {
        Write-Error-Message "No enrolled courses found. Run setup_test_data.py first."
        exit 1
    }

    $courseId = $coursesData.enrolled_courses[0].id
    Write-Info "Using Course ID: $courseId"
} catch {
    Write-Error-Message "Failed to get courses"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test 3: Get course details
Write-Host "`nTest 3: Get Course Details" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $courseResponse = Invoke-WebRequest "$baseUrl/courses/$courseId" `
        -Method GET `
        -WebSession $session `
        -ErrorAction Stop

    $courseData = $courseResponse.Content | ConvertFrom-Json
    Write-Success "Retrieved course details"
    Write-Info "Title: $($courseData.course.title)"
    Write-Info "Chapters: $($courseData.course.chapters.Count)"

    if ($courseData.course.chapters.Count -eq 0) {
        Write-Error-Message "No chapters found in course"
        exit 1
    }

    $chapterId = $courseData.course.chapters[0].id
    Write-Info "Using Chapter ID: $chapterId"
} catch {
    Write-Error-Message "Failed to get course details"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test 4: Get chapter documents
Write-Host "`nTest 4: Get Chapter Documents" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $docsResponse = Invoke-WebRequest "$baseUrl/chapters/$chapterId/documents" `
        -Method GET `
        -WebSession $session `
        -ErrorAction Stop

    $docsData = $docsResponse.Content | ConvertFrom-Json
    Write-Success "Retrieved chapter documents"
    Write-Info "Number of documents: $($docsData.documents.Count)"

    if ($docsData.documents.Count -eq 0) {
        Write-Error-Message "No documents found in chapter"
        exit 1
    }

    $documentId = $docsData.documents[0].id
    Write-Info "Using Document ID: $documentId"
} catch {
    Write-Error-Message "Failed to get documents"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test 5: Create quiz
Write-Host "`nTest 5: Create Quiz" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $quizBody = @{
        num_questions = 5
    } | ConvertTo-Json

    $quizResponse = Invoke-WebRequest "$baseUrl/quiz/setup/$documentId" `
        -Method POST `
        -ContentType "application/json" `
        -Body $quizBody `
        -WebSession $session `
        -ErrorAction Stop

    $quizData = $quizResponse.Content | ConvertFrom-Json
    Write-Success "Quiz created successfully"
    Write-Info "Quiz ID: $($quizData.quiz_id)"
    Write-Info "Number of questions: $($quizData.num_questions)"

    $quizId = $quizData.quiz_id
} catch {
    Write-Error-Message "Failed to create quiz"
    Write-Host $_.Exception.Message -ForegroundColor Red

    # Show response content if available
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response: $responseBody" -ForegroundColor Red
    }
    exit 1
}

# Test 6: Get quiz questions
Write-Host "`nTest 6: Get Quiz Questions" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $questionsResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/questions" `
        -Method GET `
        -WebSession $session `
        -ErrorAction Stop

    $questionsData = $questionsResponse.Content | ConvertFrom-Json
    Write-Success "Retrieved quiz questions"
    Write-Info "Total questions: $($questionsData.total)"
    Write-Info "First question: $($questionsData.questions[0].question)"
} catch {
    Write-Error-Message "Failed to get quiz questions"
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}

# Test 7: Submit answer
Write-Host "`nTest 7: Submit Answer" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $answerBody = @{
        answer = "A"
    } | ConvertTo-Json

    $answerResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/answer/0" `
        -Method POST `
        -ContentType "application/json" `
        -Body $answerBody `
        -WebSession $session `
        -ErrorAction Stop

    $answerData = $answerResponse.Content | ConvertFrom-Json
    Write-Success "Answer submitted"
    Write-Info "Message: $($answerData.message)"
    if ($answerData.is_correct -ne $null) {
        Write-Info "Correct: $($answerData.is_correct)"
    }
} catch {
    Write-Error-Message "Failed to submit answer"
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Test 8: Complete quiz
Write-Host "`nTest 8: Complete Quiz" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $completeResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/complete" `
        -Method POST `
        -WebSession $session `
        -ErrorAction Stop

    $completeData = $completeResponse.Content | ConvertFrom-Json
    Write-Success "Quiz completed"
    Write-Info "Message: $($completeData.message)"
    if ($completeData.score -ne $null) {
        Write-Info "Score: $($completeData.score)%"
    }
} catch {
    Write-Error-Message "Failed to complete quiz"
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Test 9: Get quiz results
Write-Host "`nTest 9: Get Quiz Results" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $resultsResponse = Invoke-WebRequest "$baseUrl/quiz/$quizId/results" `
        -Method GET `
        -WebSession $session `
        -ErrorAction Stop

    $resultsData = $resultsResponse.Content | ConvertFrom-Json
    Write-Success "Retrieved quiz results"
    Write-Info "Score: $($resultsData.score)%"
    Write-Info "Correct: $($resultsData.correct_count)/$($resultsData.total_questions)"
    Write-Info "Time taken: $($resultsData.time_taken)"
} catch {
    Write-Error-Message "Failed to get quiz results"
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Test 10: AI Chat
Write-Host "`nTest 10: AI Chat" -ForegroundColor Yellow
Write-Host "------------------------------------------------------------"
try {
    $chatBody = @{
        message = "What is this document about?"
    } | ConvertTo-Json

    $chatResponse = Invoke-WebRequest "$baseUrl/documents/$documentId/chat" `
        -Method POST `
        -ContentType "application/json" `
        -Body $chatBody `
        -WebSession $session `
        -ErrorAction Stop

    $chatData = $chatResponse.Content | ConvertFrom-Json
    Write-Success "Chat response received"
    Write-Info "Response length: $($chatData.response.Length) characters"
} catch {
    Write-Error-Message "Failed to send chat message"
    Write-Host $_.Exception.Message -ForegroundColor Red
}

# Summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "TESTING COMPLETE" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Success "Phase 1 API endpoints are working!"
Write-Host ""
