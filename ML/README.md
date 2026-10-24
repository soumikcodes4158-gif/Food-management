# SSFMS Machine Learning

Monthly food-expenditure forecasting for SSFMS. The FastAPI backend loads the
trained model from this directory and exposes it through `/predict/*`.

> ⚠️ **The shipped model is trained on synthetic demonstration data.** It exists
> to prove the end-to-end pipeline, not to produce real budgets. Replace the
> dataset and retrain before using forecasts for financial decisions.

---

## Files

| File | Purpose |
|---|---|
| `ssfms_monthly_training_data.csv` | Monthly aggregates used by the trainer — **36 rows, Jan 2023 → Dec 2025** |
| `ssfms_training_data.csv` | Legacy daily demo records — 178 rows, Sep 2018 → Jun 2019 |
| `prepare_monthly_data.py` | Aggregates a daily CSV into the monthly schema |
| `train_monthly_model.py` | Trains, evaluates, refits, and saves the model |
| `ssfms_monthly_model.pkl` | Joblib artefact loaded by the API |

---

## Pipeline

```
Daily records (optional)          Monthly records (required)
   ssfms_training_data.csv           ssfms_monthly_training_data.csv
            │                                   │
            │ prepare_monthly_data.py           │
            └──────────────┬────────────────────┘
                           ▼
                 train_monthly_model.py
                 ├── lag features (t-1, t-2)
                 ├── chronological holdout
                 ├── RandomForest vs mean baseline
                 ├── refit on all rows
                 └── joblib.dump(...)
                           ▼
                 ssfms_monthly_model.pkl
                           ▼
              backend/ml_prediction.py (per-request load)
                           ▼
              POST /predict/next-month
              POST /predict/next-12-months
```

### Data caveat

The two CSVs are **not** two representations of the same period:

- The shipped monthly dataset covers **2023–2025** and is what the current model
  was trained on.
- The daily dataset covers **2018–2019** and is legacy demo data. Running
  `prepare_monthly_data.py` against it produces only ~10 monthly rows, which is
  fewer than the trainer requires, and it would overwrite the good monthly CSV.

Run `prepare_monthly_data.py` only when you have a daily export that spans at
least ~14 months and belongs to the same school/period as your target data.
Back up the monthly CSV first.

---

## Dataset schemas

### Daily input (`ssfms_training_data.csv`)

| Column | Type | Meaning |
|---|---|---|
| `Date` | date | Service date |
| `Enrolled` | integer | Students enrolled |
| `Present` | integer | Students present |
| `Absent` | integer | Students absent |
| `Veg_Present` | integer | Vegetarian students present |
| `NonVeg_Present` | integer | Non-vegetarian students present |
| `Food_Expenditure` | number | Total food spend for the day (INR) |

`prepare_monthly_data.py` drops rows with missing/invalid values, groups by
calendar month, and writes:

| Column | Derivation |
|---|---|
| `Date` | First timestamp of the month |
| `Days_Recorded` | Distinct dates in the month |
| `Avg_Enrolled` | Mean `Enrolled` |
| `Avg_Present` | Mean `Present` |
| `Avg_Absent` | Mean `Absent` |
| `Total_Veg_Present` | Sum of `Veg_Present` |
| `Total_NonVeg_Present` | Sum of `NonVeg_Present` |
| `Total_Food_Expenditure` | Sum of `Food_Expenditure` (target) |

### Monthly training data (`ssfms_monthly_training_data.csv`)

| Column | Used by the model? |
|---|---|
| `Date` | Yes — derives `Month_Number` and `Year`, and orders the series |
| `Total_Food_Expenditure` | Yes — target and lag source |
| `Days_Recorded` | No |
| `Avg_Enrolled` | No |
| `Avg_Present` | No |
| `Avg_Absent` | No |
| `Total_Veg_Present` | No |
| `Total_NonVeg_Present` | No |

Only four features are used, so attendance and enrolment currently influence the
forecast only indirectly through historical expenditure.

---

## Training

Pinned by the backend image (`backend/requirements.txt`): pandas 3, scikit-learn
1.9, joblib 1.6, numpy 2.5.

```powershell
cd ML
python -m pip install pandas scikit-learn joblib
python train_monthly_model.py
```

### Feature engineering

For each month after the first two:

