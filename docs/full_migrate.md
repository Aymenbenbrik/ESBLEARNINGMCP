# Migration Plan: ESB-Nour Features into nextjs-ESB Branch

## Context

The `ESB-Nour` branch adds major features (Question Bank, Program Management, Admin Dashboard, enhanced Superuser) using Flask template routes. Our `nextjs-ESB` branch uses a Next.js frontend consuming Flask API v1 endpoints. We need to:

1. Import the new **backend logic** (models, services) from ESB-Nour
2. Create new **API v1 endpoints** for each feature (so Next.js can consume them)
3. Keep the template routes for backward compatibility
4. **Ignore** the `appdir/` backup folder entirely

---

## Step 1: Preparation

- **1a)** Commit current uncommitted work on `nextjs-ESB` (`chat_service.py` + `ChatPageLayout.tsx`)
- **1b)** Create backup branch: `git checkout -b nextjs-ESB-backup && git checkout nextjs-ESB`
- **Verify:** `git status` shows clean working tree

---

## Step 2: Add New Database Models

**File:** `ESB-main/app/models.py`

**2a)** Insert `program_course` table + `ClassCourseAssignment` + `Program` models **after `TeacherStudent` (line 57) and before `Classe` (line 62)**. Source: `git show origin/ESB-Nour:ESB-main/app/models.py` lines 63-111.

```
TeacherStudent (existing, line 49-56)
  |
  +-- NEW: program_course table (M2M junction)
  +-- NEW: ClassCourseAssignment model
  +-- NEW: Program model (with courses_count property)
  |
Classe (existing, line 62)
```

**2b)** Enhance `Classe` model (line 62-73) - add 3 new fields:
- `academic_year = db.Column(db.String(20), nullable=True)`
- `program_id = db.Column(db.Integer, db.ForeignKey('program.id'), nullable=True)`
- `course_assignments` relationship to `ClassCourseAssignment`

**2c)** Add `chapters_count` property to `Course` model (before `__repr__`)

**2d)** Add `QuestionBankQuestion` model at end of file (after `QuizQuestion`, line 670). Source: ESB-Nour lines 750-792. Fields: course_id, chapter_id, question_text, choices, correct_choice, explanation, question_type, bloom_level, clo, difficulty, approved_at, approved_by_id, is_approved property.

**Verify:** `flask shell` -> `from app.models import Program, ClassCourseAssignment, QuestionBankQuestion` (no errors)

---

## Step 3: Update Services

**3a)** `ESB-main/app/services/ai_service.py` - Add defensive null-checks for `bloom_distribution` and `difficulty_distribution` in `build_quiz_prompt()`. Source: `git diff origin/nextjs-ESB..origin/ESB-Nour -- ESB-main/app/services/ai_service.py`

**3b)** `ESB-main/app/routes/quiz.py` - Add `_dedup_by_id()` helper and apply it to 3 `list(quiz.questions)` call sites. Fixes potential duplicate question bug.

**3c)** `ESB-main/app/routes/syllabus.py` - Add `target` parameter to `tn_quiz_setup()` for dual-use (quiz vs question bank).

**Skip:** `file_service.py` changes (ESB-Nour version introduces Windows path issues)

---

## Step 4: Copy Template Routes from ESB-Nour

These provide the business logic we'll extract for API routes + backward compatibility.

**4a)** Create `ESB-main/app/routes/question_bank.py` - Copy from ESB-Nour with fixes:
- Fix `QuestionBankQuestion.module_id` -> `QuestionBankQuestion.course_id` (bug in ESB-Nour)
- Adapt TN chapter queries to use correct field names (`TNChapter.syllabus_id`, `TNChapter.index`, not `course_id`/`chapter_index`)

**4b)** Create `ESB-main/app/routes/admin.py` - Copy from ESB-Nour with fixes:
- Remove `Program.year` references (field doesn't exist)
- Change `Classe.year` -> `Classe.academic_year`
- Remove `syllabus_path=src.syllabus_path` from course duplication
- Fix `Classe(name=name, year=year)` -> `Classe(name=name, academic_year=academic_year)`

**4c)** Update `ESB-main/app/routes/superuser.py` - Merge in new program/class routes from ESB-Nour.

**4d)** Copy new templates from ESB-Nour:
- `templates/question_bank/` (index.html, revision_setup.html, revision_take.html)
- `templates/admin/` (index.html, class_view.html, program_view.html)
- `templates/superuser/` (programs.html, program_detail.html, program_form.html, class_students.html, create_classe.html, edit_class.html)
- `templates/courses/dashboard.html`
- `templates/insights/student_dashboard.html`
- `templates/chapters/view.html` (updated)
- Other modified templates (base.html nav updates, etc.)

---

## Step 5: Update App Initialization

**File:** `ESB-main/app/__init__.py`

**5a)** Add `_bootstrap_db(app)` function (before `create_app()`). Auto-creates missing tables/columns for SQLite. Source: ESB-Nour `__init__.py`.

**5b)** Register new template blueprints (after line 175):
```python
from app.routes.admin import admin_bp
from app.routes.question_bank import question_bank_bp
app.register_blueprint(admin_bp)
app.register_blueprint(question_bank_bp)
```

**5c)** Call `_bootstrap_db(app)` at end of `create_app()` before `return app` (line 207).

**Verify:** Start Flask app, no import/registration errors.

---

## Step 6: Create New API v1 Endpoints

These convert ESB-Nour's template route logic into JSON APIs for Next.js consumption.

