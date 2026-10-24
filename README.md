# SSFMS — Smart School Food Management System

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.142-009688?logo=fastapi&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)

SSFMS is a full-stack web application for running a school meal programme. Teachers
record daily attendance (vegetarian and non-vegetarian headcounts), the office
maintains a priced food catalogue, and the system turns both into expenditure
totals, printable PDF invoices, and a machine-learning forecast of next year's
food spend.

It ships with two role-specific interfaces — an **admin panel** for office staff
and a **teacher panel** for classrooms — behind JWT authentication.

> **Model warning:** the shipped forecast model is trained on **synthetic demo
> data** (50 students: 20 veg at ₹24 and 30 non-veg at ₹19). Predictions are
> illustrative and must not be used for real budgeting until retrained on school
> records. See [`ML/README.md`](ML/README.md).

---

## Table of contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Roles and authentication](#roles-and-authentication)
- [API overview](#api-overview)
- [Machine learning](#machine-learning)
- [Quality checks](#quality-checks)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Contributing](#contributing)
- [Documentation index](#documentation-index)

---

## Features

### Admin panel

| Page | What it does |
|---|---|
| **Dashboard** | Totals for students, teachers, food items, and today's meals, plus quick links |
| **School Settings** | Set the school name shown across the app and on reports |
| **Food Management** | Create, edit, and delete food items with category (`Veg` / `Non-Veg`), rate, quantity, and unit |
| **Teacher Management** | Create, edit, and delete teacher accounts; assign class, section, and veg/non-veg student counts |
| **Attendance** | Review attendance submitted by every class, by date |
| **Expenditure** | Per-record spend calculated from present headcounts × food rates |
| **Reports** | Daily, weekly, monthly, or yearly summaries with PDF preview and download |
| **Predictions** | 12-month food-expenditure forecast from the Random Forest model |

### Teacher panel

| Page | What it does |
|---|---|
| **Dashboard** | Class assignment, today's status, and shortcuts |
| **Attendance** | Submit or update today's veg/non-veg present counts (weekends are blocked) |
| **Today's Food** | Read-only view of the menu, rates, and units |
| **My Reports** | Class-level expenditure summary and PDF invoice |

### Cross-cutting

- JWT login for both roles; the UI renders the correct panel from the token's role.
- Same API used locally and in production (no separate build modes).
- Responsive layout, print styles, and an SPA-friendly CloudFront setup.
- One-command AWS deployment with CloudFormation (see [`deploy/README.md`](deploy/README.md)).

---

## Architecture

**Local development**

```
                        ┌────────────────────────────────┐
                        │         React 19 SPA           │
                        │   App.jsx · Vite · Recharts    │
                        └───────────────┬────────────────┘
                                        │ JSON over HTTP
                                        │ Authorization: Bearer <JWT>
                                        ▼
                        ┌────────────────────────────────┐
                        │        FastAPI + Uvicorn       │
                        │ auth · food · teachers · ML    │
                        └────────┬──────────────┬────────┘
                                 │              │
                    SQLAlchemy   │              │ joblib
                                 ▼              ▼
                      ┌──────────────────┐  ┌──────────────────────┐
                      │  PostgreSQL 16   │  │ RandomForest (.pkl)  │
                      │ users, food_items│  │ monthly expenditure  │
                      └──────────────────┘  └──────────────────────┘
```

**AWS production (Track 1)**

```
Browser
   │ HTTPS
   ▼
CloudFront (single domain)
   ├── /*      ──> S3 bucket (private, Origin Access Control)
   └── /api/*  ──> EC2 t4g.small:8000
                       └── Docker Compose
                             ├── api  (FastAPI container)
                             └── db   (PostgreSQL 16 container)
```

Serving the site and the API from one CloudFront domain means the browser talks
to `/api/...` on its own origin: no CORS configuration to get wrong, no
mixed-content warnings, and HTTPS without owning a custom domain.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Recharts 3, jsPDF 4, plain CSS |
| Backend | FastAPI 0.142, Uvicorn, Pydantic 2, SQLAlchemy 2.1, psycopg 3 |
| Auth | PyJWT (HS256 access tokens), bcrypt password hashing |
| Database | PostgreSQL 16 |
| ML | scikit-learn 1.9 Random Forest, pandas, joblib |
| Tooling | oxlint, Docker, Docker Compose |
| Hosting | CloudFront, S3 (OAC), EC2 t4g.small, Secrets Manager, CloudWatch, SNS, AWS Budgets |

---

## Repository layout

```
.
├── backend/                  FastAPI service
│   ├── main.py               auth, food, and teacher routes
│   ├── ml_prediction.py      prediction router
│   ├── models.py             SQLAlchemy models (users, food_items)
│   ├── security.py           JWT + bcrypt helpers
│   ├── config.py             environment-driven settings
│   ├── database.py           engine and session factory
│   ├── Dockerfile            production image (Python 3.12-slim)
│   ├── requirements.txt
│   └── README.md
├── src/                      React single-page app
│   ├── App.jsx               app shell, admin pages, teacher pages
│   ├── main.jsx              React entry point
│   ├── pages/Login.jsx       login screen
│   ├── services/             api client, auth, PDF generation
│   ├── App.css, index.css    layout, components, print styles
│   └── README.md
├── ML/                       training pipeline and model artefact
│   ├── ssfms_training_data.csv
│   ├── ssfms_monthly_training_data.csv
│   ├── prepare_monthly_data.py
│   ├── train_monthly_model.py
│   ├── ssfms_monthly_model.pkl
│   └── README.md
├── deploy/                   AWS runbook and helper scripts
│   ├── deploy.ps1
│   ├── bootstrap-instance.sh
│   ├── backup.sh
│   └── README.md
├── public/                   static assets (favicon)
├── docker-compose.yml        api + db for production
├── package.json              frontend scripts and dependencies
└── README.md                 you are here
```

> The CloudFormation templates (`deploy/*.yaml`) and `.github/workflows/` are
> intentionally git-ignored; see [`deploy/README.md`](deploy/README.md).

---

## Quick start

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 22.12+ (or 20.19+) | Vite 8 engine requirement |
| Python | 3.12 | matches the production image |
| PostgreSQL | 16 | local server or Docker |
| Git | any recent | |

### 1. Clone the repository

```powershell
git clone https://github.com/soumikcodes4158-gif/Food-management.git
cd Food-management
```

### 2. Create the database

```powershell
createdb -U postgres ssfms
```

If `createdb` is not on your `PATH`, use psql instead:

```powershell
psql -U postgres -c "CREATE DATABASE ssfms;"
```

### 3. Run the backend

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `backend/.env` and set at least:

```dotenv
ENVIRONMENT=development
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/ssfms
JWT_SECRET=<paste a generated secret>
ADMIN_PASSWORD=<choose a password>
```

Generate a signing key:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Start the API:

```powershell
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

- API: <http://127.0.0.1:8001>
- Interactive docs: <http://127.0.0.1:8001/docs>
- Health check: <http://127.0.0.1:8001/health>

On first start the app creates its tables and, if no admin exists yet, a
bootstrap admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

### 4. Run the frontend

In a second terminal, from the repository root:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Open <http://localhost:5173> and sign in with the bootstrap admin credentials.
Create teacher accounts from **Teacher Management**; teachers then sign in to
the teacher panel.

> The default `.env` uses `VITE_API_BASE_URL=http://127.0.0.1:8001`. For AWS the
> build uses `/api` so CloudFront can proxy requests on the same origin.

---

## Configuration

### Frontend (`/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8001` | Base URL for every API call. Set to `/api` for CloudFront. |

`VITE_*` values are baked in at build time; rebuild after changing them.

### Backend (`/backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enables production guards |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@localhost:5432/ssfms` | SQLAlchemy connection string |
| `JWT_SECRET` | insecure dev value | HS256 signing key; **required** in production |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Access-token lifetime (8 hours) |
| `ALLOWED_ORIGINS` | localhost:5173–5175 | Comma-separated CORS origins; empty is correct behind CloudFront |
| `API_PREFIX` | `/api` | Prefix stripped by middleware (used for CloudFront routing) |
| `ADMIN_USERNAME` | `admin` | Bootstrap admin username |
| `ADMIN_PASSWORD` | _unset_ | Bootstrap admin password; no admin is created when empty |
| `ADMIN_NAME` | `Administrator` | Display name for the bootstrap admin |
| `ML_DIR` | `../ML` | Directory containing the model and training data |

`config.py` refuses to start with `ENVIRONMENT=production` and the default
`JWT_SECRET`. Secrets are never committed — `.env` files are git-ignored.

---

## Roles and authentication

`POST /login` verifies the password, returns a signed JWT, and the frontend
stores it in `localStorage`. Every protected request carries
`Authorization: Bearer <token>`. A `401` clears the local session and returns the
user to the login screen.

| Capability | `admin` | `teacher` |
|---|:---:|:---:|
| Sign in | ✅ | ✅ |
| View food catalogue | ✅ | ✅ |
| Create / edit / delete food items | ✅ | — |
| Create / edit / delete teachers | ✅ | — |
| Submit / update class attendance | — | ✅ |
| View all classes' attendance | ✅ | — |
| View own class attendance | — | ✅ |
| Expenditure and reports | ✅ | ✅ (own class) |
| 12-month forecast | ✅ | — |

Passwords are bcrypt-hashed. Rows left over from the old prototype may still
hold plaintext passwords; those are compared once and re-hashed automatically
on the next successful login. The old hardcoded `admin` / `admin123` bypass has
been removed.

---

## API overview

All routes are JSON. The interactive schema lives at `/docs` (or `/api/docs`
behind CloudFront).

| Method | Path | Access | Purpose |
|---|---|---|---|
| `GET` | `/` | public | Service greeting |
| `GET` | `/health` | public | Liveness + database check |
| `GET` | `/status` | public | Stack summary |
| `POST` | `/login` | public | Exchange credentials for a JWT |
| `GET` | `/food` | any user | List food items |
| `POST` | `/food` | admin | Create a food item |
| `PUT` | `/food/{id}` | admin | Update a food item |
| `DELETE` | `/food/{id}` | admin | Delete a food item |
| `GET` | `/teachers` | admin | List teacher accounts |
| `POST` | `/teachers` | admin | Create a teacher account |
| `PUT` | `/teachers/{id}` | admin | Update a teacher account |
| `DELETE` | `/teachers/{id}` | admin | Delete a teacher account |
| `POST` | `/predict/next-month` | any user | One-month expenditure forecast |
| `POST` | `/predict/next-12-months` | any user | Recursive 12-month forecast |
| `GET` | `/predict/health` | public | Model and dataset availability |

Request/response examples for each endpoint are in
[`backend/README.md`](backend/README.md).

---

## Machine learning

The API loads `ML/ssfms_monthly_model.pkl`, a `RandomForestRegressor` trained on
monthly aggregates of daily meal records. Features are the target month, target
year, previous-month expenditure, and two-months-ago expenditure. The 12-month
endpoint feeds each prediction back in as the next month's input, so errors can
compound.

```powershell
cd ML
python train_monthly_model.py    # monthly CSV -> .pkl + holdout MAE
```

The shipped monthly dataset (`ssfms_monthly_training_data.csv`, 2023–2025) is the
one the current model uses. `prepare_monthly_data.py` converts a *daily* export
into that schema, but the bundled daily CSV covers a different period (2018–2019)
and is too short to train on — see the data caveat in
[`ML/README.md`](ML/README.md#data-caveat).

The model is loaded per request, so retraining does not require an API restart.
Full details, dataset schemas, and evaluation notes are in
[`ML/README.md`](ML/README.md).

---

## Quality checks

```powershell
# Frontend
npm run lint      # oxlint
npm run build     # production bundle in dist/

# Backend
cd backend
python -m compileall .        # syntax check
python -m uvicorn main:app    # smoke test /docs
```

There is currently **no automated test suite** for either layer. Treat lint,
build, and the manual smoke test as the baseline gate before merging.

---

## Deployment

The production runbook is [`deploy/README.md`](deploy/README.md). Live site:
<https://d31vvvoobwe8vk.cloudfront.net> (environment details are in the
deployment README).

Short version:

```powershell
aws configure sso                 # or aws configure
.\deploy\deploy.ps1               # VPC, EC2, S3, CloudFront, secrets, alarms
```

The stack creates a single ARM EC2 instance running Docker Compose, a private S3
bucket for the React build, and one CloudFront distribution that serves the site
and proxies `/api/*`. The admin password is stored in Secrets Manager at
`ssfms/prod/admin`; the site URL and API URL are stack outputs.

Default region: `ap-southeast-2` (Sydney). Estimated on-demand cost: **~$18/month**
(see the deployment README for the breakdown).

> The deployment templates are git-ignored and kept locally. A fresh clone will
> not contain `deploy/stack.yaml`, so run the deployment from a machine that has
> the templates.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login fails with "Cannot connect" | API not running or wrong `VITE_API_BASE_URL` | Start Uvicorn on port 8001; rebuild the frontend after changing `.env` |
| `401 Authentication required` on every call | Missing/expired token | Sign in again; check `ACCESS_TOKEN_EXPIRE_MINUTES` |
| `503 Database unavailable` from `/health` | PostgreSQL down or bad `DATABASE_URL` | Start Postgres, verify the database `ssfms` exists |
| `RuntimeError: JWT_SECRET must be set…` | `ENVIRONMENT=production` with the default key | Set a strong `JWT_SECRET` |
| Browser CORS error | Frontend origin not allowed | Add it to `ALLOWED_ORIGINS`, or serve through CloudFront at `/api` |
| Prediction returns `503 Model not found` | `ssfms_monthly_model.pkl` missing | Run the training script in `ML/` |
| Admin sees no teachers | Only bootstrapped users exist | Create teachers in **Teacher Management** |
| Blank page after deploy | Stale S3 objects or missing invalidation | Re-sync `dist/` and invalidate `/*` |
| `502` from CloudFront `/api/*` | API container unhealthy or port closed | Check `docker compose logs api`; confirm `/health` on the instance |

More deployment-specific failures are covered in
[`deploy/README.md`](deploy/README.md#troubleshooting).

---

## Known limitations

- **Attendance, expenditure totals, and school settings live in browser
  `localStorage`.** They do not sync across devices and disappear when the
  browser cache is cleared. Moving them to PostgreSQL is the highest-priority
  fix.
- **The admin teacher list is local.** Teacher creates, updates, and deletes go
  to PostgreSQL, but the admin UI renders the list from `ssfms_users` in
  `localStorage` instead of calling `GET /teachers`. Accounts created on another
  device will not appear until that cache is refreshed.
- **No schema migrations.** Tables are created with
  `Base.metadata.create_all()`; add Alembic before the first production schema
  change.
- **The ML model is trained on synthetic data**, so forecasts are not
  financially meaningful yet.
- **No automated tests** and no CI pipeline (workflows are intentionally not
  tracked).
- **Single API worker.** Fine for one school; revisit for multi-tenant use.

---

## Contributing

1. Create a feature branch from the working branch (`soumik`).
2. Keep changes focused and match the existing code style.
3. Run `npm run lint` and `npm run build` before committing.
4. Describe the change and any data-model impact in the commit message.
5. Never commit `.env` files, secrets, or the git-ignored deployment templates.

---

## Documentation index

| Document | Contents |
|---|---|
| [`backend/README.md`](backend/README.md) | API reference, schema, auth internals, environment and Docker notes |
| [`src/README.md`](src/README.md) | Frontend structure, component map, state, API client, PDF reports |
| [`ML/README.md`](ML/README.md) | Dataset schemas, training pipeline, evaluation, retraining |
| [`deploy/README.md`](deploy/README.md) | AWS architecture, prerequisites, deploy/operate/restore/teardown |
| [`AWS-LINKS.md`](AWS-LINKS.md) | Console deep links and CLI equivalents for the live environment |
| [`AGENTS.md`](AGENTS.md) | Instructions for AI coding agents working in this repository |
