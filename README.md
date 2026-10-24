# SSFMS — Smart School Food Management System

A full-stack web app for managing a school's daily food operations: food item rates,
teacher/class records, attendance-driven meal counts, expenditure reports, PDF exports,
and an experimental ML forecast of future food expenditure.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Recharts, jsPDF |
| Backend | FastAPI, SQLAlchemy |
| Database | PostgreSQL |
| ML | scikit-learn (Random Forest), pandas, joblib |

## Project Structure

```
School Management/
├── src/                      # React frontend
│   ├── App.jsx               # Main application UI and pages
│   ├── pages/Login.jsx       # Login screen
│   └── services/             # API auth + PDF helpers
├── public/                   # Static assets
├── backend/                  # FastAPI backend
│   ├── main.py               # API routes (food, teachers, login)
│   ├── models.py             # SQLAlchemy models (User, FoodItem)
│   ├── database.py           # DB engine / session
│   ├── ml_prediction.py      # Expenditure forecast endpoints
│   └── venv/                 # Local Python environment (not tracked)
├── ML/                       # Offline training pipeline
│   ├── ssfms_training_data.csv             # Daily training data
│   ├── prepare_monthly_data.py             # Daily -> monthly aggregation
│   ├── ssfms_monthly_training_data.csv     # Monthly dataset
│   ├── train_monthly_model.py              # Trains the model
│   └── ssfms_monthly_model.pkl             # Saved model used by the backend
├── .env.example              # Example frontend environment variables
└── package.json
```

## Prerequisites

- Node.js 18+
- Python 3.12
- PostgreSQL 14+ with a database named `ssfms`

## Setup

### 1. Frontend

```bash
npm install
cp .env.example .env     # Windows: copy .env.example .env
npm run dev
```

The app runs at http://localhost:5173.

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install fastapi uvicorn sqlalchemy psycopg[binary] pydantic pandas scikit-learn joblib
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

API docs: http://127.0.0.1:8001/docs

> `backend/database.py` currently contains a local PostgreSQL connection string.
> Move those credentials into environment variables before deploying.

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run Oxlint |

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/` | Health check |
| GET | `/test-db` | Test the database connection |
| GET | `/tables` | List database tables |
| GET | `/api/status` | API status summary |
| GET/POST | `/food` | List / create food items |
| PUT/DELETE | `/food/{id}` | Update / delete a food item |
| GET/POST | `/teachers` | List / create teachers |
| PUT/DELETE | `/teachers/{id}` | Update / delete a teacher |
| POST | `/login` | Teacher login |
| GET | `/predict/health` | ML model availability |
| POST | `/predict/next-month` | Forecast one month |
| POST | `/predict/next-12-months` | Recursive 12-month forecast |

## ML Pipeline

Retrain the forecast model from the daily data:

```bash
cd ML
python prepare_monthly_data.py    # daily CSV -> monthly CSV
python train_monthly_model.py     # monthly CSV -> ssfms_monthly_model.pkl
```

The backend loads `ML/ssfms_monthly_model.pkl` at request time.

## Limitations

- Forecasts are trained on **synthetic demo data** and are not reliable for real-world
  budgeting. The 12-month endpoint feeds predictions back in as inputs, so errors compound.
- Passwords are stored and compared in plain text; this is a local prototype only.
  Hash passwords and use token-based auth before any public deployment.
- Database credentials are currently hardcoded in `backend/database.py`.
