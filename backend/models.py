from sqlalchemy import Column, Integer, String, Numeric, DateTime
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    username = Column(String(100), unique=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False)
    name = Column(String(150), nullable=False)

    class_name = Column(String(50))
    section = Column(String(20))

    total_students = Column(Integer, default=0)
    veg_students = Column(Integer, default=0)
    nonveg_students = Column(Integer, default=0)

    created_at = Column(DateTime, server_default=func.now())


class FoodItem(Base):
    __tablename__ = "food_items"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    category = Column(String(20), nullable=False)
    rate = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Numeric(10, 2), default=1)
    unit = Column(String(30), default="piece")
    created_at = Column(DateTime, server_default=func.now())
