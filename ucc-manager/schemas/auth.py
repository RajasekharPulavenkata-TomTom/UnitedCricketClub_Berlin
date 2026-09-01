from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator

VALID_ROLES = ("developer", "manager", "player")

# bcrypt only uses the first 72 bytes of a password; longer inputs are silently
# truncated (or rejected by newer bcrypt releases), so cap what we accept.
PASSWORD_MIN, PASSWORD_MAX = 8, 72


def _validate_password(v: str) -> str:
    if len(v) < PASSWORD_MIN:
        raise ValueError(f"password must be at least {PASSWORD_MIN} characters")
    if len(v.encode()) > PASSWORD_MAX:
        raise ValueError(f"password must be at most {PASSWORD_MAX} bytes")
    return v


def _strip_username(v: str) -> str:
    v = v.strip()
    if not v:
        raise ValueError("username must not be blank")
    return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    user_id: int
    member_id: Optional[int] = None


class UserCreate(BaseModel):
    username: str
    password: str
    role: str
    full_name: Optional[str] = None

    _check_password = field_validator("password")(_validate_password)
    _strip_username = field_validator("username")(_strip_username)

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        if v not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return v


class UserUpdate(BaseModel):
    username: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
    member_id: Optional[int] = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_ROLES:
            raise ValueError(f"role must be one of {VALID_ROLES}")
        return v

    @field_validator("username")
    @classmethod
    def strip_username(cls, v: Optional[str]) -> Optional[str]:
        return _strip_username(v) if v is not None else v


class PasswordReset(BaseModel):
    new_password: str

    _check_password = field_validator("new_password")(_validate_password)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str

    _check_password = field_validator("new_password")(_validate_password)


class ForgotPasswordRequest(BaseModel):
    username: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    _check_password = field_validator("new_password")(_validate_password)


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: Optional[str] = None

    _check_password = field_validator("password")(_validate_password)
    _strip_username = field_validator("username")(_strip_username)


class UserOut(BaseModel):
    id: int
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    status: str
    member_id: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}
