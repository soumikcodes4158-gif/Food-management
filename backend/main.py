from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.orm import Session

from pydantic import BaseModel

import config
from database import engine, Base, get_db
from models import User, FoodItem
from security import (
    create_access_token,
    get_current_user,
    hash_password,
    needs_rehash,
    require_role,
    verify_password,
)
from ml_prediction import router as ml_prediction_router

# ============================================================
# SSFMS APPLICATION
# ============================================================

app = FastAPI(
    title="SSFMS Backend",
    description="Smart School Food Management System API",
    version="1.0.0"
)
app.include_router(ml_prediction_router)

# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# CLOUDFRONT PREFIX
# CloudFront forwards /api/* to this service on one shared domain, which
# keeps the frontend and API same-origin. Strip the prefix before routing.
# ============================================================

@app.middleware("http")
async def strip_api_prefix(request: Request, call_next):
    prefix = config.API_PREFIX

    if prefix and request.scope["path"].startswith(prefix):
        stripped = request.scope["path"][len(prefix):] or "/"
        request.scope["path"] = stripped
        if request.scope.get("raw_path"):
            request.scope["raw_path"] = stripped.encode("utf-8")

    return await call_next(request)


# ============================================================
# CREATE DATABASE TABLES
# ============================================================

Base.metadata.create_all(bind=engine)


# ============================================================
# BOOTSTRAP ADMIN
# Creates the first admin account only when the users table is empty, so a
# fresh deployment is usable without shipping a default password.
# ============================================================

def create_bootstrap_admin():
    if not config.ADMIN_PASSWORD:
        return

    db = next(get_db())
    try:
        # Only seed when there is no admin yet; existing deployments keep
        # whatever accounts the school already created.
        if db.query(User).filter(User.role == "admin").first():
            return

        if db.query(User).filter(User.username == config.ADMIN_USERNAME).first():
            return

        admin = User(
            username=config.ADMIN_USERNAME,
            password=hash_password(config.ADMIN_PASSWORD),
            role="admin",
            name=config.ADMIN_NAME,
            total_students=0,
            veg_students=0,
            nonveg_students=0,
        )
        db.add(admin)
        db.commit()
    finally:
        db.close()


create_bootstrap_admin()


# ============================================================
# FOOD DATA MODEL
# ============================================================

class FoodCreate(BaseModel):
    name: str
    category: str
    rate: float
    quantity: float = 1
    unit: str = "pieces"


# ============================================================
# HOME
# ============================================================

@app.get("/")
def home():
    return {
        "message": "SSFMS Backend is running",
        "status": "online"
    }


# ============================================================
# HEALTH CHECK
# Used by the load balancer / uptime alarm. Deliberately exposes no schema
# details, unlike the old /test-db and /tables debug endpoints.
# ============================================================

@app.get("/health")
def health():
    database_ok = False

    try:
        with engine.connect() as connection:
            database_ok = connection.execute(text("SELECT 1")).scalar() == 1
    except Exception:
        database_ok = False

    if not database_ok:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable",
        )

    return {"status": "healthy", "database": "connected"}


# ============================================================
# API STATUS
# ============================================================

@app.get("/status")
def api_status():

    return {
        "project": "Smart School Food Management System",
        "backend": "FastAPI",
        "database": "PostgreSQL",
        "status": "running"
    }


# ============================================================
# GET ALL FOOD ITEMS
# ============================================================

@app.get("/food")
def get_food_items(
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user)
):

    foods = db.query(FoodItem).all()

    return [
        {
            "id": food.id,
            "name": food.name,
            "category": food.category,
            "rate": float(food.rate),
            "quantity": float(food.quantity),
            "unit": food.unit
        }
        for food in foods
    ]


# ============================================================
# ADD FOOD ITEM
# ============================================================

@app.post("/food")
def add_food(
    food_data: FoodCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):

    new_food = FoodItem(
        name=food_data.name,
        category=food_data.category,
        rate=food_data.rate,
        quantity=food_data.quantity,
        unit=food_data.unit
    )

    db.add(new_food)
    db.commit()
    db.refresh(new_food)

    return {
        "message": "Food item added successfully",
        "food": {
            "id": new_food.id,
            "name": new_food.name,
            "category": new_food.category,
            "rate": float(new_food.rate),
            "quantity": float(new_food.quantity),
            "unit": new_food.unit
        }
    }


# ============================================================
# UPDATE FOOD ITEM
# ============================================================

