# SSFMS Backend

FastAPI service that powers authentication, the food catalogue, teacher
management, and the expenditure forecast for SSFMS. It owns the only server-side
data in the system — PostgreSQL tables for users and food items — and serves the
trained scikit-learn model from `../ML`.

- **Framework:** FastAPI 0.142 + Uvicorn
- **Database:** PostgreSQL 16 via SQLAlchemy 2.1 and psycopg 3
- **Auth:** JWT access tokens (HS256) + bcrypt password hashes
- **ML:** joblib-loaded Random Forest regressor

---

## Layout

| File | Responsibility |
|---|---|
| `main.py` | App factory, CORS, `/api` prefix middleware, table creation, bootstrap admin, login, food and teacher routes |
| `ml_prediction.py` | `/predict/*` router and model loading |
| `models.py` | SQLAlchemy models: `User`, `FoodItem` |
| `security.py` | Password hashing/verification, JWT creation/decoding, role dependency |
| `config.py` | Environment loading and production guards |
| `database.py` | Engine, session factory, `get_db` dependency |
| `Dockerfile` | Python 3.12-slim production image |
| `requirements.txt` | Pinned runtime dependencies |

---

## Running locally

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
# edit .env (see the table below)
python -m uvicorn main:app --reload --host 127.0.0.1 --port 8001
```

| URL | Purpose |
|---|---|
| <http://127.0.0.1:8001> | Service greeting |
| <http://127.0.0.1:8001/health> | Liveness + `SELECT 1` database probe |
| <http://127.0.0.1:8001/docs> | Swagger UI |
| <http://127.0.0.1:8001/openapi.json> | OpenAPI schema |

### Database

PostgreSQL 16 must be reachable and the database (default `ssfms`) must exist:

```powershell
createdb -U postgres ssfms
```

Tables are created on startup by `Base.metadata.create_all()`. There are no
migrations yet — see [Schema changes](#schema-changes).

### Docker

`backend/Dockerfile` is built from the repository root because it copies both
`backend/` and `ML/`:

```powershell
docker build -f backend/Dockerfile -t ssfms-api .
docker run --rm -p 8000:8000 --env-file backend/.env ssfms-api
```

In production it runs through the root [`docker-compose.yml`](../docker-compose.yml),
which also starts PostgreSQL and wires `DATABASE_URL` to the `db` service.

---

## Configuration

`config.py` loads `backend/.env` with `python-dotenv`, then falls back to process
environment variables. Empty strings are treated as unset.

| Variable | Default | Notes |
|---|---|---|
| `ENVIRONMENT` | `development` | `production`/`prod` enables production checks |
| `DATABASE_URL` | `postgresql+psycopg://postgres:postgres@localhost:5432/ssfms` | SQLAlchemy URL |
| `JWT_SECRET` | insecure dev placeholder | Required in production; generate with `secrets.token_urlsafe(48)` |
| `JWT_ALGORITHM` | `HS256` (fixed) | Not configurable |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `480` | Token lifetime |
| `ALLOWED_ORIGINS` | `localhost:5173`–`5175` | Comma-separated; set empty behind CloudFront |
| `API_PREFIX` | `/api` | Stripped by middleware before routing |
| `ADMIN_USERNAME` | `admin` | Bootstrap admin |
| `ADMIN_PASSWORD` | _none_ | When empty, no bootstrap admin is created |
| `ADMIN_NAME` | `Administrator` | Bootstrap display name |
| `ML_DIR` | `../ML` | Directory holding the `.pkl` and training CSV |

Production guard:

```python
if IS_PRODUCTION and JWT_SECRET == "dev-only-insecure-secret-change-me":
    raise RuntimeError(...)
```

So a production container fails fast rather than signing tokens with a public
default.

---

## Database schema

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `username` | varchar(100) | unique, not null; login is case-insensitive |
| `password` | varchar(255) | bcrypt hash (legacy plaintext upgraded at login) |
| `role` | varchar(20) | `admin` or `teacher` |
| `name` | varchar(150) | display name |
| `class_name` | varchar(50) | teacher only |
| `section` | varchar(20) | teacher only |
| `total_students` | integer | default `0` |
| `veg_students` | integer | default `0` |
| `nonveg_students` | integer | default `0` |
| `created_at` | timestamp | server default `now()` |

