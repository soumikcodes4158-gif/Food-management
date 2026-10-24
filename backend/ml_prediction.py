from pathlib import Path
from calendar import month_name

import joblib
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import config
from security import get_current_user

router = APIRouter(tags=["ML Expenditure Prediction"])

MODEL_PATH = config.MODEL_PATH
DATA_PATH = config.TRAINING_DATA_PATH


class MonthlyPredictionRequest(BaseModel):
    previous_month_expenditure: float = Field(gt=0)
    two_months_ago_expenditure: float = Field(gt=0)
    target_year: int = Field(ge=2000, le=2100)
    target_month: int = Field(ge=1, le=12)


class TwelveMonthPredictionRequest(BaseModel):
    previous_month_expenditure: float = Field(gt=0)
    two_months_ago_expenditure: float = Field(gt=0)
    start_year: int = Field(ge=2000, le=2100)
    start_month: int = Field(ge=1, le=12)


def load_saved_model():
    if not MODEL_PATH.is_file():
        raise HTTPException(
            status_code=503,
            detail=f"Monthly ML model not found at: {MODEL_PATH}. Train it first."
        )
    try:
        saved = joblib.load(MODEL_PATH)
        return saved, saved["model"], saved["features"]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not load the monthly model: {exc}")


def predict_one(model, features, year, month, previous, two_months_ago):
    input_df = pd.DataFrame([{
        "Month_Number": month,
        "Year": year,
        "Previous_Month_Expenditure": float(previous),
        "Two_Months_Ago_Expenditure": float(two_months_ago),
    }])
    missing = [name for name in features if name not in input_df.columns]
    if missing:
        raise HTTPException(status_code=500, detail={
            "error": "Model feature mismatch",
            "missing_features": missing,
            "available_features": list(input_df.columns),
        })
    value = float(model.predict(input_df[features])[0])
    return round(max(0.0, value), 2)


@router.get("/predict/health")
def prediction_health():
    return {
        "status": "available",
        "model_exists": MODEL_PATH.is_file(),
        "training_data_exists": DATA_PATH.is_file(),
        "model_path": str(MODEL_PATH),
        "training_data_path": str(DATA_PATH),
    }


@router.post("/predict/next-month")
def predict_next_month(
    data: MonthlyPredictionRequest,
    user: dict = Depends(get_current_user),
):
    _, model, features = load_saved_model()
    prediction = predict_one(
        model, features, data.target_year, data.target_month,
        data.previous_month_expenditure, data.two_months_ago_expenditure,
    )
    return {
        "success": True,
        "predicted_month": f"{data.target_year}-{data.target_month:02d}",
        "predicted_expenditure": prediction,
        "currency": "INR",
        "model": "Random Forest Regression",
        "data_quality": "synthetic_demo_data",
        "warning": (
            "Experimental forecast based on synthetic demonstration data. "
            "It is not a reliable real-world financial estimate."
        ),
    }


@router.post("/predict/next-12-months")
def predict_next_twelve_months(
    data: TwelveMonthPredictionRequest,
    user: dict = Depends(get_current_user),
):
    _, model, features = load_saved_model()
    previous = float(data.previous_month_expenditure)
    two_months_ago = float(data.two_months_ago_expenditure)
    year, month = data.start_year, data.start_month
    forecasts = []

    # Recursive forecast: each prediction becomes an input for the next month.
    for _ in range(12):
        prediction = predict_one(model, features, year, month, previous, two_months_ago)
        forecasts.append({
            "month": f"{year}-{month:02d}",
            "month_name": f"{month_name[month]} {year}",
            "predicted_expenditure": prediction,
            "currency": "INR",
        })
        two_months_ago, previous = previous, prediction
        month += 1
        if month == 13:
            month = 1
            year += 1

    return {
        "success": True,
        "forecast_period": {
            "start_month": forecasts[0]["month"],
            "end_month": forecasts[-1]["month"],
            "months": 12,
        },
        "predicted_annual_expenditure": round(sum(x["predicted_expenditure"] for x in forecasts), 2),
        "currency": "INR",
        "model": "Random Forest Regression",
        "data_quality": "synthetic_demo_data",
        "forecasts": forecasts,
        "warning": (
            "This is a recursive 12-month demonstration forecast trained on synthetic data. "
            "Errors can compound month to month. Do not use it for real budgeting until "
            "validated with actual school records."
        ),
    }
