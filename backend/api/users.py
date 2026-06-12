from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field, field_validator
from typing import Optional

from database import get_db, User, UserRole
from auth import admin_required, get_password_hash

router = APIRouter()

ROLE_VALUES = {role.value for role in UserRole}


class UserCreate(BaseModel):
    username: str = Field(..., min_length=2, max_length=64)
    password: str = Field(..., min_length=6, max_length=128)
    role: str = "viewer"

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: str) -> str:
        if v not in ROLE_VALUES:
            raise ValueError("role must be one of: admin, analyst, monitor, technical, viewer")
        return v


class UserUpdate(BaseModel):
    role: Optional[str] = None
    password: Optional[str] = Field(None, min_length=6, max_length=128)

    @field_validator("role")
    @classmethod
    def valid_role(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in ROLE_VALUES:
            raise ValueError("role must be one of: admin, analyst, monitor, technical, viewer")
        return v


@router.get("")
@router.get("/")
async def get_users(
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    users = db.query(User).all()
    return [{"id": user.id, "username": user.username, "role": user.role.value} for user in users]


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    db.add(
        User(
            username=body.username,
            hashed_password=get_password_hash(body.password),
            role=UserRole(body.role),
        )
    )
    db.commit()
    u = db.query(User).filter(User.username == body.username).first()
    return {"id": u.id, "username": u.username, "role": u.role.value}


@router.patch("/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user=Depends(admin_required),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if body.password:
        user.hashed_password = get_password_hash(body.password)

    if body.role is not None:
        new_role = UserRole(body.role)
        if user.role == UserRole.ADMIN and new_role != UserRole.ADMIN:
            other_admins = (
                db.query(User)
                .filter(User.role == UserRole.ADMIN, User.id != user_id)
                .count()
            )
            if other_admins == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot demote the last admin account",
                )
        user.role = new_role

    if body.password is None and body.role is None:
        raise HTTPException(status_code=400, detail="No updates provided")

    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "role": user.role.value}


@router.post("/retrain")
async def retrain_model(
    current_user = Depends(admin_required),
    db: Session = Depends(get_db)
):
    from ..ids.anomaly_model import AnomalyModel
    model = AnomalyModel()
    success = model.retrain("ml/dataset.csv")
    
    if success:
        return {"message": "Model retraining complete"}
    else:
        raise HTTPException(status_code=500, detail="Retraining failed")
