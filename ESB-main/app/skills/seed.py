"""
Seed the skill registry with initial skills and agent mappings.
Call seed_skills() during app initialization or via a CLI command.
"""
from app import db
from app.models.skills import Skill, AgentRegistry, skill_role_link


def seed_skills():
    """Register all built-in agents and skills."""

    # ── Agents ────────────────────────────────────────────────────────────
    agents_data = [
        {'id': 'assistant', 'name': 'Assistant Pédagogique',
         'agent_type': 'react', 'module_path': 'app.services.assistant_agent'},
        {'id': 'coach', 'name': 'Coach Étudiant',
         'agent_type': 'sequential', 'module_path': 'app.services.coach_agent'},
        {'id': 'exam', 'name': "Évaluateur d'Examens",
         'agent_type': 'graph', 'module_path': 'app.services.exam_agent_graph'},
        {'id': 'tp', 'name': 'Agent Travaux Pratiques',
         'agent_type': 'graph', 'module_path': 'app.services.tp_agent_graph'},
    ]

    for ad in agents_data:
        if not AgentRegistry.query.get(ad['id']):
            db.session.add(AgentRegistry(**ad))

    db.session.flush()

    # ── Skills ────────────────────────────────────────────────────────────
    skills_data = [
        {
            'id': 'bloom-classifier',
            'name': 'Bloom Taxonomy Classifier',
            'description': "Classifie tout contenu éducatif selon les 6 niveaux de la taxonomie de Bloom",
            'category': 'analysis',
            'module_path': 'app.skills.bloom_classifier',
            'temperature': 0.1,
            'agents': ['exam', 'tp', 'coach', 'assistant'],
            'roles': ['student', 'teacher', 'admin'],
        },
        {
            'id': 'syllabus-mapper',
            'name': 'Syllabus Outcome Mapper',
            'description': "Mappe un contenu aux Acquis d'Apprentissage (AA/CLO) du cours",
            'category': 'analysis',
            'module_path': 'app.skills.syllabus_mapper',
            'temperature': 0.2,
            'agents': ['exam', 'tp', 'coach'],
            'roles': ['teacher', 'admin'],
        },
        {
            'id': 'feedback-writer',
            'name': 'Pedagogical Feedback Writer',
            'description': "Génère un feedback pédagogique personnalisé et constructif",
            'category': 'generation',
            'module_path': 'app.skills.feedback_writer',
            'temperature': 0.5,
            'agents': ['exam', 'tp', 'coach', 'assistant'],
            'roles': ['student', 'teacher', 'admin'],
        },
        {
            'id': 'performance-scorer',
            'name': 'Performance Scorer',
            'description': "Calcule les scores de performance par AA, Bloom et module",
            'category': 'scoring',
            'module_path': 'app.skills.performance_scorer',
            'temperature': 0.1,
            'agents': ['coach', 'assistant'],
            'roles': ['student', 'teacher'],
        },
        {
            'id': 'weakness-detector',
            'name': 'Skill Gap Detector',
            'description': "Détecte les lacunes et faiblesses par compétence",
            'category': 'analysis',
            'module_path': 'app.skills.weakness_detector',
            'temperature': 0.2,
            'agents': ['coach', 'assistant'],
            'roles': ['student', 'teacher'],
        },
        {
            'id': 'exercise-recommender',
            'name': 'Exercise Recommender',
            'description': "Suggère des exercices ciblés pour combler les lacunes identifiées",
            'category': 'generation',
            'module_path': 'app.skills.exercise_recommender',
            'temperature': 0.4,
            'agents': ['coach', 'assistant'],
            'roles': ['student', 'teacher'],
        },
        {
            'id': 'study-planner',
            'name': 'Study Schedule Planner',
            'description': "Crée un planning d'étude personnalisé adapté au rythme de l'étudiant",
            'category': 'planning',
            'module_path': 'app.skills.study_planner',
            'temperature': 0.4,
            'agents': ['coach'],
            'roles': ['student'],
        },
        {
            'id': 'quiz-generator',
            'name': 'Quiz Generator',
            'description': "Génère des questions de quiz alignées aux AA et niveaux de Bloom",
            'category': 'generation',
            'module_path': 'app.skills.quiz_generator',
            'temperature': 0.5,
            'agents': ['assistant', 'tp'],
            'roles': ['teacher', 'admin'],
        },
        {
            'id': 'content-summarizer',
            'name': 'Content Summarizer',
            'description': "Résume les chapitres et sections adapté au niveau de l'étudiant",
            'category': 'generation',
            'module_path': 'app.skills.content_summarizer',
            'temperature': 0.4,
            'agents': ['assistant'],
            'roles': ['student'],
        },
        {
            'id': 'code-reviewer',
            'name': 'Pedagogical Code Reviewer',
            'description': "Review de code étudiant avec feedback pédagogique constructif",
            'category': 'analysis',
            'module_path': 'app.skills.code_reviewer',
            'temperature': 0.3,
            'agents': ['tp'],
            'roles': ['student', 'teacher'],
        },
        {
            'id': 'rubric-builder',
            'name': 'Rubric Builder',
            'description': "Crée des grilles d'évaluation alignées aux objectifs pédagogiques",
            'category': 'generation',
            'module_path': 'app.skills.rubric_builder',
            'temperature': 0.3,
            'agents': ['exam', 'tp'],
            'roles': ['teacher', 'admin'],
        },
        {
            'id': 'language-adapter',
            'name': 'Language & Tone Adapter',
            'description': "Adapte le langage et le ton (FR/EN/Tunisien) selon le contexte",
            'category': 'generation',
            'module_path': 'app.skills.language_adapter',
            'temperature': 0.3,
            'agents': ['assistant', 'coach'],
            'roles': ['student', 'teacher', 'admin'],
        },
    ]

    for sd in skills_data:
        agent_ids = sd.pop('agents', [])
        roles = sd.pop('roles', [])

        if Skill.query.get(sd['id']):
            continue

        skill = Skill(**sd)

        for aid in agent_ids:
            agent = AgentRegistry.query.get(aid)
            if agent:
                skill.agents.append(agent)

        db.session.add(skill)
        db.session.flush()

        for role in roles:
            db.session.execute(
                skill_role_link.insert().values(skill_id=skill.id, role=role)
            )

    db.session.commit()
