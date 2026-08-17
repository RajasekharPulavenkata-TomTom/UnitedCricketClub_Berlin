"""
Tests for /api/quiz endpoints.
Covers:
 - Deploy-time seeding of cricket questions (idempotent _seed)
 - Field-type questions included
 - Response shape (10 questions, 4 options each, correct answer present)
"""
import pytest

pytestmark = pytest.mark.api


@pytest.fixture
def seeded_quiz(db):
    """Seed quiz questions the same way vercel_build.py does at deploy time.

    Seeding used to happen lazily inside GET /quiz/questions; it now runs once
    per deployment, so tests seed explicitly.
    """
    from routers.quiz import _seed
    _seed(db)


class TestGetQuestions:
    def test_returns_10_questions(self, client, auth, seeded_quiz):
        res = client.get("/api/quiz/questions", headers=auth)
        assert res.status_code == 200
        assert len(res.json()) == 10

    def test_seed_is_idempotent(self, db, seeded_quiz):
        from routers.quiz import _seed
        from models.quiz import QuizQuestion
        count = db.query(QuizQuestion).count()
        assert count > 0
        _seed(db)  # second run must not duplicate questions
        assert db.query(QuizQuestion).count() == count

    def test_get_does_not_seed(self, client, auth, db):
        from models.quiz import QuizQuestion
        assert db.query(QuizQuestion).count() == 0
        res = client.get("/api/quiz/questions", headers=auth)
        assert res.status_code == 200
        assert res.json() == []
        assert db.query(QuizQuestion).count() == 0

    def test_all_questions_have_required_fields(self, client, auth, seeded_quiz):
        questions = client.get("/api/quiz/questions", headers=auth).json()
        for q in questions:
            assert "question" in q
            assert "options" in q
            assert "correct" in q
            assert "difficulty" in q
            assert "type" in q
            assert q["difficulty"] in ("easy", "medium", "hard")

    def test_each_question_has_4_options(self, client, auth, seeded_quiz):
        questions = client.get("/api/quiz/questions", headers=auth).json()
        for q in questions:
            assert len(q["options"]) == 4

    def test_correct_answer_is_in_options(self, client, auth, seeded_quiz):
        questions = client.get("/api/quiz/questions", headers=auth).json()
        for q in questions:
            assert q["correct"] in q["options"]

    def test_options_are_shuffled(self, client, auth, seeded_quiz):
        # Run twice and check that option order differs at least once across questions
        qs1 = client.get("/api/quiz/questions", headers=auth).json()
        qs2 = client.get("/api/quiz/questions", headers=auth).json()
        # Match questions by correct answer where possible
        seen_different = any(
            q1.get("options") != q2.get("options")
            for q1 in qs1
            for q2 in qs2
            if q1["correct"] == q2["correct"]
        )
        # This test is probabilistic; extremely unlikely to be all-same
        # (probability (1/4!)^N per matching pair)
        assert seen_different or len(qs1) == 0

    def test_field_type_questions_are_seeded(self, db, seeded_quiz):
        from models.quiz import QuizQuestion
        field_qs = db.query(QuizQuestion).filter(QuizQuestion.question_type == "field").all()
        assert len(field_qs) >= 15

    def test_field_questions_have_position_key(self, db, seeded_quiz):
        from models.quiz import QuizQuestion
        for q in db.query(QuizQuestion).filter(QuizQuestion.question_type == "field").all():
            assert q.field_position is not None
            assert len(q.field_position) > 0

    def test_all_questions_are_cricket_category(self, db, seeded_quiz):
        from models.quiz import QuizQuestion
        non_cricket = db.query(QuizQuestion).filter(
            QuizQuestion.category != "Cricket"
        ).count()
        assert non_cricket == 0

    def test_requires_auth(self, client):
        res = client.get("/api/quiz/questions")
        assert res.status_code == 401
