import random
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from database import get_db
from models.quiz import QuizQuestion

router = APIRouter(prefix="/api", tags=["quiz"])

_SEED_QUESTIONS = [
    # ── General cricket questions ─────────────────────────────────────────────
    {
        "question": "How many players are in a cricket team?",
        "options": ["9", "10", "11", "12"],
        "correct": "11",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "How many balls are in a standard over?",
        "options": ["4", "5", "6", "8"],
        "correct": "6",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What does LBW stand for?",
        "options": ["Leg Before Wicket", "Left Bat Win", "Leg Behind Wicket", "Late Ball Wide"],
        "correct": "Leg Before Wicket",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "How many wickets fall before a team is all out?",
        "options": ["8", "9", "10", "11"],
        "correct": "10",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "How many overs per side in a T20 match?",
        "options": ["15", "20", "25", "30"],
        "correct": "20",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "Which country is widely credited with inventing cricket?",
        "options": ["Australia", "India", "England", "South Africa"],
        "correct": "England",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What is a 'duck' in cricket?",
        "options": ["Scoring 0 runs before getting out", "A type of delivery", "A fielding position", "Hitting 4 boundaries"],
        "correct": "Scoring 0 runs before getting out",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What is the distance between the two sets of stumps on a cricket pitch?",
        "options": ["18 yards", "20 yards", "22 yards", "24 yards"],
        "correct": "22 yards",
        "difficulty": "medium",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What is it called when a bowler takes three wickets on three consecutive deliveries?",
        "options": ["Double wicket", "Hat-trick", "Triple play", "Three-peat"],
        "correct": "Hat-trick",
        "difficulty": "medium",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What is a 'maiden over'?",
        "options": ["An over with no runs scored off the bat", "An over with a wicket", "An over with a no-ball", "The first over of the match"],
        "correct": "An over with no runs scored off the bat",
        "difficulty": "medium",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "What does DRS stand for in cricket?",
        "options": ["Decision Review System", "Dismissal Replay Service", "Digital Review Standard", "Direct Review System"],
        "correct": "Decision Review System",
        "difficulty": "medium",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    {
        "question": "How many runs does a batsman score for hitting the ball over the boundary without it bouncing?",
        "options": ["4", "6", "5", "3"],
        "correct": "6",
        "difficulty": "easy",
        "question_type": "general",
        "category": "Cricket",
        "field_position": None,
    },
    # ── Field position questions ──────────────────────────────────────────────
    {
        "question": "Where does the wicket keeper position themselves relative to the batsman?",
        "options": ["In front of the batsman", "Beside the batsman on the leg side", "Directly behind the stumps", "At mid-wicket"],
        "correct": "Directly behind the stumps",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "wicket keeper",
    },
    {
        "question": "Where does a slip fielder typically stand?",
        "options": ["Behind and to the off-side of the wicket keeper", "Beside the keeper on the leg side", "Straight behind the bowler", "On the off-side boundary"],
        "correct": "Behind and to the off-side of the wicket keeper",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "slip",
    },
    {
        "question": "Which fielding position is wider than slip and squarer on the off side?",
        "options": ["Point", "Gully", "Cover", "Third man"],
        "correct": "Gully",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "gully",
    },
    {
        "question": "Which fielding position is square of the wicket on the off side?",
        "options": ["Gully", "Cover", "Point", "Mid-off"],
        "correct": "Point",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "point",
    },
    {
        "question": "Which fielding position is in front of the wicket on the off side, between point and mid-off?",
        "options": ["Gully", "Cover", "Slip", "Third man"],
        "correct": "Cover",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "cover",
    },
    {
        "question": "Which fielding position sits on the off side close to the bowler, near the non-striker's end?",
        "options": ["Mid-on", "Mid-off", "Extra cover", "Cover"],
        "correct": "Mid-off",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "mid-off",
    },
    {
        "question": "Which fielding position sits on the leg side close to the bowler, near the non-striker's end?",
        "options": ["Mid-off", "Mid-on", "Mid-wicket", "Square leg"],
        "correct": "Mid-on",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "mid-on",
    },
    {
        "question": "Which fielding position is on the leg side, roughly square with the batsman on the wicket line?",
        "options": ["Mid-on", "Square leg", "Mid-wicket", "Fine leg"],
        "correct": "Mid-wicket",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "mid-wicket",
    },
    {
        "question": "Which fielding position stands square on the leg side, level with the batsman?",
        "options": ["Mid-wicket", "Square leg", "Fine leg", "Leg slip"],
        "correct": "Square leg",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "square leg",
    },
    {
        "question": "Which fielding position is on the leg side behind square, near the boundary?",
        "options": ["Square leg", "Mid-wicket", "Fine leg", "Leg slip"],
        "correct": "Fine leg",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "fine leg",
    },
    {
        "question": "Which fielding position is on the off side behind square, near the boundary?",
        "options": ["Gully", "Point", "Third man", "Slip"],
        "correct": "Third man",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "third man",
    },
    {
        "question": "Which fielding position is on the off-side boundary behind mid-off?",
        "options": ["Long on", "Long off", "Deep cover", "Deep mid-wicket"],
        "correct": "Long off",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "long off",
    },
    {
        "question": "Which fielding position is on the leg-side boundary behind mid-on?",
        "options": ["Long off", "Long on", "Deep square leg", "Deep mid-wicket"],
        "correct": "Long on",
        "difficulty": "easy",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "long on",
    },
    {
        "question": "Which fielding position is on the leg-side boundary, square with the wicket?",
        "options": ["Fine leg", "Deep square leg", "Mid-wicket", "Long on"],
        "correct": "Deep square leg",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "deep square leg",
    },
    {
        "question": "Which fielding position is between cover and mid-off, slightly deeper than cover?",
        "options": ["Point", "Cover", "Extra cover", "Mid-off"],
        "correct": "Extra cover",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "extra cover",
    },
    {
        "question": "Which fielding position is on the off-side boundary roughly in line with cover?",
        "options": ["Extra cover", "Deep cover", "Third man", "Long off"],
        "correct": "Deep cover",
        "difficulty": "medium",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "deep cover",
    },
    {
        "question": "Which fielding position on the leg side mirrors gully on the off side, behind square?",
        "options": ["Leg slip", "Square leg", "Leg gully", "Fine leg"],
        "correct": "Leg gully",
        "difficulty": "hard",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "leg gully",
    },
    {
        "question": "Which fielding position stands directly behind the wicket keeper on the leg side?",
        "options": ["Fine leg", "Leg gully", "Square leg", "Leg slip"],
        "correct": "Leg slip",
        "difficulty": "hard",
        "question_type": "field",
        "category": "Cricket",
        "field_position": "leg slip",
    },
]


def _seed(db: Session) -> None:
    """Idempotent seed, invoked from vercel_build.py at deploy time — never per
    request: two concurrent cold starts both seeing count==0 would double-seed."""
    if db.query(QuizQuestion).count() > 0:
        return
    for q in _SEED_QUESTIONS:
        db.add(QuizQuestion(**q))
    db.commit()


@router.get("/quiz/questions")
def get_questions(db: Session = Depends(get_db)):
    questions = (
        db.query(QuizQuestion)
        .order_by(func.random())
        .limit(10)
        .all()
    )

    result = []
    for q in questions:
        opts = list(q.options)
        random.shuffle(opts)
        result.append({
            "question": q.question,
            "options": opts,
            "correct": q.correct,
            "difficulty": q.difficulty,
            "type": q.question_type,
            "category": q.category,
        })
    return result
