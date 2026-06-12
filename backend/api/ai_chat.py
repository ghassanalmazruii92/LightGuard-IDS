"""
LightGuard AI Chat – Gemini Backend
-------------------------------------
POST /api/ai/chat
  Body: { "message": str, "context": { "device_ip"?, "vuln_script"?, "attack_type"? } }

Uses Google Gemini (google-genai SDK) with a system prompt tailored
for a cybersecurity expert assistant for Tadhamon Smart City.
"""

import os
import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from google import genai
from google.genai import types

from backend.database import get_db, Device, Alert
from sqlalchemy.orm import Session

router = APIRouter(prefix="/ai", tags=["AI Chat"])

# ── System prompt ────────────────────────────────────────────────────────
SYSTEM_PROMPT = """You are "LightGuard AI", a cybersecurity assistant embedded in the LightGuard IDS for Tadhamon Smart City, Oman.

Your role:
- Analyze security issues on smart-city assets (cameras, IoT sensors, Fog Nodes, smart meters, network gear)
- Explain attacks clearly for security operators
- Give practical remediation aligned with best practices
- **Reply only in English**, matching a professional security operations tone
- When CVEs appear, explain real impact, exploitation, and fix
- Relate issues to the Tadhamon environment: IoT, SCADA, surveillance, and operational networks

Rules:
- Be precise and actionable, not vague
- Include CVE IDs when known
- Give numbered remediation steps (1, 2, 3...)
- Use markdown (headers, bullets, code blocks)
- Keep answers under ~500 words unless the user asks for more
- If the question is off-topic, politely redirect toward cybersecurity"""


# ── Request/Response models ───────────────────────────────────────────────
class ChatContext(BaseModel):
    device_ip:   Optional[str] = None
    vuln_script: Optional[str] = None
    attack_type: Optional[str] = None


class ChatRequest(BaseModel):
    message: str
    context: Optional[ChatContext] = None
    history: Optional[list] = []


class ChatResponse(BaseModel):
    reply: str
    model: str


# ── Gemini client ─────────────────────────────────────────────────────────
def _get_client():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail="GEMINI_API_KEY is not set in the environment or config."
        )
    return genai.Client(api_key=api_key)


def _build_context_block(context: Optional[ChatContext], db: Session) -> str:
    """Build a context string from device/vuln info to prepend to the message."""
    if not context:
        return ""

    parts = []

    if context.device_ip:
        device = db.query(Device).filter(Device.ip == context.device_ip).first()
        if device:
            vulns = []
            try:
                vulns = json.loads(device.vulnerabilities or "[]")
            except Exception:
                pass
            services = []
            try:
                services = json.loads(device.services or "[]")
            except Exception:
                pass

            parts.append(
                f"[Device context]\n"
                f"- Name: {device.label} ({device.hostname})\n"
                f"- IP: {device.ip} | OS: {device.os or 'Unknown'}\n"
                f"- Zone: {device.zone} | Role: {device.role}\n"
                f"- Risk Score: {device.risk_score}%\n"
                f"- Open ports: {device.open_ports}\n"
                f"- Services: {[s.get('name','') for s in services]}\n"
                f"- Vulnerability count: {len(vulns)}"
            )

            if context.vuln_script:
                vuln = next((v for v in vulns if v.get("script") == context.vuln_script), None)
                if vuln:
                    parts.append(
                        f"\n[Selected vulnerability]\n"
                        f"- Check: {vuln.get('script')}\n"
                        f"- CVE: {vuln.get('cve', 'None')}\n"
                        f"- Severity: {vuln.get('severity')}\n"
                        f"- Summary: {vuln.get('summary')}\n"
                        f"- Recommendation: {vuln.get('recommendation', '')}"
                    )

    if context.attack_type:
        parts.append(f"\n[Related attack type]: {context.attack_type}")

    return "\n".join(parts)


# ── Endpoint ──────────────────────────────────────────────────────────────
@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, db: Session = Depends(get_db)):
    """
    Send a message to the Gemini AI assistant.
    Optionally attach device/vulnerability context for precise answers.
    """
    client = _get_client()
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash-lite")

    # Build context block
    ctx_block = _build_context_block(req.context, db)
    full_message = f"{ctx_block}\n\n{req.message}".strip() if ctx_block else req.message

    # Build conversation history
    history = []
    for turn in (req.history or []):
        role = turn.get("role", "user")
        text = turn.get("text", "")
        if role in ("user", "model") and text:
            history.append(
                types.Content(role=role, parts=[types.Part(text=text)])
            )

    try:
        chat_session = client.chats.create(
            model=model_name,
            config=types.GenerateContentConfig(
                system_instruction=SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=1024,
            ),
            history=history,
        )
        response = chat_session.send_message(full_message)
        reply = response.text
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API error: {str(e)}"
        )

    return ChatResponse(reply=reply, model=model_name)
