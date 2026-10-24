from pathlib import Path
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error
from sklearn.dummy import DummyRegressor

ML_DIR = Path(__file__).resolve().parent
DATA_PATH = ML_DIR / "ssfms_monthly_training_data.csv"
MODEL_PATH = ML_DIR / "ssfms_monthly_model.pkl"

if not DATA_PATH.is_file():
    raise SystemExit(f"Dataset not found: {DATA_PATH}")

df = pd.read_csv(DATA_PATH, parse_dates=["Date"]).sort_values("Date")
required = ["Date", "Total_Food_Expenditure", "Days_Recorded", "Avg_Present", "Total_Veg_Present", "Total_NonVeg_Present"]
missing = [c for c in required if c not in df.columns]
if missing:
    raise SystemExit(f"Missing columns in dataset: {missing}")

df["Month_Number"] = df["Date"].dt.month
df["Year"] = df["Date"].dt.year
df["Previous_Month_Expenditure"] = df["Total_Food_Expenditure"].shift(1)
df["Two_Months_Ago_Expenditure"] = df["Total_Food_Expenditure"].shift(2)
model_data = df.dropna().copy()
features = ["Month_Number", "Year", "Previous_Month_Expenditure", "Two_Months_Ago_Expenditure"]
target = "Total_Food_Expenditure"
if len(model_data) < 12:
    raise SystemExit("At least 14 monthly rows are recommended for training and testing.")

split = len(model_data) - 6
train, test = model_data.iloc[:split], model_data.iloc[split:]
model = RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=42)
model.fit(train[features], train[target])
preds = model.predict(test[features])
baseline = DummyRegressor(strategy="mean")
baseline.fit(train[features], train[target])
baseline_preds = baseline.predict(test[features])
mae = mean_absolute_error(test[target], preds)
baseline_mae = mean_absolute_error(test[target], baseline_preds)
model.fit(model_data[features], model_data[target])
joblib.dump({"model": model, "features": features,
             "training_data_note": "Synthetic demo data for 50 students: 20 veg at INR 24 and 30 non-veg at INR 19. Not real school records.",
             "target_min": float(df[target].min()), "target_max": float(df[target].max())}, MODEL_PATH)
print("=== SSFMS MONTHLY MODEL TRAINING COMPLETE ===")
print(f"Dataset: {DATA_PATH}")
print(f"Monthly records: {len(df)}")
print(f"Training examples after lag features: {len(model_data)}")
print(f"Monthly expenditure range: INR {df[target].min():,.0f} - INR {df[target].max():,.0f}")
print(f"Chronological holdout MAE (Random Forest): INR {mae:,.2f}")
print(f"Chronological holdout MAE (mean baseline): INR {baseline_mae:,.2f}")
print(f"Saved model: {MODEL_PATH}")
print("NOTE: Synthetic demo data only; not actual historical school data.")
