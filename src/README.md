# SSFMS Frontend

React single-page application for SSFMS. It renders one of two role-specific
shells after login — an **admin panel** and a **teacher panel** — and talks to the
FastAPI backend through a small shared API client.

- **React 19** with function components and hooks
- **Vite 8** for dev server and production builds
- **Recharts 3** for forecast charts
- **jsPDF 4** for printable food-expenditure invoices
- Plain CSS (no framework, no CSS-in-JS)

---

## Layout

| Path | Responsibility |
|---|---|
| `main.jsx` | Mounts `<App />` into `#root` under `StrictMode`; imports global CSS |
| `App.jsx` | Session bootstrap, storage helpers, API wiring, both app shells, every admin and teacher page |
| `pages/Login.jsx` | Login form; delegates to `authService.loginUser` |
| `services/api.js` | API base URL, token storage, `apiFetch` wrapper, 401 handling |
| `services/authService.js` | Login call, logout, legacy local user list helpers |
| `services/pdfService.js` | A4 invoice generation, download, and preview |
| `App.css` | App layout, sidebar, cards, forms, tables, responsive rules |
| `index.css` | Design tokens, base styles, login page, print styles |
| `../public/favicon.svg` | App icon |

`index.html` at the repository root is the Vite entry document.

---

## Runtime flow

```
main.jsx
  └── <App />
        ├── no user        ──> <Login />
        ├── role=admin     ──> <AdminApp />   (8 pages)
        └── role=teacher   ──> <TeacherApp /> (4 pages)
```

`App` restores the session from `localStorage` on mount. If a token is present
but the API later returns `401`, `apiFetch` clears the session and dispatches
`ssfms:unauthorized`; `App` listens for it and returns to the login screen.

On a successful login, `loginUser` stores the JWT and returns the user object;
`App` stores that object as `ssfms_current_user` and renders the matching shell.

---

## Admin pages

Navigation lives in `AdminApp.menuItems`; `renderPage()` switches on `activePage`.

| Page ID | Component | Summary |
|---|---|---|
| `dashboard` | `AdminDashboard` | Student/food/teacher stat cards, today's attendance snapshot, quick actions |
| `school` | `SchoolSettings` | Edit the school name persisted in `localStorage` |
| `food` | `FoodManagement` | CRUD table for food items; create/edit form; delete confirmation; loading and error states |
| `teachers` | `TeacherManagement` | CRUD for teacher accounts, class/section assignment, veg/non-veg counts |
| `attendance` | `AttendanceOverview` | All submitted records grouped by date and class |
| `expenditure` | `ExpenditurePage` | Spend per food item and per record, using present counts × rate |
| `reports` | `ReportsPage` | Daily/weekly/monthly/yearly filters, totals, PDF preview and download |
| `predictions` | `PredictionsPage` | Inputs for the two prior months; calls `/predict/next-12-months`; charts the result |

## Teacher pages

| Page ID | Component | Summary |
|---|---|---|
| `dashboard` | `TeacherDashboard` | Class assignment, student split, shortcuts |
| `attendance` | `TeacherAttendance` | Today's veg/non-veg present counts; weekends disabled; replaces an existing record for the same teacher/date |
| `food` | `TeacherFood` | Read-only menu with category, rate, quantity, and unit |
| `reports` | `TeacherReports` | Class expenditure summary and PDF invoice |

## Shared components

| Component | Purpose |
|---|---|
| `Sidebar` | Brand, navigation buttons, logout |
| `Topbar` | School name and signed-in user badge |
| `PageTitle` | Consistent page heading and subtitle |
| `StatCard` | Dashboard metric tile |
| `QuickCard` | Dashboard shortcut tile |
| `EmptyState` | Placeholder for empty tables/lists |

---

## State and persistence

All state is held in `App` and passed down as props; there is no Redux, Zustand,
or Context provider.

| Key | Owner | Contents |
|---|---|---|
| `ssfms_token` | `services/api.js` | JWT access token |
| `ssfms_current_user` | `App.jsx` | Serialized signed-in user |
| `ssfms_users` | `services/authService.js` | Local cache of user/teacher records |
| `ssfms_school` | `App.jsx` | School name |
| `ssfms_attendance` | `App.jsx` | Array of daily attendance records |