@app.put("/food/{food_id}")
def update_food(
    food_id: int,
    food_data: FoodCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):

    food = db.query(FoodItem).filter(
        FoodItem.id == food_id
    ).first()

    if not food:
        raise HTTPException(
            status_code=404,
            detail="Food item not found"
        )

    food.name = food_data.name
    food.category = food_data.category
    food.rate = food_data.rate
    food.quantity = food_data.quantity
    food.unit = food_data.unit

    db.commit()
    db.refresh(food)

    return {
        "message": "Food item updated successfully",
        "food": {
            "id": food.id,
            "name": food.name,
            "category": food.category,
            "rate": float(food.rate),
            "quantity": float(food.quantity),
            "unit": food.unit
        }
    }


# ============================================================
# DELETE FOOD ITEM
# ============================================================

@app.delete("/food/{food_id}")
def delete_food(
    food_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):

    food = db.query(FoodItem).filter(
        FoodItem.id == food_id
    ).first()

    if not food:
        raise HTTPException(
            status_code=404,
            detail="Food item not found"
        )

    db.delete(food)
    db.commit()

    return {
        "message": "Food item deleted successfully"
    }

# ============================================================
# TEACHER MANAGEMENT APIs
# ============================================================

class TeacherCreate(BaseModel):
    username: str
    password: str
    name: str
    class_name: str
    section: str
    total_students: int
    veg_students: int
    nonveg_students: int


class LoginRequest(BaseModel):
    username: str
    password: str


@app.get("/teachers")
def get_teachers(
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):
    teachers = db.query(User).filter(
        User.role == "teacher"
    ).all()

    return [
        {
            "id": teacher.id,
            "username": teacher.username,
            "name": teacher.name,
            "class_name": teacher.class_name,
            "section": teacher.section,
            "total_students": teacher.total_students,
            "veg_students": teacher.veg_students,
            "nonveg_students": teacher.nonveg_students
        }
        for teacher in teachers
    ]


@app.post("/teachers")
def add_teacher(
    data: TeacherCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):
    existing = db.query(User).filter(
        User.username == data.username
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    if data.veg_students + data.nonveg_students > data.total_students:
        raise HTTPException(
            status_code=400,
            detail="Veg and non-veg student counts exceed total students"
        )

    teacher = User(
        username=data.username,
        password=hash_password(data.password),
        name=data.name,
        role="teacher",
        class_name=data.class_name,
        section=data.section,
        total_students=data.total_students,
        veg_students=data.veg_students,
        nonveg_students=data.nonveg_students
    )

    db.add(teacher)
    db.commit()
    db.refresh(teacher)

    return {
        "message": "Teacher added successfully",
        "id": teacher.id,
        "username": teacher.username
    }


@app.put("/teachers/{teacher_id}")
def update_teacher(
    teacher_id: int,
    data: TeacherCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):
    teacher = db.query(User).filter(
        User.id == teacher_id,
        User.role == "teacher"
    ).first()

    if not teacher:
        raise HTTPException(
            status_code=404,
            detail="Teacher not found"
        )

    if data.veg_students + data.nonveg_students > data.total_students:
        raise HTTPException(
            status_code=400,
            detail="Veg and non-veg student counts exceed total students"
        )

    existing = db.query(User).filter(
        User.username == data.username,
        User.id != teacher_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Username already exists"
        )

    teacher.username = data.username
    teacher.password = hash_password(data.password)
    teacher.name = data.name
    teacher.class_name = data.class_name
    teacher.section = data.section
    teacher.total_students = data.total_students
    teacher.veg_students = data.veg_students
    teacher.nonveg_students = data.nonveg_students

    db.commit()

    return {"message": "Teacher updated successfully"}


@app.delete("/teachers/{teacher_id}")
def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_role("admin"))
):
    teacher = db.query(User).filter(
        User.id == teacher_id,
        User.role == "teacher"
    ).first()

    if not teacher:
        raise HTTPException(
            status_code=404,
            detail="Teacher not found"
        )

    db.delete(teacher)
    db.commit()

    return {"message": "Teacher deleted successfully"}

# ============================================================
# LOGIN API
# Works for admins and teachers. Returns a signed access token; every
# protected route expects it in an "Authorization: Bearer <token>" header.
# ============================================================

LOGIN_FAILED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid username or password",
)


@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    account = db.query(User).filter(
        User.username.ilike(data.username.strip())
    ).first()

    if not account or not verify_password(data.password, account.password):
        raise LOGIN_FAILED

    # Transparently upgrade rows still stored as plaintext.
    if needs_rehash(account.password):
        account.password = hash_password(data.password)
        db.commit()

    return {
        "access_token": create_access_token(account),
        "token_type": "bearer",
        "expires_in_minutes": config.ACCESS_TOKEN_EXPIRE_MINUTES,
        "user": {
            "id": account.id,
            "username": account.username,
            "role": account.role,
            "name": account.name,
            "class_name": account.class_name,
            "section": account.section,
            "total_students": account.total_students,
            "veg_students": account.veg_students,
            "nonveg_students": account.nonveg_students,
        },
    }
