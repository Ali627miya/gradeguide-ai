"""Thin wrapper around the OpenAI API that always returns validated JSON."""
import json
import logging
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from config import settings

log = logging.getLogger("gradeguide.llm")
T = TypeVar("T", bound=BaseModel)


class AIUnavailableError(RuntimeError):
    """Raised when live AI cannot produce a valid response. Never silently replaced with fake output."""


_client = None


def get_client():
    global _client
    if _client is None:
        from openai import OpenAI

        kwargs = {"api_key": settings.OPENAI_API_KEY, "timeout": 90.0, "max_retries": 2}
        if settings.OPENAI_BASE_URL:
            kwargs["base_url"] = settings.OPENAI_BASE_URL
        _client = OpenAI(**kwargs)
    return _client


def call_json(system: str, user: str, schema: type[T], temperature: float = 0.2, attempts: int = 2) -> T:
    """Call the chat model in JSON mode and validate the result with Pydantic (one repair retry)."""
    if not settings.live_ai_available:
        raise AIUnavailableError("No OpenAI API key configured (or AI_MODE=offline).")
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    last_error = ""
    for attempt in range(attempts):
        content = ""
        try:
            extra = {"temperature": temperature} if temperature is not None else {}
            resp = get_client().chat.completions.create(
                model=settings.OPENAI_MODEL,
                messages=messages,
                response_format={"type": "json_object"},
                **extra,
            )
            content = resp.choices[0].message.content or "{}"
            return schema.model_validate(json.loads(content))
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = f"Invalid JSON from model: {exc}"
            log.warning("Attempt %s: %s", attempt + 1, last_error)
            messages = messages + [
                {"role": "assistant", "content": content},
                {"role": "user", "content": f"Your JSON did not match the required schema: {str(exc)[:800]}. "
                                            "Return ONLY corrected JSON."},
            ]
        except Exception as exc:  # network, auth, quota, model name...
            msg = str(exc)
            if "temperature" in msg.lower() and temperature is not None:
                temperature = None  # some models only allow the default temperature
                try:
                    resp = get_client().chat.completions.create(
                        model=settings.OPENAI_MODEL, messages=messages, response_format={"type": "json_object"}
                    )
                    return schema.model_validate(json.loads(resp.choices[0].message.content or "{}"))
                except Exception as exc2:  # noqa: BLE001
                    msg = str(exc2)
            log.error("OpenAI call failed: %s", msg)
            raise AIUnavailableError(_friendly(msg)) from exc
    raise AIUnavailableError(last_error or "The AI returned an invalid response.")


def _friendly(msg: str) -> str:
    m = msg.lower()
    if "401" in m or "invalid api key" in m or "incorrect api key" in m:
        return "The OpenAI API key was rejected. Check OPENAI_API_KEY in backend/.env."
    if "429" in m or "quota" in m or "rate limit" in m:
        return "OpenAI rate limit or quota reached. Wait a minute, or switch to the offline simulator."
    if "model" in m and ("not found" in m or "does not exist" in m):
        return f"The model '{settings.OPENAI_MODEL}' is not available to this key. Change OPENAI_MODEL in backend/.env."
    if "connect" in m or "timeout" in m:
        return "Could not reach OpenAI (network problem). Check your internet connection or use the offline simulator."
    return f"The AI service returned an error: {msg[:200]}"
