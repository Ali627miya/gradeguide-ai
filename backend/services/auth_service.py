"""Very small demo authentication: HMAC-signed bearer tokens + role-based access control.

Prototype only - there are no passwords. Do not deploy publicly without real authentication (e.g. university SSO).
"""
import base64
import hashlib
import hmac
import time

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from config import settings
from database.db import get_db
from models.models import User

TOKEN_TTL = 60 * 60 * 12


def make_token(user: User) -> str:
    payload = f"{user.id}:{user.role}:{int(time.time()) + TOKEN_TTL}"
    sig = hmac.new(settings.SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()[:32]
    return base64.urlsafe_b64encode(f"{payload}:{sig}".encode()).decode()


def _parse(token: str) -> tuple[int, str]:
    try:
        raw = base64.urlsafe_b64decode(token.encode()).decode()
        uid, role, exp, sig = raw.split(":")
    except Exception as exc:
        raise HTTPException(401, "Invalid session. Please log in again.") from exc
    expected = hmac.new(settings.SECRET_KEY.encode(), f"{uid}:{role}:{exp}".encode(), hashlib.sha256).hexdigest()[:32]
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(401, "Invalid session. Please log in again.")
    if int(exp) < time.time():
        raise HTTPException(401, "Your session has expired. Please log in again.")
    return int(uid), role


def current_user(authorization: str = Header(default=""), db: Session = Depends(get_db)) -> User:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Please log in first.")
    uid, role = _parse(authorization.split(" ", 1)[1].strip())
    user = db.get(User, uid)
    if not user or user.role != role:
        raise HTTPException(401, "Your account no longer exists (the demo may have been reset). Please log in again.")
    return user


def require_student(user: User = Depends(current_user)) -> User:
    if user.role != "student":
        raise HTTPException(403, "This area is for students only.")
    return user


def require_professor(user: User = Depends(current_user)) -> User:
    if user.role != "professor":
        raise HTTPException(403, "This area is for lecturers only.")
    return user
