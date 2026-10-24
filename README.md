# SSFMS — Smart School Food Management System

Tracks daily attendance, food consumption, and expenditure for a school meal
programme, produces printable reports, and forecasts future food spend with a
Random Forest model.

- **Frontend:** React 19 + Vite, Recharts, jsPDF
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL
- **ML:** scikit-learn RandomForest (monthly expenditure forecast)
- **Hosting:** AWS — CloudFront + S3 + one EC2 instance running Docker Compose

> **Model warning:** the shipped model is trained on **synthetic demo data**
> (50 students, 20 veg at ₹24 / 30 non-veg at ₹19). Forecasts are illustrative
> and must not be used for real budgeting until retrained on school records.

---

## Local development

### 1. Database

PostgreSQL 16 must be running with a database named `ssfms`.

### 2. Backend

```powershell
cd backend
Copy-Item .env.example .env    # then edit DATABASE_URL / JWT_SECRET
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

API docs: <http://127.0.0.1:8001/docs>

On first start an admin account is created from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` in `backend/.env` (only when no admin exists yet).

### 3. Frontend

```powershell
npm install
npm run dev
```

Set `VITE_API_BASE_URL` in the root `.env` (defaults to `http://127.0.0.1:8001`).

---

## Authentication

`POST /login` returns a signed JWT plus the user profile. Every other endpoint
requires `Authorization: Bearer <token>`.

| Role | Can do |
|---|---|
| `admin` | Everything: food items, teachers, reports, predictions |
| `teacher` | Read food data, record attendance, view reports |

Passwords are bcrypt-hashed. Rows created by the old prototype still store
plaintext; they are compared once and re-hashed automatically on next login.

There is **no** client-side admin bypass any more — the old hardcoded
`admin` / `admin123` shortcut has been removed.

---

## API surface

| Method | Path | Auth |
|---|---|---|
| `GET` | `/` | none |
| `GET` | `/health` | none |
| `GET` | `/status` | none |
| `POST` | `/login` | none |
| `GET` | `/food` | any user |
| `POST` `PUT` `DELETE` | `/food`, `/food/{id}` | admin |
| `GET` `POST` `PUT` `DELETE` | `/teachers`, `/teachers/{id}` | admin |
| `POST` | `/predict/next-month` | any user |
| `POST` | `/predict/next-12-months` | any user |
| `GET` | `/predict/health` | none |

---

## Deploying to AWS

See **[`deploy/README.md`](deploy/README.md)** for the full runbook.

Short version:

```powershell
aws configure sso                 # or aws configure
.\deploy\deploy.ps1               # creates VPC, EC2, S3, CloudFront, secrets
```

Outputs give you the site URL, API URL, and instance id. The admin password is
in Secrets Manager (`ssfms/prod/admin`).

---

## Known gaps

- Attendance, expenditure totals, and school settings are still stored in
  browser `localStorage` rather than PostgreSQL, so data does not sync across
  devices and is lost when the browser cache is cleared.
- `users` list in the admin UI is read from `localStorage`; only newly created
  teachers are written back to Postgres.
- No schema migrations yet — tables are created with
  `Base.metadata.create_all()`; add Alembic before the first production change.
