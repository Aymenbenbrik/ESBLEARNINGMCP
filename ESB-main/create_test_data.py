from app import create_app, db
from app.models import Course, Chapter, Program, User

app = create_app()

with app.app_context():
    print("Creating test data...")

    # Get a teacher user
    teacher = User.query.filter_by(username='teacher').first()
    if not teacher:
        print("✗ No teacher found!")
        exit(1)

    # Get or create Program
    program = Program.query.filter_by(name="Computer Science Program").first()
    if program:
        print(f"ℹ Using existing Program: {program.name} (ID: {program.id})")
    else:
        program = Program(name="Computer Science Program", description="CS courses")
        db.session.add(program)
        db.session.flush()
        print(f"✓ Created Program: {program.name} (ID: {program.id})")

    # Get or create Course
    course = Course.query.filter_by(
        title="Introduction to Python",
        teacher_id=teacher.id
    ).first()
    if course:
        print(f"ℹ Using existing Course: {course.title} (ID: {course.id})")
    else:
        course = Course(
            title="Introduction to Python",
            description="Learn Python programming",
            teacher_id=teacher.id
        )
        db.session.add(course)
        db.session.flush()
        print(f"✓ Created Course: {course.title} (ID: {course.id})")

    # Add course to program if not already added
    if course not in program.courses:
        program.courses.append(course)
        print(f"ℹ Associated Course with Program")

    # Create or get Chapters
    chapters_created = 0
    chapters_existing = 0
    for i in range(1, 4):
        chapter_title = f"Chapter {i}: Python Basics"
        existing_chapter = Chapter.query.filter_by(
            course_id=course.id,
            order=i
        ).first()

        if existing_chapter:
            print(f"ℹ Using existing Chapter: {existing_chapter.title} (ID: {existing_chapter.id})")
            chapters_existing += 1
        else:
            chapter = Chapter(
                title=chapter_title,
                summary=f"Learning fundamentals - Part {i}",
                course_id=course.id,
                order=i
            )
            db.session.add(chapter)
            db.session.flush()  # Ensure we get the ID
            print(f"✓ Created Chapter: {chapter.title} (ID: {chapter.id})")
            chapters_created += 1

    db.session.commit()
    print(f"\n✓ Test data created successfully!")
    print(f"  - {chapters_created} new chapters created")
    print(f"  - {chapters_existing} existing chapters found")
    print(f"\nYou can now test with:")
    print(f"  - Program ID: {program.id}")
    print(f"  - Course ID: {course.id}")

    # Verify chapters in database
    final_chapter_count = Chapter.query.filter_by(course_id=course.id).count()
    print(f"  - Total chapters in DB for this course: {final_chapter_count}")