| Feature | Definition |
|---|---|
| `Month_Number` | 1–12 |
| `Year` | Calendar year |
| `Previous_Month_Expenditure` | `Total_Food_Expenditure.shift(1)` |
| `Two_Months_Ago_Expenditure` | `Total_Food_Expenditure.shift(2)` |

Rows with missing lags are dropped, so 36 monthly rows yield 34 training
examples.

### Model and evaluation

```python
RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=42)
```

- Split: the **last 6 months** form a chronological holdout; earlier months train.
- Baseline: `DummyRegressor(strategy="mean")` on the same split.
- Metric: mean absolute error (MAE) in INR.
- After reporting both MAEs, the model is **refit on every row** before saving,
  because the deployed model should use the most recent data.
- The script requires at least 12 examples after lag creation (roughly 14
  months of history) and aborts otherwise.

The shipped model's holdout MAE is printed when you retrain. Compare it with the
mean baseline — if the forest is not clearly better, the data is too flat or too
short to justify a model.

### Artefact

`ssfms_monthly_model.pkl` is a dictionary:

| Key | Contents |
|---|---|
| `model` | Fitted `RandomForestRegressor` |
| `features` | Ordered feature names expected at prediction time |
| `training_data_note` | Human-readable provenance note (synthetic demo data) |
| `target_min`, `target_max` | Observed expenditure range |

The API reads `model` and `features`; the other keys are for inspection.

---

## Serving contract

`backend/ml_prediction.py` loads the artefact on **every request**, so replacing
the `.pkl` takes effect without restarting the API.

| Endpoint | Input | Output |
|---|---|---|
| `GET /predict/health` | — | Model/dataset paths and existence flags |
| `POST /predict/next-month` | Two prior months, target year/month | One prediction |
| `POST /predict/next-12-months` | Two prior months, start year/month | 12 monthly predictions, annual total |

Prediction behaviour:

- Negative outputs are clamped to `0.0`; values are rounded to 2 decimals.
- The 12-month endpoint is **recursive**: each forecast becomes
  `Previous_Month_Expenditure`, and the prior previous becomes
  `Two_Months_Ago_Expenditure` for the next step.
- All values are INR.
- Responses include `data_quality: "synthetic_demo_data"` and a warning string,
  so clients can surface the limitation.
- A missing model returns `503`; a corrupt model or feature mismatch returns
  `500` / `503` with a diagnostic detail.

---

## Retraining runbook

### Rebuild the shipped model (safe default)

```powershell
cd ML
python train_monthly_model.py
# restart nothing; the API reloads the .pkl per request
```

### Train on real school data

1. Export monthly aggregates with the schema above (at least 14 months; more is
   better). If you only have daily records, shape them like
   `ssfms_training_data.csv` and run `prepare_monthly_data.py`.
2. **Back up** `ssfms_monthly_training_data.csv`.
3. Replace the monthly CSV; keep the exact column names.
4. Run `train_monthly_model.py` and check the holdout MAE against the baseline.
5. Inspect the new `.pkl` timestamp and update the provenance note in the
   training script so it no longer claims synthetic data.
6. Commit the CSV and `.pkl` together, rebuild the API image, and redeploy.
7. Call `/predict/health` and one prediction to confirm the model loads.

### Validating a change

- Keep a chronological split; never shuffle time-series rows.
- Compare against the mean baseline and a naive “same as last month” baseline.
- Check for non-negative predictions and a plausible annual total.
- Watch for leakage: no future values may enter lag features.

---

## Limitations

- **Synthetic data** with a narrow expenditure range (₹21,168–₹22,642 per month)
  and only 36 monthly points.
- **Four features only**; attendance, enrolment, menu prices, and holidays are
  not modelled even though they exist in the monthly CSV.
- **Recursive 12-month forecasts compound errors** and have no confidence
  interval.
- **No seasonality controls** beyond the raw month number (no holiday terms,
  exam months, or academic calendar).
- **No versioning or retraining schedule**; the `.pkl` is committed as a binary.
- **No drift monitoring** between predicted and recorded expenditure.

## Next steps

1. Collect 2–3 years of real monthly records from the school.
2. Add attendance and price features, and compare against linear/ARIMA baselines.
3. Report MAE and MAPE per horizon and expose them in the UI.
4. Version models (`model-vYYYYMM.pkl`) and record the training run.
5. Add a scheduled retrain and a human review step before promoting a model.
6. Replace the binary commit with a build artefact once a model registry exists.
