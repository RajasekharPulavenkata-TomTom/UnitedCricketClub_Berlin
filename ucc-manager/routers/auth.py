from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from models.auth import User
from schemas.auth import LoginRequest, TokenOut, UserCreate, UserUpdate, PasswordReset, UserOut, RegisterRequest
from services.auth_service import create_access_token, hash_password, verify_password
from dependencies.auth import get_current_user, require_root

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == data.username, User.is_active == True).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return TokenOut(
        access_token=create_access_token(user),
        role=user.role,
        username=user.username,
        user_id=user.id,
    )


@router.post("/register", status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(
        username=data.username.strip(),
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role="user",
        status="active",
    )
    db.add(user)
    db.commit()
    return {"message": "Account created. You can now log in."}


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


# ── User management (root only) ────────────────────────────────────────────────

@router.get("/users/pending", response_model=List[UserOut])
def pending_registrations(current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    return db.query(User).filter(User.status == "pending").order_by(User.created_at).all()


@router.get("/users", response_model=List[UserOut])
def list_users(current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    return db.query(User).order_by(User.status, User.role, User.username).all()


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(
        username=data.username,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=data.role,
        status="active",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{id}/approve", response_model=UserOut)
def approve_user(id: int, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status != "pending":
        raise HTTPException(status_code=400, detail=f"User is already {user.status}")
    user.status = "active"
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{id}/reject", response_model=UserOut)
def reject_user(id: int, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.status != "pending":
        raise HTTPException(status_code=400, detail=f"User is already {user.status}")
    user.status = "rejected"
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{id}", response_model=UserOut)
def update_user(id: int, data: UserUpdate, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if id == current_user.id and data.role and data.role != "root":
        raise HTTPException(status_code=400, detail="Cannot demote yourself")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{id}/password", status_code=204)
def reset_password(id: int, data: PasswordReset, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.hashed_password = hash_password(data.new_password)
    db.commit()


@router.delete("/users/{id}", status_code=204)
def delete_user(id: int, current_user: User = Depends(require_root), db: Session = Depends(get_db)):
    if id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    db.commit()
