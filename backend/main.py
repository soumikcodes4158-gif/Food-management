from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text
from sqlalchemy.orm import Session

from pydantic import BaseModel

from database import engine, Base, get_db
from models import User, FoodItem
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
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# CREATE DATABASE TABLES
# ============================================================

Base.metadata.create_all(bind=engine)


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
# TEST DATABASE
# ============================================================

@app.get("/test-db")
def test_database():

    try:
        with engine.connect() as connection:

            result = connection.execute(
                text("SELECT 1")
            )

            value = result.scalar()

        return {
            "status": "success",
            "database": "PostgreSQL",
            "database_name": "ssfms",
            "connection": value == 1
        }

    except Exception as error:

        return {
            "status": "error",
            "message": str(error)
        }


# ============================================================
# CHECK TABLES
# ============================================================

@app.get("/tables")
def check_tables():

    try:

        with engine.connect() as connection:

            result = connection.execute(
                text("""
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = 'public'
                    ORDER BY table_name
                """)
            )

            tables = [row[0] for row in result]

        return {
            "status": "success",
            "tables": tables
        }

    except Exception as error:

        return {
            "status": "error",
            "message": str(error)
        }


# ============================================================
# API STATUS
# ============================================================

@app.get("/api/status")
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
    db: Session = Depends(get_db)
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
def get_teachers(db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
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
        password=data.password,
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
    db: Session = Depends(get_db)
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
    teacher.password = data.password
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
    db: Session = Depends(get_db)
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
# TEACHER LOGIN API
# ============================================================

@app.post("/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    # Find the teacher by username (case-insensitive).
    teacher = db.query(User).filter(
        User.username.ilike(data.username.strip()),
        User.role == "teacher"
    ).first()

    # Temporary comparison for the current local prototype.
    # Use secure password hashing before deploying publicly.
    if not teacher or teacher.password != data.password:
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    # Never return the password to the frontend.
    return {
        "id": teacher.id,
        "username": teacher.username,
        "role": teacher.role,
        "name": teacher.name,
        "class_name": teacher.class_name,
        "section": teacher.section,
        "total_students": teacher.total_students,
        "veg_students": teacher.veg_students,
        "nonveg_students": teacher.nonveg_students
    }