### `food_items`

| Column | Type | Notes |
|---|---|---|
| `id` | integer PK | |
| `name` | varchar(150) | not null |
| `category` | varchar(20) | `Veg` or `Non-Veg` |
| `rate` | numeric(10,2) | price per unit in INR |
| `quantity` | numeric(10,2) | default `1` |
| `unit` | varchar(30) | default `piece` (API default `pieces`) |
| `created_at` | timestamp | server default `now()` |

Attendance is **not** stored here yet; the frontend keeps it in
`localStorage`. That is the largest known gap in the system.

---

## Authentication

1. `POST /login` looks up the username with `ILIKE` and verifies the password
   with bcrypt.
2. Legacy plaintext rows are accepted once, then re-hashed and saved.
3. A JWT is issued with `sub`, `username`, `role`, `name`, `iat`, and `exp`.
4. Protected routes use `get_current_user` (401 when missing/invalid/expired) or
   `require_role("admin")` (403 when the role does not match).

Clients send:

```http
Authorization: Bearer <access_token>
```

The frontend also clears its stored session and dispatches
`ssfms:unauthorized` whenever it receives a 401.

### Roles

| Role | Permissions |
|---|---|
| `admin` | Full CRUD on food items and teachers; read food; predictions |
| `teacher` | Read food; predictions (endpoint level); all attendance UI is client-side |

---

## Endpoints

Base path is empty locally; behind CloudFront the same routes are reached under
`/api`. Public routes are marked **public**; everything else requires a bearer
token.

| Method | Path | Access |
|---|---|---|
| `GET` | `/` | public |
| `GET` | `/health` | public |
| `GET` | `/status` | public |
| `POST` | `/login` | public |
| `GET` | `/food` | any authenticated user |
| `POST` | `/food` | admin |
| `PUT` | `/food/{food_id}` | admin |
| `DELETE` | `/food/{food_id}` | admin |
| `GET` | `/teachers` | admin |
| `POST` | `/teachers` | admin |
| `PUT` | `/teachers/{teacher_id}` | admin |
| `DELETE` | `/teachers/{teacher_id}` | admin |
| `GET` | `/predict/health` | public |
| `POST` | `/predict/next-month` | any authenticated user |
| `POST` | `/predict/next-12-months` | any authenticated user |

### `POST /login`

```json
{
  "username": "admin",
  "password": "your-password"
}
```

```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in_minutes": 480,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin",
    "name": "Administrator",
    "class_name": null,
    "section": null,
    "total_students": 0,
    "veg_students": 0,
    "nonveg_students": 0
  }
}
```

Invalid credentials return `401 {"detail": "Invalid username or password"}`.

### Food items

`GET /food` returns an array. `POST` and `PUT` accept:

```json
{
  "name": "Rice and dal",
  "category": "Veg",
  "rate": 24,
  "quantity": 1,
  "unit": "plate"
}
```

`POST` returns `200` with the created object under `food`; `PUT` returns the
updated object; `DELETE` returns `{"message": "Food item deleted successfully"}`.

### Teachers

`GET /teachers` returns teachers without passwords. `POST` / `PUT` accept:

```json
{
  "username": "teacher5a",
  "password": "change-me",
  "name": "Anita Rao",
  "class_name": "5",
  "section": "A",
  "total_students": 40,
  "veg_students": 25,
  "nonveg_students": 15
}
```

Validation:

- `400` if the username is already taken.
- `400` if `veg_students + nonveg_students > total_students` (the frontend
  requires them to be equal, the API permits fewer unassigned students).
- `404` when updating/deleting a missing teacher.
- Updating a teacher replaces the password, so always send one.

### Predictions

`POST /predict/next-month`:

```json
{
  "previous_month_expenditure": 22000,
  "two_months_ago_expenditure": 21500,
  "target_year": 2026,
  "target_month": 11
}
```

`POST /predict/next-12-months`:

