import pandas as pd
from pathlib import Path

# =====================================================
# 1. File paths
# =====================================================

ML_FOLDER = Path(__file__).resolve().parent

INPUT_FILE = ML_FOLDER / "ssfms_training_data.csv"
OUTPUT_FILE = ML_FOLDER / "ssfms_monthly_training_data.csv"

# =====================================================
# 2. Load daily training data
# =====================================================

if not INPUT_FILE.exists():
    raise FileNotFoundError(
        f"Training data not found: {INPUT_FILE}"
    )

df = pd.read_csv(INPUT_FILE, parse_dates=["Date"])

required_columns = [
    "Date",
    "Enrolled",
    "Present",
    "Absent",
    "Veg_Present",
    "NonVeg_Present",
    "Food_Expenditure",
]

missing = [
    column for column in required_columns
    if column not in df.columns
]

if missing:
    raise ValueError(f"Missing columns: {missing}")

# =====================================================
# 3. Clean and sort the data
# =====================================================

df = df.dropna(subset=["Date"]).copy()

numeric_columns = [
    "Enrolled",
    "Present",
    "Absent",
    "Veg_Present",
    "NonVeg_Present",
    "Food_Expenditure",
]

for column in numeric_columns:
    df[column] = pd.to_numeric(
        df[column], errors="coerce"
    )

df = df.dropna(subset=numeric_columns)
df = df.sort_values("Date")

# Keep dates represented by actual records.
# Do not invent expenditure for missing dates.
df["Month"] = df["Date"].dt.to_period("M")

# =====================================================
# 4. Aggregate daily data into monthly summaries
# =====================================================

monthly = (
    df.groupby("Month")
    .agg(
        Days_Recorded=("Date", "nunique"),
        Avg_Enrolled=("Enrolled", "mean"),
        Avg_Present=("Present", "mean"),
        Avg_Absent=("Absent", "mean"),
        Total_Veg_Present=("Veg_Present", "sum"),
        Total_NonVeg_Present=("NonVeg_Present", "sum"),
        Total_Food_Expenditure=("Food_Expenditure", "sum"),
    )
    .reset_index()
)

monthly["Date"] = monthly["Month"].dt.to_timestamp()

monthly = monthly.drop(columns=["Month"])

# =====================================================
# 5. Save monthly dataset
# =====================================================

monthly = monthly[
    [
        "Date",
        "Days_Recorded",
        "Avg_Enrolled",
        "Avg_Present",
        "Avg_Absent",
        "Total_Veg_Present",
        "Total_NonVeg_Present",
        "Total_Food_Expenditure",
    ]
]

monthly.to_csv(OUTPUT_FILE, index=False)

# =====================================================
# 6. Display results
# =====================================================

print("\n========================================")
print("MONTHLY SSFMS DATA CREATED")
print("========================================")

print("Daily records:", len(df))
print("Months available:", len(monthly))

print("\nMonthly dataset:")
print(monthly.to_string(index=False))

print("\nSaved to:")
print(OUTPUT_FILE)