`foodItems` are loaded from PostgreSQL through the API, and teacher
creates/updates/deletes are sent to the API. The teacher **list** rendered by the
admin UI is still read from `ssfms_users` in `localStorage`, so it can drift from
the database. `attendance`, `schoolName`, and that user cache are local-only —
see [Known gaps](#known-gaps).

### Attendance record shape

```js
{
  teacherId: 3,
  teacherName: "Anita Rao",
  className: "5",
  section: "A",
  date: "2026-10-24",
  totalStudents: 40,
  vegStudents: 25,
  nonVegStudents: 15,
  vegPresent: 23,
  nonVegPresent: 14
}
```

Re-submitting the same teacher and date replaces the earlier record.

---

## API client

`services/api.js` resolves the backend base URL once at module load:

```js
const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();
export const API_BASE_URL = rawBase.replace(/\/+$/, "");
```

Use `apiFetch(path, options)` for every authenticated call:

```js
import { apiFetch } from "./services/api";

const response = await apiFetch("/food", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
```

It adds `Authorization: Bearer <token>` when a token exists and handles `401`
centrally. Relative paths work in both modes:

| Mode | `VITE_API_BASE_URL` | Resulting URL |
|---|---|---|
| Local | `http://127.0.0.1:8001` | `http://127.0.0.1:8001/food` |
| AWS | `/api` | `/api/food` (CloudFront → FastAPI) |

---

## Authentication service

| Function | Behaviour |
|---|---|
| `loginUser(username, password)` | `POST /login`; stores token; returns the user object; maps 401/422/429 and network errors to readable messages |
| `logoutUser()` | Clears the token and current user |
| `getAllUsers()` / `saveUsers()` | Legacy `localStorage` helpers retained for the existing admin UI |

`Login.jsx` disables the submit button while the request is in flight and shows
inline errors. There is no client-side role bypass.

---

## PDF reports

`services/pdfService.js` builds an A4 portrait invoice with jsPDF:

- `generateFoodExpenditureInvoice({...})` returns `{ doc, fileName }`.
- `downloadFoodExpenditureInvoice(options)` triggers a browser download.
- `previewFoodExpenditureInvoice(options)` opens a blob URL in a new tab and
  revokes it after 10 minutes; if the popup is blocked it throws a readable
  error.

The invoice contains the school header, invoice number/date, class and section,
a food summary, a calculated total, and signature lines. Amounts use Indian
number formatting and the `Rs.` prefix. Expenditure per record is
`present headcount × item rate` for the matching category.

Reports support four periods:

- **Daily** — a single selected date
- **Weekly** — Monday–Sunday containing the selected date
- **Monthly** — the selected month
- **Yearly** — the selected year

---

## Styling

- `index.css` defines CSS custom properties, typography, buttons, forms, login,
  responsive rules, and `@media print`.
- `App.css` defines the shell (sidebar, topbar, page content), cards, grids,
  tables, badges, and page-specific layout.
- Breakpoints: `1024px` (sidebar/nav), `900px` and `700px` (content stacking).
- Print styles hide navigation so reports print cleanly.

There is no CSS module or utility framework; class names are global.

---

## Scripts

Run from the repository root:

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server at <http://localhost:5173> |
| `npm run build` | Production bundle in `dist/` |
| `npm run preview` | Serve the built bundle locally |
| `npm run lint` | oxlint over the project |

Node 22.12+ (Vite 8 also supports Node 20.19+).

---

## Environment

| Variable | Local | AWS |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8001` | `/api` |

Vite inlines `VITE_*` variables at build time, so changing `.env` requires a
restart of `npm run dev` or a rebuild for production.

---

## Building for deployment

```powershell
$env:VITE_API_BASE_URL = "/api"
npm run build
aws s3 sync dist/ s3://<FrontendBucketName> --delete
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*"
```

CloudFront serves `index.html` for unknown paths, so client-side navigation does
not need a router. The site and API share one origin, which removes CORS and
mixed-content concerns. Full steps are in [`deploy/README.md`](../deploy/README.md).

---

## Adding a page

1. Add a component in `App.jsx` (or a new file under `pages/` / `components/`).
2. Add an entry to the relevant `menuItems` array in `AdminApp` or `TeacherApp`.
3. Add a `case` to `renderPage()`.
4. Pass only the props the page needs; keep shared state in `App`.
5. Update the navigation table in this README.

If the page needs server data, add the endpoint to the backend and call it with
`apiFetch`; do not add new `localStorage` keys unless the data is genuinely
device-local.

---

## Known gaps

- `App.jsx` is a large single file (~4,000 lines). Splitting pages and shared
  components into modules would make it easier to test and review.
- Attendance, school settings, and the legacy user cache live in
  `localStorage`, so they do not sync across devices and vanish when browser
  storage is cleared.
- The admin teacher list is rendered from the `ssfms_users` cache; the app never
  calls `GET /teachers`. Teachers created on one device will not show up on
  another until that cache is refreshed, even though the POST/PUT/DELETE calls
  reach PostgreSQL.
- No router: navigation is state-based, so URLs are not shareable and the back
  button does not move between pages.
- No automated tests or component documentation beyond this file.
- No offline support or request caching.

---

## Conventions

- Function components, hooks, and named exports only where a module needs them.
- Keep network calls in `services/`; pages should use `apiFetch`.
- Keep currency formatting through the existing `formatCurrency` helper.
- Match the existing global CSS classes rather than adding inline styles.
- Run `npm run lint` and `npm run build` before opening a pull request.