```json
{
  "previous_month_expenditure": 22000,
  "two_months_ago_expenditure": 21500,
  "start_year": 2026,
  "start_month": 11
}
```

Response (trimmed):

```json
{
  "success": true,
  "forecast_period": {"start_month": "2026-11", "end_month": "2027-10", "months": 12},
  "predicted_annual_expenditure": 274000.5,
  "currency": "INR",
  "model": "Random Forest Regression",
  "data_quality": "synthetic_demo_data",
  "forecasts": [
    {"month": "2026-11", "month_name": "November 2026", "predicted_expenditure": 22110.4, "currency": "INR"}
  ],
  "warning": "This is a recursive 12-month demonstration forecast trained on synthetic data..."
}
```

`GET /predict/health` reports whether the model and training data exist and
returns their resolved paths. A missing model produces `503` on prediction
routes.

All monetary values are INR.

### PowerShell examples

```powershell
$base = "http://127.0.0.1:8001"

# Login and keep the token
$login = Invoke-RestMethod -Method Post -Uri "$base/login" `
  -ContentType "application/json" `
  -Body (@{ username = "admin"; password = $env:SSFMS_ADMIN_PASSWORD } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.access_token)" }

# List food
Invoke-RestMethod -Uri "$base/food" -Headers $headers | Format-Table

# Create a food item
Invoke-RestMethod -Method Post -Uri "$base/food" -Headers $headers `
  -ContentType "application/json" `
  -Body (@{ name = "Rice"; category = "Veg"; rate = 24; quantity = 1; unit = "plate" } | ConvertTo-Json)
```

---

## Middleware and CloudFront

`strip_api_prefix` removes `API_PREFIX` from the request path before routing:

```
/api/food  ->  /food
/api/docs  ->  /docs
```

This keeps route definitions clean while CloudFront forwards `/api/*` to the
instance. Locally you can call either `/food` or `/api/food`.

CORS is controlled by `ALLOWED_ORIGINS`. Behind CloudFront the browser is
same-origin, so the list can stay empty.

---

## Production behaviour

- Starts one Uvicorn worker (`--workers 1`) with proxy headers enabled.
- Container runs as UID `10001`, not root.
- Health check hits `/health` every 30 s; a failed database probe returns `503`.
- On first boot CloudFormation waits for `/health` to return 200 before signalling
  success, so a broken deploy rolls back.
- The bootstrap admin is created only when the `users` table has no admin and
  the username is free.

---

## Schema changes

There is no Alembic setup yet. For any schema change:

1. Add Alembic (`pip install alembic`, `alembic init migrations`).
2. Point it at `database.Base.metadata`.
3. Replace `create_all()` with `alembic upgrade head` in the container entry
   point.
4. Check in the migration and test both a fresh database and an existing one.

Until then, changing a model requires a manual `ALTER TABLE` on deployed
databases.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ModuleNotFoundError: config` | Started from the wrong directory | Run Uvicorn from `backend/` |
| `503 Database unavailable` | Postgres down, wrong URL, or missing database | Start Postgres; test `psql -U postgres -d ssfms` |
| `RuntimeError` on startup in production | Default `JWT_SECRET` | Set a strong secret |
| All requests `401` | Expired token or changed secret | Log in again |
| `403` on admin routes | Token belongs to a teacher | Use an admin account |
| CORS error in the browser | Origin missing from `ALLOWED_ORIGINS` | Add it or use the same-origin `/api` build |
| `503 Monthly ML model not found` | `.pkl` absent | Run `ML/train_monthly_model.py` |
| `400 Username already exists` | Duplicate teacher username | Choose another username |
| Bootstrap admin missing | `ADMIN_PASSWORD` empty or an admin already exists | Set it, or create users through the API |

---

## Adding a new endpoint

1. Add the Pydantic request model near the route (or in a module).
2. Depend on `get_db` for a session and `get_current_user` /
   `require_role("admin")` for access control.
3. Return plain dictionaries or models; raise `HTTPException` with an explicit
   status code for failures.
4. Add the row to [`README.md`](../README.md#api-overview) and document the
   payload here.
5. If it touches the UI, update [`src/README.md`](../src/README.md).
