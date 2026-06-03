from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from database import get_db
from models.auth import User
from services.auth_service import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    user_id = int(payload["sub"])
    user = db.query(User).filter(User.id == user_id, User.is_active == True).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in ("admin", "root"):
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def require_root(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "root":
        raise HTTPException(status_code=403, detail="Root access required")
    return current_user