**6a)** Create `ESB-main/app/api/v1/programs.py` - Program CRUD:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/programs/` | List all programs |
| POST | `/api/v1/programs/` | Create program |
| GET | `/api/v1/programs/<id>` | Get program details + courses + classes |
| PUT | `/api/v1/programs/<id>` | Update program |
| DELETE | `/api/v1/programs/<id>` | Delete program |
| POST | `/api/v1/programs/<id>/courses` | Add course to program |
| POST | `/api/v1/programs/<id>/classes` | Create class in program |

Auth: superuser only. Pattern: follow `courses.py` API style.

**6b)** Create `ESB-main/app/api/v1/admin.py` - Class management:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/admin/dashboard` | Dashboard stats |
| GET | `/api/v1/admin/classes/<id>` | Class detail with assignments |
| POST | `/api/v1/admin/classes/<id>/assign-teachers` | Assign teachers per course |
| GET/POST | `/api/v1/admin/classes/<id>/students` | Manage class students |

Auth: superuser only. Accept JSON instead of form data.

**6c)** Create `ESB-main/app/api/v1/question_bank.py` - Question Bank:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/question-bank/` | List questions with filters (course_id, chapter_id, aaa, bloom, difficulty) |
| POST | `/api/v1/question-bank/approve` | Bulk approve/reject questions |
| POST | `/api/v1/question-bank/generate` | Generate questions for bank |
| POST | `/api/v1/question-bank/tn/generate/<course_id>` | TN question generation |
| POST | `/api/v1/question-bank/tn/approve/<course_id>` | Approve TN questions |
| GET | `/api/v1/question-bank/revision/<course_id>` | Get revision setup data |
| POST | `/api/v1/question-bank/revision/<course_id>` | Take revision quiz |
| GET | `/api/v1/question-bank/aaas` | Get AAA codes for course |

Auth: teacher+ for write, student+ for revision.

**6d)** Enhance `ESB-main/app/api/v1/courses.py` - Add dashboard endpoint:
- `GET /api/v1/courses/<id>/dashboard` - Returns stats (students, chapters, question bank counts, bloom/difficulty charts)

**6e)** Enhance `ESB-main/app/api/v1/users.py` - Add user listing endpoints:
- `GET /api/v1/users/` - List all users (superuser)
- `GET /api/v1/users/teachers` - List teachers (superuser)

---

## Step 7: Register New API Blueprints

**File:** `ESB-main/app/api/v1/__init__.py` (line 6) - Add imports for `programs`, `question_bank`, `admin`

**File:** `ESB-main/app/__init__.py` (after line 198) - Register new API blueprints:
```python
from app.api.v1.programs import programs_api_bp
from app.api.v1.question_bank import question_bank_api_bp
from app.api.v1.admin import admin_api_bp
api_v1_bp.register_blueprint(programs_api_bp)
api_v1_bp.register_blueprint(question_bank_api_bp)
api_v1_bp.register_blueprint(admin_api_bp)
```

---

## Step 8: Database Migration

```bash
cd ESB-main
flask db migrate -m "Add Program, ClassCourseAssignment, QuestionBankQuestion; enhance Classe"
flask db upgrade
```

Fallback: `_bootstrap_db()` handles auto-creation for SQLite.

---

## Step 9: Verification

- **Models:** `flask shell` -> create/query Program, ClassCourseAssignment, QuestionBankQuestion
- **API endpoints:** Test with curl:
  - `GET /api/v1/programs/`
  - `POST /api/v1/programs/` with `{"name":"Test"}`
  - `GET /api/v1/question-bank/?course_id=1`
  - `GET /api/v1/courses/1/dashboard`
- **Backward compat:** Existing API v1 endpoints still work (auth, courses, chapters, quiz, etc.)
- **Template routes:** `/question-bank/`, `/admin/` load without errors

---

## Known Bugs to Fix from ESB-Nour

1. `question_bank.py`: `QuestionBankQuestion.module_id` -> `.course_id`
2. `admin.py`: `Program.year` doesn't exist -> remove
3. `admin.py`: `Classe.year` -> `Classe.academic_year`
4. `admin.py`: `Course.syllabus_path` doesn't exist -> remove from duplication
5. `question_bank.py`: TN chapter queries use wrong field names -> adapt to our models

---

## Critical Files Summary

| File | Action |
|------|--------|
| `ESB-main/app/models.py` | Add 4 new models, enhance Classe/Course |
| `ESB-main/app/services/ai_service.py` | Add defensive null checks |
| `ESB-main/app/routes/question_bank.py` | NEW - copy from ESB-Nour with fixes |
| `ESB-main/app/routes/admin.py` | NEW - copy from ESB-Nour with fixes |
| `ESB-main/app/routes/superuser.py` | MERGE new program/class routes |
| `ESB-main/app/routes/quiz.py` | Add dedup helper |
| `ESB-main/app/routes/syllabus.py` | Add target parameter |
| `ESB-main/app/__init__.py` | Add bootstrap_db, register blueprints |
| `ESB-main/app/api/v1/programs.py` | NEW - Programs API |
| `ESB-main/app/api/v1/admin.py` | NEW - Admin/Classes API |
| `ESB-main/app/api/v1/question_bank.py` | NEW - Question Bank API |
| `ESB-main/app/api/v1/courses.py` | Add dashboard endpoint |
| `ESB-main/app/api/v1/users.py` | Add user listing endpoints |
| `ESB-main/app/api/v1/__init__.py` | Register new sub-blueprints |
| `ESB-main/app/templates/` | Copy new templates from ESB-Nour |
