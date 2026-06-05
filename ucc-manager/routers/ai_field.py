import os
import json
import re
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import google.generativeai as genai

router = APIRouter(prefix="/api/ai", tags=["ai"])

# Named fielding positions → SVG coordinates (600×600, right-handed batter reference)
# Off side = right (x > 300), leg side = left (x < 300)
POSITIONS = {
    "Wicketkeeper":      {"x": 300, "y": 450},
    "1st Slip":          {"x": 342, "y": 425},
    "2nd Slip":          {"x": 372, "y": 412},
    "3rd Slip":          {"x": 400, "y": 400},
    "Gully":             {"x": 430, "y": 368},
    "Point":             {"x": 462, "y": 300},
    "Cover Point":       {"x": 452, "y": 238},
    "Cover":             {"x": 430, "y": 195},
    "Extra Cover":       {"x": 402, "y": 158},
    "Mid-off":           {"x": 362, "y": 192},
    "Long-off":          {"x": 390, "y": 112},
    "Mid-on":            {"x": 238, "y": 192},
    "Long-on":           {"x": 210, "y": 112},
    "Mid-wicket":        {"x": 195, "y": 232},
    "Deep Mid-wicket":   {"x": 148, "y": 210},
    "Square Leg":        {"x": 172, "y": 300},
    "Deep Square Leg":   {"x": 115, "y": 300},
    "Fine Leg":          {"x": 155, "y": 420},
    "Deep Fine Leg":     {"x": 122, "y": 452},
    "Third Man":         {"x": 455, "y": 418},
    "Deep Third Man":    {"x": 488, "y": 450},
    "Deep Cover":        {"x": 478, "y": 175},
    "Deep Point":        {"x": 495, "y": 295},
    "Silly Mid-off":     {"x": 340, "y": 278},
    "Silly Mid-on":      {"x": 260, "y": 278},
    "Short Leg":         {"x": 265, "y": 322},
    "Forward Short Leg": {"x": 258, "y": 280},
}

POSITION_LIST = ", ".join(POSITIONS.keys())


class FieldRequest(BaseModel):
    arm: str           # "right" | "left"
    side: str          # "over" | "around"
    bowling_type: str  # "fast" | "medium-fast" | "medium" | "off-spin" | "leg-spin" | "left-arm-spin"
    length: str        # "yorker" | "full" | "good-length" | "short-of-length" | "bouncer"
    line: str          # "outside-off" | "off-stump" | "middle" | "leg" | "outside-leg"
    movement: str      # "none" | "inswing" | "outswing" | "seam" | "off-turn" | "leg-turn"
    amount: str        # "low" | "medium" | "high"
    batter_hand: str   # "right" | "left"


@router.post("/field-suggestion")
async def suggest_field(req: FieldRequest):
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="AI service not configured — set GEMINI_API_KEY")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-1.5-flash")

    prompt = f"""You are an expert cricket tactics coach. Suggest the best field placement.

Bowling conditions:
- Bowler: {req.arm}-arm, bowling {req.side} the wicket
- Type: {req.bowling_type}
- Length: {req.length}
- Line: {req.line}
- Movement: {req.movement} (intensity: {req.amount})
- Batter: {req.batter_hand}-handed

Choose exactly 11 positions from this list (Wicketkeeper must always be included):
{POSITION_LIST}

Return ONLY valid JSON with no extra text:
{{"positions": ["Wicketkeeper", "...10 more from the list..."], "explanation": "1-2 sentences of tactical reasoning"}}"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if not m:
            raise ValueError("No JSON found in AI response")
        data = json.loads(m.group())

        raw_positions = [p for p in data.get("positions", []) if p in POSITIONS][:11]
        if "Wicketkeeper" not in raw_positions:
            raw_positions = ["Wicketkeeper"] + [p for p in raw_positions if p != "Wicketkeeper"][:10]

        result = []
        for pos in raw_positions:
            coords = POSITIONS[pos].copy()
            # Mirror horizontally for left-handed batter (swap off/leg sides)
            if req.batter_hand == "left":
                coords = {"x": 600 - coords["x"], "y": coords["y"]}
            result.append({"label": pos, "x": coords["x"], "y": coords["y"]})

        return {"positions": result, "explanation": data.get("explanation", "")}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Field suggestion failed: {str(e)}")
