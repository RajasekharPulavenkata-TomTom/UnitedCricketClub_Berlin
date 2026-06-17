import json
import os
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List
import google.generativeai as genai
from models.auth import User
from dependencies.auth import get_current_user

router = APIRouter(prefix="/api", tags=["chatbot"])

SYSTEM_PROMPT = """You are CricBot, a cricket rules and regulations expert assistant for the United Cricket Club. Answer questions accurately based on these authoritative sources:

• MCC Laws of Cricket – 42 Laws governing cricket worldwide
• ICC Playing Conditions – Test, ODI, and T20I specific rules
• ICC Regulations – DRS, equipment, player conduct, anti-corruption
• General cricket knowledge – history, formats, techniques, terminology

Guidelines:
- Cite the relevant Law number when answering rules questions (e.g. "Under Law 36 – LBW…")
- Be concise but thorough; use bullet points for multi-part answers
- Use correct cricket terminology throughout
- If asked about a non-cricket topic, politely say: "I'm here specifically for cricket questions!"
- If uncertain about a specific detail, say so rather than guess

Key Law groups for reference:
- Laws 1–5: Players, Substitutes, Toss, Ball, Bat
- Laws 6–11: Pitch, Crease, Wicket, Innings, Follow-On, Scoring
- Laws 12–17: Overs, Dead Ball, No Ball, Wide, Bye/Leg Bye, Fielding
- Laws 18–21: Runs, Boundaries, Lost Ball, Result
- Laws 22–31: Fielder, Wicket-keeper, Batter, Runner, Dismissals (Bowled, Caught, LBW, Run Out, Stumped, Hit Wicket, Obstructing, Handled Ball, Hit Twice, Timed Out)
- Laws 32–42: Bowler, Umpires, Scorers, Practice, Pitch Covering, Intervals, Fair and Unfair Play"""


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]


@router.post("/chat")
async def chat(req: ChatRequest, current_user: User = Depends(get_current_user)):
    api_key = os.environ.get("GEMINI_API_KEY")

    if not api_key:
        async def _no_key():
            yield "data: " + json.dumps({"text": "⚠️ CricBot is not configured yet. Ask an admin to set the GEMINI_API_KEY secret."}) + "\n\n"
            yield "data: [DONE]\n\n"
        return StreamingResponse(_no_key(), media_type="text/event-stream")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    # Gemini uses "model" instead of "assistant" for the AI role
    contents = [
        {"role": m.role if m.role == "user" else "model", "parts": [m.content]}
        for m in req.messages[-10:]
    ]

    async def generate():
        try:
            response = await model.generate_content_async(
                contents,
                generation_config=genai.GenerationConfig(max_output_tokens=1024),
                stream=True,
            )
            async for chunk in response:
                if chunk.text:
                    yield "data: " + json.dumps({"text": chunk.text}) + "\n\n"
        except Exception as exc:
            yield "data: " + json.dumps({"text": f"\n\n*Sorry, something went wrong: {exc}*"}) + "\n\n"
        finally:
            yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
