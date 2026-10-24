import {
  useEffect,
  useMemo,
  useState,
} from "react";

import Login from "./pages/Login";

import {
  getAllUsers,
  saveUsers,
} from "./services/authService";

import {
  apiFetch,
  clearSession,
} from "./services/api";

import {
  downloadFoodExpenditureInvoice as downloadOfficialSSFMSReport,
  previewFoodExpenditureInvoice as previewOfficialSSFMSReport,
} from "./services/pdfService";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import "./App.css";

/* =========================================================
   STORAGE
========================================================= */

const SCHOOL_KEY =
  "ssfms_school";

const ATTENDANCE_KEY =
  "ssfms_attendance";

/* =========================================================
   BACKEND API
   All requests go through apiFetch() from services/api.js so they carry the
   bearer token and respect VITE_API_BASE_URL.
========================================================= */

/* =========================================================
   STORAGE HELPERS
========================================================= */

function readStorage(
  key,
  fallback
) {
  try {
    const saved =
      localStorage.getItem(
        key
      );

    if (!saved) {
      localStorage.setItem(
        key,
        JSON.stringify(
          fallback
        )
      );

      return fallback;
    }

    return JSON.parse(saved);
  } catch {
    return fallback;
  }
}

function saveStorage(
  key,
  value
) {
  localStorage.setItem(
    key,
    JSON.stringify(value)
  );
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatCurrency(
  value
) {
  return `₹${Number(
    value || 0
  ).toLocaleString(
    "en-IN",
    {
      maximumFractionDigits: 2,
    }
  )}`;
}

function todayString() {
  return new Date()
    .toISOString()
    .split("T")[0];
}

// Normalize teacher fields returned by either the React app or FastAPI.
function normalizeTeacherFields(teacher = {}) {
  return {
    ...teacher,
    className: String(teacher.className ?? teacher.class_name ?? "").trim().toUpperCase(),
    section: String(teacher.section ?? "").trim().toUpperCase(),
    totalStudents: teacher.totalStudents ?? teacher.total_students ?? "",
    vegStudents: teacher.vegStudents ?? teacher.veg_students ?? "",
    nonVegStudents: teacher.nonVegStudents ?? teacher.nonveg_students ?? "",
  };
}

/* =========================================================
   APP
========================================================= */

function App() {
  const [user, setUser] =
    useState(() => {
      try {
        const saved =
          localStorage.getItem(
            "ssfms_current_user"
          );

        if (!saved) return null;
        const savedUser = JSON.parse(saved);
        return savedUser?.role === "teacher"
          ? normalizeTeacherFields(savedUser)
          : savedUser;
      } catch {
        return null;
      }
    });

  const [schoolName, setSchoolName] =
    useState(() =>
      readStorage(
        SCHOOL_KEY,
        "My School"
      )
    );

  const [foodItems, setFoodItems] =
    useState([]);

  const [foodLoading, setFoodLoading] =
    useState(true);

  const [foodError, setFoodError] =
    useState("");

  const [users, setUsers] =
    useState(() =>
      getAllUsers().map((item) =>
        item?.role === "teacher"
          ? normalizeTeacherFields(item)
          : item
      )
    );

  const [attendance, setAttendance] =
    useState(() =>
      readStorage(
        ATTENDANCE_KEY,
        []
      )
    );

  useEffect(() => {
    // The API now requires a token, so wait until someone is signed in.
    if (!user) {
      setFoodLoading(false);
      return undefined;
    }

    let cancelled = false;

    const loadFoodItems = async () => {
      try {
        setFoodLoading(true);
        setFoodError("");

        const response = await apiFetch(
          "/food"
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load food items (${response.status})`
          );
        }

        const data = await response.json();

        if (!cancelled) {
          setFoodItems(
            Array.isArray(data) ? data : []
          );
        }
      } catch (error) {
        console.error(
          "Failed to load food items:",
          error
        );

        if (!cancelled) {
          setFoodError(
            "Unable to load food items from the SSFMS backend."
          );
        }
      } finally {
        if (!cancelled) {
          setFoodLoading(false);
        }
      }
    };

    loadFoodItems();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    saveStorage(
      ATTENDANCE_KEY,
      attendance
    );
  }, [attendance]);

  useEffect(() => {
    saveUsers(users);
  }, [users]);

  useEffect(() => {
    localStorage.setItem(
      SCHOOL_KEY,
      JSON.stringify(
        schoolName
      )
    );
  }, [schoolName]);

  const handleLogin = (loggedUser) => {
    const normalizedUser =
      loggedUser?.role === "teacher"
        ? normalizeTeacherFields(loggedUser)
        : loggedUser;

    setUser(normalizedUser);
    localStorage.setItem(
      "ssfms_current_user",
      JSON.stringify(normalizedUser)
    );
  };

  const handleLogout = () => {
    setUser(null);
    clearSession();
  };

  // Drop back to the login screen when the API rejects an expired token.
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      clearSession();
    };

    window.addEventListener(
      "ssfms:unauthorized",
      handleUnauthorized
    );

    return () => {
      window.removeEventListener(
        "ssfms:unauthorized",
        handleUnauthorized
      );
    };
  }, []);

  if (!user) {
    return (
      <Login
        onLogin={
          handleLogin
        }
      />
    );
  }

  if (
    user.role ===
    "admin"
  ) {
    return (
      <AdminApp
        user={user}
        onLogout={
          handleLogout
        }
        schoolName={
          schoolName
        }
        setSchoolName={
          setSchoolName
        }
        foodItems={
          foodItems
        }
        setFoodItems={
          setFoodItems
        }
        foodLoading={
          foodLoading
        }
        foodError={
          foodError
        }
        users={users}
        setUsers={setUsers}
        attendance={
          attendance
        }
      />
    );
  }

  return (
    <TeacherApp
      user={user}
      onLogout={
        handleLogout
      }
      schoolName={
        schoolName
      }
      foodItems={
        foodItems
      }
      attendance={
        attendance
      }
      setAttendance={
        setAttendance
      }
    />
  );
}

/* =========================================================
   SIDEBAR
========================================================= */

function Sidebar({
  title,
  activePage,
  setActivePage,
  menuItems,
  onLogout,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-logo">
          🍎
        </div>

        <div>
          <h2>SSFMS</h2>
          <span>
            {title}
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        {menuItems.map(
          (item) => (
            <button
              key={
                item.id
              }
              className={`nav-item ${
                activePage ===
                item.id
                  ? "active"
                  : ""
              }`}
              onClick={() =>
                setActivePage(
                  item.id
                )
              }
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              <span>
                {item.label}
              </span>
            </button>
          )
        )}
      </nav>

      <button
        className="logout-nav-button"
        onClick={
          onLogout
        }
      >
        🚪 Logout
      </button>
    </aside>
  );
}

/* =========================================================
   TOPBAR
========================================================= */

function Topbar({
  schoolName,
  user,
}) {
  return (
    <header className="topbar">
      <div>
        <h1>
          {schoolName}
        </h1>

        <p>
          Smart School Food Management System
        </p>
      </div>

      <div className="user-badge">
        <div className="user-avatar">
          {user.name
            ?.charAt(0)
            .toUpperCase()}
        </div>

        <div>
          <strong>
            {user.name}
          </strong>

          <span>
            {user.role ===
            "admin"
              ? "Administrator"
              : "Teacher"}
          </span>
        </div>
      </div>
    </header>
  );
}

/* =========================================================
   ADMIN APP
========================================================= */

function AdminApp({
  user,
  onLogout,
  schoolName,
  setSchoolName,
  foodItems,
  setFoodItems,
  foodLoading,
  foodError,
  users,
  setUsers,
  attendance,
}) {
  const [
    activePage,
    setActivePage,
  ] = useState(
    "dashboard"
  );

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "🏠",
    },

    {
      id: "school",
      label: "School Settings",
      icon: "🏫",
    },

    {
      id: "food",
      label: "Food Management",
      icon: "🍎",
    },

    {
      id: "teachers",
      label: "Teacher Management",
      icon: "👨‍🏫",
    },

    {
      id: "attendance",
      label: "Attendance",
      icon: "👥",
    },

    {
      id: "expenditure",
      label: "Expenditure",
      icon: "💰",
    },

    {
      id: "reports",
      label: "Reports",
      icon: "📄",
    },

    {
      id: "predictions",
      label: "Predictions",
      icon: "📈",
    },
  ];

  const renderPage = () => {
    switch (
      activePage
    ) {
      case "school":
        return (
          <SchoolSettings
            schoolName={
              schoolName
            }
            setSchoolName={
              setSchoolName
            }
          />
        );

      case "food":
        return (
          <FoodManagement
            foodItems={
              foodItems
            }
            setFoodItems={
              setFoodItems
            }
            foodLoading={
              foodLoading
            }
            foodError={
              foodError
            }
          />
        );

      case "teachers":
        return (
          <TeacherManagement
            users={users}
            setUsers={
              setUsers
            }
          />
        );

      case "attendance":
        return (
          <AttendanceOverview
            users={users}
            attendance={
              attendance
            }
          />
        );

      case "expenditure":
        return (
          <ExpenditurePage
            foodItems={
              foodItems
            }
            attendance={
              attendance
            }
          />
        );

      case "reports":
        return (
          <ReportsPage
            foodItems={
              foodItems
            }
            attendance={
              attendance
            }
            users={users}
            schoolName={
              schoolName
            }
          />
        );

      case "predictions":
        return (
          <PredictionsPage
            foodItems={
              foodItems
            }
            attendance={
              attendance
            }
          />
        );

      default:
        return (
          <AdminDashboard
            schoolName={
              schoolName
            }
            foodItems={
              foodItems
            }
            users={users}
            attendance={
              attendance
            }
            setActivePage={
              setActivePage
            }
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        title="Admin Panel"
        activePage={
          activePage
        }
        setActivePage={
          setActivePage
        }
        menuItems={
          menuItems
        }
        onLogout={
          onLogout
        }
      />

      <div className="main-area">
        <Topbar
          schoolName={
            schoolName
          }
          user={user}
        />

        <main className="page-content">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN DASHBOARD
========================================================= */

function AdminDashboard({
  schoolName,
  foodItems,
  users,
  attendance,
  setActivePage,
}) {
  const teacherCount =
    users.filter(
      (item) =>
        item.role ===
        "teacher"
    ).length;

  const todayAttendance =
    attendance.filter(
      (item) =>
        item.date ===
        todayString()
    );

  const totalPresent =
    todayAttendance.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.vegPresent ||
            0
        ) +
        Number(
          item.nonVegPresent ||
            0
        ),
      0
    );

  return (
    <div>
      <PageTitle
        title="Admin Dashboard"
        subtitle={`Welcome to ${schoolName}`}
      />

      <div className="stats-grid">
        <StatCard
          icon="👨‍🏫"
          title="Teachers"
          value={
            teacherCount
          }
        />

        <StatCard
          icon="🍎"
          title="Food Items"
          value={
            foodItems.length
          }
        />

        <StatCard
          icon="👥"
          title="Today's Present"
          value={
            totalPresent
          }
        />

        <StatCard
          icon="📊"
          title="Attendance Records"
          value={
            attendance.length
          }
        />
      </div>

      <h3 className="section-heading">
        Quick Access
      </h3>

      <div className="quick-grid">
        <QuickCard
          icon="🏫"
          title="School Settings"
          text="Manage school name and information."
          onClick={() =>
            setActivePage(
              "school"
            )
          }
        />

        <QuickCard
          icon="🍎"
          title="Food Management"
          text="Add, edit and delete food items."
          onClick={() =>
            setActivePage(
              "food"
            )
          }
        />

        <QuickCard
          icon="👨‍🏫"
          title="Teacher Management"
          text="Create and manage teacher accounts."
          onClick={() =>
            setActivePage(
              "teachers"
            )
          }
        />

        <QuickCard
          icon="💰"
          title="Expenditure"
          text="View calculated food expenditure."
          onClick={() =>
            setActivePage(
              "expenditure"
            )
          }
        />

        <QuickCard
          icon="📄"
          title="Reports"
          text="Generate official school reports."
          onClick={() =>
            setActivePage(
              "reports"
            )
          }
        />

        <QuickCard
          icon="📈"
          title="Predictions"
          text="Estimate future expenditure."
          onClick={() =>
            setActivePage(
              "predictions"
            )
          }
        />
      </div>
    </div>
  );
}

/* =========================================================
   SCHOOL SETTINGS
========================================================= */

function SchoolSettings({
  schoolName,
  setSchoolName,
}) {
  const [value, setValue] =
    useState(
      schoolName
    );

  const [message, setMessage] =
    useState("");

  const saveSchool = () => {
    if (
      !value.trim()
    ) {
      setMessage(
        "School name cannot be empty."
      );

      return;
    }

    setSchoolName(
      value.trim()
    );

    setMessage(
      "School name updated successfully."
    );
  };

  return (
    <div>
      <PageTitle
        title="School Settings"
        subtitle="Manage your school information"
      />

      <div className="form-card">
        <div className="form-group">
          <label>
            School Name
          </label>

          <input
            value={value}
            onChange={(
              event
            ) =>
              setValue(
                event.target
                  .value
              )
            }
            placeholder="Enter school name"
          />
        </div>

        <button
          className="primary-button"
          onClick={
            saveSchool
          }
        >
          Save Changes
        </button>

        {message && (
          <div className="success-message">
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   FOOD MANAGEMENT
========================================================= */

function FoodManagement({
  foodItems,
  setFoodItems,
  foodLoading,
  foodError,
}) {
  const emptyForm = {
    name: "",
    category: "Veg",
    rate: "",
    quantity: "",
    unit: "pieces",
  };

  const [form, setForm] =
    useState(emptyForm);

  const [editingId, setEditingId] =
    useState(null);

  const [saving, setSaving] =
    useState(false);

  const handleChange = (
    field,
    value
  ) => {
    setForm((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !form.name.trim() ||
      !form.rate ||
      !form.quantity
    ) {
      alert(
        "Please fill all food details."
      );
      return;
    }

    const food = {
      name: form.name.trim(),
      category: form.category,
      rate: Number(form.rate),
      quantity: Number(form.quantity),
      unit: form.unit,
    };

    try {
      setSaving(true);

      const isEditing =
        editingId !== null;

      const response = await apiFetch(
        isEditing
          ? `/food/${editingId}`
          : "/food",
        {
          method: isEditing
            ? "PUT"
            : "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify(food),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Unable to save food item."
        );
      }

      if (isEditing) {
        const updatedFood =
          data?.food || {
            id: editingId,
            ...food,
          };

        setFoodItems((previous) =>
          previous.map((item) =>
            item.id === editingId
              ? updatedFood
              : item
          )
        );

        alert(
          "Food item updated successfully."
        );
      } else {
        const newFood =
          data?.food || data;

        setFoodItems((previous) => [
          ...previous,
          newFood,
        ]);

        alert(
          "Food item added successfully."
        );
      }

      setForm(emptyForm);
      setEditingId(null);
    } catch (error) {
      console.error(
        "Food save failed:",
        error
      );

      alert(
        error.message ||
          "Unable to save food item. Make sure the FastAPI backend is running."
      );
    } finally {
      setSaving(false);
    }
  };

  const editFood = (item) => {
    setEditingId(item.id);

    setForm({
      name: item.name || "",
      category:
        item.category || "Veg",
      rate: item.rate ?? "",
      quantity: item.quantity ?? "",
      unit: item.unit || "pieces",
    });

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  };

  const deleteFood = async (id) => {
    if (
      !window.confirm(
        "Delete this food item?"
      )
    ) {
      return;
    }

    try {
      const response = await apiFetch(
        `/food/${id}`,
        {
          method: "DELETE",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ||
            "Unable to delete food item."
        );
      }

      setFoodItems((previous) =>
        previous.filter(
          (item) => item.id !== id
        )
      );

      if (editingId === id) {
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (error) {
      console.error(
        "Food delete failed:",
        error
      );

      alert(
        error.message ||
          "Unable to delete food item."
      );
    }
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  return (
    <div>
      <PageTitle
        title="Food Management"
        subtitle="Add and manage food items, rates and quantities"
      />

      {foodError && (
        <div className="error-message">
          {foodError}
        </div>
      )}

      <div className="form-card">
        <h3>
          {editingId !== null
            ? "Edit Food"
            : "Add Food Item"}
        </h3>

        <form
          onSubmit={handleSubmit}
        >
          <div className="form-grid">
            <div className="form-group">
              <label>
                Food Name
              </label>

              <input
                value={form.name}
                onChange={(event) =>
                  handleChange(
                    "name",
                    event.target.value
                  )
                }
                placeholder="Example: Banana"
              />
            </div>

            <div className="form-group">
              <label>
                Category
              </label>

              <select
                value={form.category}
                onChange={(event) =>
                  handleChange(
                    "category",
                    event.target.value
                  )
                }
              >
                <option value="Veg">
                  Veg
                </option>

                <option value="Non-Veg">
                  Non-Veg
                </option>
              </select>
            </div>

            <div className="form-group">
              <label>
                Rate (₹)
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.rate}
                onChange={(event) =>
                  handleChange(
                    "rate",
                    event.target.value
                  )
                }
                placeholder="24"
              />
            </div>

            <div className="form-group">
              <label>
                Quantity / Pieces
              </label>

              <input
                type="number"
                min="1"
                step="0.01"
                value={form.quantity}
                onChange={(event) =>
                  handleChange(
                    "quantity",
                    event.target.value
                  )
                }
                placeholder="12"
              />
            </div>

            <div className="form-group">
              <label>
                Unit
              </label>

              <select
                value={form.unit}
                onChange={(event) =>
                  handleChange(
                    "unit",
                    event.target.value
                  )
                }
              >
                <option value="pieces">
                  Pieces
                </option>

                <option value="kg">
                  Kg
                </option>

                <option value="litres">
                  Litres
                </option>

                <option value="packets">
                  Packets
                </option>

                <option value="servings">
                  Servings
                </option>
              </select>
            </div>
          </div>

          <div className="button-row">
            <button
              className="primary-button"
              type="submit"
              disabled={saving}
            >
              {saving
                ? "Saving..."
                : editingId !== null
                  ? "Update Food"
                  : "Add Food"}
            </button>

            {editingId !== null && (
              <button
                type="button"
                className="secondary-button"
                onClick={cancelEdit}
                disabled={saving}
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h3>
            Food Items
          </h3>

          <span>
            {foodLoading
              ? "Loading..."
              : `${foodItems.length} items`}
          </span>
        </div>

        {foodLoading ? (
          <div className="empty-state">
            <div>
              ⏳
            </div>
            <p>
              Loading food items from PostgreSQL...
            </p>
          </div>
        ) : foodItems.length === 0 ? (
          <EmptyState text="No food items added yet." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    Food
                  </th>
                  <th>
                    Category
                  </th>
                  <th>
                    Rate
                  </th>
                  <th>
                    Quantity
                  </th>
                  <th>
                    Unit
                  </th>
                  <th>
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {foodItems.map(
                  (item) => (
                    <tr
                      key={item.id}
                    >
                      <td>
                        <strong>
                          {item.name}
                        </strong>
                      </td>

                      <td>
                        <span
                          className={`category-badge ${
                            item.category ===
                            "Veg"
                              ? "veg"
                              : "nonveg"
                          }`}
                        >
                          {item.category}
                        </span>
                      </td>

                      <td>
                        {formatCurrency(
                          item.rate
                        )}
                      </td>

                      <td>
                        {item.quantity}
                      </td>

                      <td>
                        {item.unit || "pieces"}
                      </td>

                      <td>
                        <button
                          className="small-button"
                          onClick={() =>
                            editFood(item)
                          }
                          disabled={saving}
                        >
                          Edit
                        </button>

                        <button
                          className="small-button danger"
                          onClick={() =>
                            deleteFood(
                              item.id
                            )
                          }
                          disabled={saving}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   TEACHER MANAGEMENT
========================================================= */

function TeacherManagement({
  users,
  setUsers,
}) {
  const emptyForm = {
    name: "",
    username: "",
    password: "",
    className: "",
    section: "",
    totalStudents: "",
    vegStudents: "",
    nonVegStudents: "",
  };

  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [showFormPassword, setShowFormPassword] = useState(false);

  const togglePasswordVisibility = (teacherId) => {
    setVisiblePasswords((previous) => ({
      ...previous,
      [teacherId]: !previous[teacherId],
    }));
  };

  const handleChange = (field, value) => {
    const normalizedValue =
      field === "className" || field === "section"
        ? value.toUpperCase()
        : value;

    setForm((previous) => ({
      ...previous,
      [field]: normalizedValue,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage("");
    setError("");

    const name = form.name.trim();
    const username = form.username.trim();
    const className = form.className.trim().toUpperCase();
    const section = form.section.trim().toUpperCase();
    const total = Number(form.totalStudents);
    const veg = Number(form.vegStudents);
    const nonVeg = Number(form.nonVegStudents);

    if (
      !name || !username || !form.password ||
      !className || !section ||
      form.totalStudents === "" || form.vegStudents === "" ||
      form.nonVegStudents === ""
    ) {
      setError("Please fill all teacher details.");
      return;
    }

    if (
      !Number.isInteger(total) || !Number.isInteger(veg) ||
      !Number.isInteger(nonVeg) || total <= 0 || veg < 0 || nonVeg < 0
    ) {
      setError("Total students must be a positive whole number; Veg and Non-Veg counts must be non-negative whole numbers.");
      return;
    }

    if (veg + nonVeg !== total) {
      setError("Veg students + Non-Veg students must equal total students.");
      return;
    }

    const duplicate = users.some(
      (item) => item.username?.toLowerCase() === username.toLowerCase() && item.id !== editingId
    );

    if (duplicate) {
      setError("Username already exists. Please choose another username.");
      return;
    }

    // Keep camelCase fields in the React app, but send the exact snake_case
    // field names required by the FastAPI POST /teachers request model.
    const teacherForUI = {
      name,
      username,
      password: form.password,
      role: "teacher",
      className,
      section,
      totalStudents: total,
      vegStudents: veg,
      nonVegStudents: nonVeg,
    };

    if (editingId !== null) {
      // The current backend schema confirmed in Swagger is for POST /teachers.
      // This keeps existing local edit behavior without assuming an unverified PUT schema.
      setUsers((previous) => previous.map((item) =>
        item.id === editingId ? { ...item, ...teacherForUI } : item
      ));
      setMessage("Teacher details updated in this app.");
    } else {
      const teacherForAPI = {
        name,
        username,
        password: form.password,
        role: "teacher",
        class_name: className,
        section,
        total_students: total,
        veg_students: veg,
        nonveg_students: nonVeg,
      };

      try {
        setSaving(true);
        const response = await apiFetch("/teachers", {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(teacherForAPI),
        });

        const responseText = await response.text();
        let responseData = null;
        if (responseText) {
          try {
            responseData = JSON.parse(responseText);
          } catch {
            responseData = responseText;
          }
        }

        if (!response.ok) {
          const detail = Array.isArray(responseData?.detail)
            ? responseData.detail.map((item) => `${(item.loc || []).slice(-1)[0] || "Field"}: ${item.msg}`).join("; ")
            : responseData?.detail || responseData?.message || responseText;
          throw new Error(detail || `Teacher creation failed (HTTP ${response.status}).`);
        }

        const responseTeacher = responseData && typeof responseData === "object"
          ? responseData.teacher || responseData
          : {};
        const savedTeacher = {
          ...teacherForUI,
          id: responseTeacher.id ?? responseTeacher.teacher_id ?? `teacher-${Date.now()}`,
          // Accommodate either API naming style if the backend returns a teacher object.
          className: String(responseTeacher.className ?? responseTeacher.class_name ?? teacherForUI.className).trim().toUpperCase(),
          section: String(responseTeacher.section ?? teacherForUI.section).trim().toUpperCase(),
          totalStudents: responseTeacher.totalStudents ?? responseTeacher.total_students ?? total,
          vegStudents: responseTeacher.vegStudents ?? responseTeacher.veg_students ?? veg,
          nonVegStudents: responseTeacher.nonVegStudents ?? responseTeacher.nonveg_students ?? nonVeg,
        };

        setUsers((previous) => [...previous, savedTeacher]);
        setMessage("Teacher created successfully and sent to the FastAPI backend.");
      } catch (submitError) {
        console.error("Teacher creation failed:", submitError);
        setError(
          submitError.message ||
          "Unable to create teacher. Confirm FastAPI is running on port 8001 and check its terminal for details."
        );
        return;
      } finally {
        setSaving(false);
      }
    }

    setForm(emptyForm);
    setEditingId(null);
  };

  const editTeacher = (teacher) => {
    setEditingId(teacher.id);
    setMessage("");
    setError("");
    setForm({
      name: teacher.name || "",
      username: teacher.username || "",
      password: teacher.password || "",
      className: String(teacher.className ?? teacher.class_name ?? "").trim().toUpperCase(),
      section: String(teacher.section ?? "").trim().toUpperCase(),
      totalStudents: teacher.totalStudents ?? teacher.total_students ?? "",
      vegStudents: teacher.vegStudents ?? teacher.veg_students ?? "",
      nonVegStudents: teacher.nonVegStudents ?? teacher.nonveg_students ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteTeacher = (id) => {
    if (!window.confirm("Delete this teacher account from the local app list?")) return;
    setUsers((previous) => previous.filter((item) => item.id !== id));
    setMessage("Teacher removed from the local app list. This does not delete the database record.");
  };

  const teachers = users.filter((item) => item.role === "teacher");

  return (
    <div>
      <PageTitle
        title="Teacher Management"
        subtitle="Create teacher accounts and assign classes"
      />

      <div className="form-card">
        <h3>{editingId !== null ? "Edit Teacher" : "Create Teacher Account"}</h3>
        {message && <div className="success-message" role="status">{message}</div>}
        {error && <div className="error-message" role="alert">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label>Teacher Name</label>
              <input value={form.name} onChange={(event) => handleChange("name", event.target.value)} placeholder="Teacher name" required />
            </div>
            <div className="form-group">
              <label>Username</label>
              <input value={form.username} onChange={(event) => handleChange("username", event.target.value)} placeholder="Teacher username" autoComplete="username" required />
            </div>
            <div className="form-group">
              <label>Password</label>
              <div className="password-input-wrapper">
                <input
                  type={showFormPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(event) => handleChange("password", event.target.value)}
                  placeholder="Password"
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  className="password-toggle-button"
                  onClick={() => setShowFormPassword((previous) => !previous)}
                  aria-label={showFormPassword ? "Hide password" : "Show password"}
                  title={showFormPassword ? "Hide password" : "Show password"}
                >
                  {showFormPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label>Class</label>
              <input value={form.className} onChange={(event) => handleChange("className", event.target.value)} placeholder="CLASS 5" required />
            </div>
            <div className="form-group">
              <label>Section</label>
              <input value={form.section} onChange={(event) => handleChange("section", event.target.value)} placeholder="A" required />
            </div>
            <div className="form-group">
              <label>Total Students</label>
              <input type="number" min="1" step="1" value={form.totalStudents} onChange={(event) => handleChange("totalStudents", event.target.value)} required />
            </div>
            <div className="form-group">
              <label>Veg Students</label>
              <input type="number" min="0" step="1" value={form.vegStudents} onChange={(event) => handleChange("vegStudents", event.target.value)} required />
            </div>
            <div className="form-group">
              <label>Non-Veg Students</label>
              <input type="number" min="0" step="1" value={form.nonVegStudents} onChange={(event) => handleChange("nonVegStudents", event.target.value)} required />
            </div>
          </div>

          <div className="button-row">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Creating..." : editingId !== null ? "Update Teacher" : "Create Teacher"}
            </button>
            {editingId !== null && (
              <button type="button" className="secondary-button" onClick={() => { setEditingId(null); setForm(emptyForm); setError(""); setMessage(""); }}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h3>Teacher Accounts</h3>
          <span>{teachers.length} teachers</span>
        </div>
        {teachers.length === 0 ? (
          <EmptyState text="No teacher accounts created." />
        ) : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Name</th><th>Username</th><th>Password</th><th>Class</th><th>Section</th>
                  <th>Total</th><th>Veg</th><th>Non-Veg</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {teachers.map((teacher) => (
                  <tr key={teacher.id}>
                    <td><strong>{teacher.name}</strong></td>
                    <td>{teacher.username}</td>
                    <td>
                      <div className="teacher-password-cell">
                        <span className="teacher-password-text">
                          {visiblePasswords[teacher.id]
                            ? teacher.password || "Not available"
                            : "••••••••"}
                        </span>
                        <button
                          type="button"
                          className="password-toggle-button"
                          onClick={() => togglePasswordVisibility(teacher.id)}
                          aria-label={
                            visiblePasswords[teacher.id]
                              ? `Hide password for ${teacher.name}`
                              : `Show password for ${teacher.name}`
                          }
                          title={visiblePasswords[teacher.id] ? "Hide password" : "Show password"}
                        >
                          {visiblePasswords[teacher.id] ? "🙈" : "👁️"}
                        </button>
                      </div>
                    </td>
                    <td>{teacher.className ?? teacher.class_name ?? "-"}</td>
                    <td>{teacher.section || "-"}</td>
                    <td>{teacher.totalStudents ?? teacher.total_students ?? "-"}</td>
                    <td>{teacher.vegStudents ?? teacher.veg_students ?? "-"}</td>
                    <td>{teacher.nonVegStudents ?? teacher.nonveg_students ?? "-"}</td>
                    <td>
                      <button type="button" className="small-button" onClick={() => editTeacher(teacher)}>Edit</button>
                      <button type="button" className="small-button danger" onClick={() => deleteTeacher(teacher.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   ATTENDANCE OVERVIEW
========================================================= */

function AttendanceOverview({
  users,
  attendance,
}) {
  const teachers =
    users.filter(
      (item) =>
        item.role ===
        "teacher"
    );

  return (
    <div>
      <PageTitle
        title="Attendance Overview"
        subtitle="View attendance submitted by teachers"
      />

      <div className="table-card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Teacher
                </th>

                <th>
                  Class
                </th>

                <th>
                  Section
                </th>

                <th>
                  Veg Present
                </th>

                <th>
                  Non-Veg Present
                </th>

                <th>
                  Total Present
                </th>

                <th>
                  Total Absent
                </th>
              </tr>
            </thead>

            <tbody>
              {attendance.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="8"
                    className="empty-cell"
                  >
                    No attendance records yet.
                  </td>
                </tr>
              ) : (
                attendance.map(
                  (
                    record
                  ) => {
                    const teacher =
                      teachers.find(
                        (
                          item
                        ) =>
                          item.id ===
                          record.teacherId
                      );

                    const totalPresent =
                      Number(
                        record.vegPresent ||
                          0
                      ) +
                      Number(
                        record.nonVegPresent ||
                          0
                      );

                    const totalAbsent =
                      Number(
                        record.totalStudents ||
                          0
                      ) -
                      totalPresent;

                    return (
                      <tr
                        key={
                          record.id
                        }
                      >
                        <td>
                          {
                            record.date
                          }
                        </td>

                        <td>
                          {teacher?.name ||
                            record.teacherName ||
                            "Unknown"}
                        </td>

                        <td>
                          {teacher?.className ||
                            record.className ||
                            "-"}
                        </td>

                        <td>
                          {teacher?.section ||
                            record.section ||
                            "-"}
                        </td>

                        <td>
                          {
                            record.vegPresent
                          }
                        </td>

                        <td>
                          {
                            record.nonVegPresent
                          }
                        </td>

                        <td>
                          {
                            totalPresent
                          }
                        </td>

                        <td>
                          {Math.max(
                            0,
                            totalAbsent
                          )}
                        </td>
                      </tr>
                    );
                  }
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   EXPENDITURE CALCULATION
========================================================= */

function calculateRecordExpenditure(
  record,
  foodItems
) {
  let total = 0;

  foodItems.forEach(
    (food) => {
      const eligibleStudents =
        food.category ===
        "Veg"
          ? Number(
              record.vegPresent ||
                0
            )
          : Number(
              record.nonVegPresent ||
                0
            );

      total +=
        eligibleStudents *
        Number(
          food.rate || 0
        );
    }
  );

  return total;
}

/* =========================================================
   EXPENDITURE PAGE
========================================================= */

function ExpenditurePage({
  foodItems,
  attendance,
}) {
  const recordsWithExpenditure =
    attendance.map(
      (record) => ({
        ...record,

        expenditure:
          calculateRecordExpenditure(
            record,
            foodItems
          ),
      })
    );

  const totalExpenditure =
    recordsWithExpenditure.reduce(
      (
        sum,
        record
      ) =>
        sum +
        record.expenditure,
      0
    );

  const todayExpenditure =
    recordsWithExpenditure
      .filter(
        (record) =>
          record.date ===
          todayString()
      )
      .reduce(
        (
          sum,
          record
        ) =>
          sum +
          record.expenditure,
        0
      );

  const currentMonth =
    new Date()
      .toISOString()
      .slice(0, 7);

  const monthExpenditure =
    recordsWithExpenditure
      .filter(
        (record) =>
          record.date.startsWith(
            currentMonth
          )
      )
      .reduce(
        (
          sum,
          record
        ) =>
          sum +
          record.expenditure,
        0
      );

  return (
    <div>
      <PageTitle
        title="Expenditure"
        subtitle="Track calculated food expenditure"
      />

      <div className="stats-grid">
        <StatCard
          icon="💰"
          title="Today's Expenditure"
          value={formatCurrency(
            todayExpenditure
          )}
        />

        <StatCard
          icon="📅"
          title="This Month"
          value={formatCurrency(
            monthExpenditure
          )}
        />

        <StatCard
          icon="📊"
          title="Recorded Total"
          value={formatCurrency(
            totalExpenditure
          )}
        />
      </div>

      <div className="table-card">
        <div className="table-header">
          <h3>
            Expenditure Records
          </h3>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Teacher
                </th>

                <th>
                  Present
                </th>

                <th>
                  Expenditure
                </th>
              </tr>
            </thead>

            <tbody>
              {recordsWithExpenditure.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="4"
                    className="empty-cell"
                  >
                    No expenditure records yet.
                  </td>
                </tr>
              ) : (
                recordsWithExpenditure.map(
                  (
                    record
                  ) => (
                    <tr
                      key={
                        record.id
                      }
                    >
                      <td>
                        {
                          record.date
                        }
                      </td>

                      <td>
                        {
                          record.teacherName
                        }
                      </td>

                      <td>
                        {Number(
                          record.vegPresent ||
                            0
                        ) +
                          Number(
                            record.nonVegPresent ||
                              0
                          )}
                      </td>

                      <td>
                        <strong>
                          {formatCurrency(
                            record.expenditure
                          )}
                        </strong>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="info-box">
        <strong>
          Calculation:
        </strong>{" "}
        expenditure is calculated from
        the number of present Veg/Non-Veg
        students and the rate of the
        corresponding food items.
      </div>
    </div>
  );
}

/* =========================================================
   REPORTS
========================================================= */

function ReportsPage({
  foodItems,
  attendance,
  users,
  schoolName,
}) {
  const [period, setPeriod] =
    useState("monthly");

  const [selectedDate, setSelectedDate] =
    useState(todayString());

  const selectedMonth =
    selectedDate.slice(0, 7);

  const selectedYear =
    selectedDate.slice(0, 4);

  /* =======================================================
     FILTER RECORDS
  ======================================================= */

  const filteredRecords =
    attendance.filter((record) => {
      if (period === "daily") {
        return (
          record.date === selectedDate
        );
      }

      if (period === "weekly") {
        const selected =
          new Date(
            `${selectedDate}T00:00:00`
          );

        const day =
          selected.getDay();

        const diff =
          day === 0
            ? -6
            : 1 - day;

        const monday =
          new Date(selected);

        monday.setDate(
          selected.getDate() + diff
        );

        const sunday =
          new Date(monday);

        sunday.setDate(
          monday.getDate() + 6
        );

        const recordDate =
          new Date(
            `${record.date}T00:00:00`
          );

        return (
          recordDate >= monday &&
          recordDate <= sunday
        );
      }

      if (period === "monthly") {
        return record.date.startsWith(
          selectedMonth
        );
      }

      if (period === "yearly") {
        return record.date.startsWith(
          selectedYear
        );
      }

      return false;
    });

  /* =======================================================
     SUMMARY
  ======================================================= */

  const reportTotal =
    filteredRecords.reduce(
      (sum, record) =>
        sum +
        calculateRecordExpenditure(
          record,
          foodItems
        ),
      0
    );

  const totalStudents =
    filteredRecords.reduce(
      (sum, record) =>
        sum +
        Number(
          record.totalStudents || 0
        ),
      0
    );

  const totalPresent =
    filteredRecords.reduce(
      (sum, record) =>
        sum +
        Number(
          record.vegPresent || 0
        ) +
        Number(
          record.nonVegPresent || 0
        ),
      0
    );

  const totalAbsent =
    Math.max(
      0,
      totalStudents -
        totalPresent
    );

  const totalVeg =
    filteredRecords.reduce(
      (sum, record) =>
        sum +
        Number(
          record.vegPresent || 0
        ),
      0
    );

  const totalNonVeg =
    filteredRecords.reduce(
      (sum, record) =>
        sum +
        Number(
          record.nonVegPresent || 0
        ),
      0
    );

  /* =======================================================
     PDF OPTIONS
  ======================================================= */

  const getPDFOptions =
    () => ({
      schoolName,
      period,
      selectedDate,
      filteredRecords,
      foodItems,
      users,
      calculateRecordExpenditure,
    });

  /* =======================================================
     PREVIEW
  ======================================================= */

  const handlePreviewPDF =
    () => {
      try {
        previewOfficialSSFMSReport(
          getPDFOptions()
        );
      } catch (error) {
        console.error(
          "SSFMS PDF preview failed:",
          error
        );

        alert(
          "Unable to open the PDF preview. Please allow pop-ups for this website and try again."
        );
      }
    };

  /* =======================================================
     DOWNLOAD
  ======================================================= */

  const handleDownloadPDF =
    () => {
      try {
        downloadOfficialSSFMSReport(
          getPDFOptions()
        );
      } catch (error) {
        console.error(
          "SSFMS PDF generation failed:",
          error
        );

        alert(
          "Unable to generate the PDF. Please check the browser console."
        );
      }
    };

  /* =======================================================
     SCREEN REPORT
  ======================================================= */

  return (
    <div>
      <div className="page-title-row">
        <PageTitle
          title="Reports"
          subtitle={`${schoolName} • SSFMS Report`}
        />

        <div className="button-row">
          <button
            className="secondary-button"
            onClick={
              handlePreviewPDF
            }
          >
            👁 Preview PDF
          </button>

          <button
            className="primary-button"
            onClick={
              handleDownloadPDF
            }
          >
            ⬇ Download Official PDF
          </button>
        </div>
      </div>

      {/* =================================================
          REPORT CONTROLS
      ================================================= */}

      <div className="form-card report-controls">
        <div className="form-grid">
          <div className="form-group">
            <label>
              Report Period
            </label>

            <select
              value={period}
              onChange={(event) =>
                setPeriod(
                  event.target.value
                )
              }
            >
              <option value="daily">
                Daily
              </option>

              <option value="weekly">
                Weekly
              </option>

              <option value="monthly">
                Monthly
              </option>

              <option value="yearly">
                Annual
              </option>
            </select>
          </div>

          <div className="form-group">
            <label>
              Date
            </label>

            <input
              type="date"
              value={selectedDate}
              onChange={(event) =>
                setSelectedDate(
                  event.target.value
                )
              }
            />
          </div>
        </div>
      </div>

      {/* =================================================
          REPORT PREVIEW ON WEBSITE
      ================================================= */}

      <div className="report-sheet">
        <div className="report-header">
          <h1>
            {schoolName}
          </h1>

          <h2>
            Smart School Food
            Management System
          </h2>

          <p>
            {period === "yearly"
              ? "Annual Report"
              : `${
                  period
                    .charAt(0)
                    .toUpperCase() +
                  period.slice(1)
                } Report`}
          </p>
        </div>

        {/* =================================================
            SUMMARY CARDS
        ================================================= */}

        <div className="stats-grid report-stats">
          <StatCard
            icon="👥"
            title="Students Recorded"
            value={
              totalStudents
            }
          />

          <StatCard
            icon="✅"
            title="Present"
            value={
              totalPresent
            }
          />

          <StatCard
            icon="❌"
            title="Absent"
            value={
              totalAbsent
            }
          />

          <StatCard
            icon="🥗"
            title="Veg"
            value={
              totalVeg
            }
          />

          <StatCard
            icon="🍗"
            title="Non-Veg"
            value={
              totalNonVeg
            }
          />

          <StatCard
            icon="💰"
            title="Expenditure"
            value={formatCurrency(
              reportTotal
            )}
          />
        </div>

        {/* =================================================
            REPORT DETAILS
        ================================================= */}

        <div className="form-card">
          <div className="report-detail-grid">
            <div>
              <span>
                Report Type
              </span>

              <strong>
                {period === "yearly"
                  ? "Annual"
                  : period
                      .charAt(0)
                      .toUpperCase() +
                    period.slice(1)}
              </strong>
            </div>

            <div>
              <span>
                Selected Date
              </span>

              <strong>
                {selectedDate}
              </strong>
            </div>

            <div>
              <span>
                Records
              </span>

              <strong>
                {
                  filteredRecords.length
                }
              </strong>
            </div>
          </div>
        </div>

        {/* =================================================
            EXPENDITURE INFORMATION
        ================================================= */}

        <div className="table-card">
          <div className="table-header">
            <h3>
              Expenditure Summary
            </h3>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>
                    Date
                  </th>

                  <th>
                    Teacher
                  </th>

                  <th>
                    Present
                  </th>

                  <th>
                    Expenditure
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredRecords.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan="4"
                      className="empty-cell"
                    >
                      No records available
                      for the selected
                      period.
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map(
                    (record) => (
                      <tr
                        key={
                          record.id
                        }
                      >
                        <td>
                          {
                            record.date
                          }
                        </td>

                        <td>
                          {
                            record.teacherName
                          }
                        </td>

                        <td>
                          {Number(
                            record.vegPresent ||
                              0
                          ) +
                            Number(
                              record.nonVegPresent ||
                                0
                            )}
                        </td>

                        <td>
                          <strong>
                            {formatCurrency(
                              calculateRecordExpenditure(
                                record,
                                foodItems
                              )
                            )}
                          </strong>
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* =================================================
            ANNUAL GRAPH MESSAGE
        ================================================= */}

        {period === "yearly" && (
          <div className="info-box">
            <strong>
              Annual Analysis:
            </strong>{" "}
            The official annual PDF
            contains a 12-month
            expenditure trend graph
            from January to December.
          </div>
        )}

        {period !== "yearly" && (
          <div className="info-box">
            <strong>
              Report:
            </strong>{" "}
            The official PDF uses a
            clean borderless
            institutional layout.
            The expenditure graph is
            included only in the
            Annual Report.
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================
   AI EXPENDITURE PREDICTIONS
========================================================= */

function PredictionsPage({
  foodItems,
  attendance,
}) {
  const [previousMonth, setPreviousMonth] = useState("22000");
  const [twoMonthsAgo, setTwoMonthsAgo] = useState("21500");
  const [targetYear, setTargetYear] = useState(() => new Date().getFullYear() + (new Date().getMonth() === 11 ? 1 : 0));
  const [targetMonth, setTargetMonth] = useState(() => new Date().getMonth() === 11 ? 1 : new Date().getMonth() + 2);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const monthlyData = useMemo(() => {
    const data = {};
    attendance.forEach((record) => {
      if (!record.date) return;
      const month = record.date.slice(0, 7);
      data[month] = (data[month] || 0) + calculateRecordExpenditure(record, foodItems);
    });
    return Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }));
  }, [attendance, foodItems]);

  useEffect(() => {
    if (monthlyData.length >= 2) {
      const latest = monthlyData[monthlyData.length - 1];
      const previous = monthlyData[monthlyData.length - 2];
      setPreviousMonth((current) => current === "22000" ? String(latest.amount.toFixed(2)) : current);
      setTwoMonthsAgo((current) => current === "21500" ? String(previous.amount.toFixed(2)) : current);
    }
  }, [monthlyData]);

  const generatePrediction = async (event) => {
    event.preventDefault();
    setError("");
    setPrediction(null);
    const previous = Number(previousMonth);
    const older = Number(twoMonthsAgo);
    if (!Number.isFinite(previous) || !Number.isFinite(older) || previous <= 0 || older <= 0) {
      setError("Enter valid expenditure values greater than zero for both previous months.");
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch("/predict/next-12-months", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previous_month_expenditure: previous,
          two_months_ago_expenditure: older,
          start_year: Number(targetYear),
          start_month: Number(targetMonth),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        const detail = result?.detail;
        throw new Error(typeof detail === "string" ? detail : detail?.error || "The prediction request failed. Check the request fields.");
      }
      setPrediction(result);
    } catch (err) {
      console.error("ML prediction error:", err);
      setError(err.message || "Could not reach the prediction service. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Accept common response key names so the page can render the backend's 12-row array.
  const rawForecast = prediction && (
    prediction.forecasts || prediction.predictions || prediction.monthly_predictions || prediction.monthly_forecast || prediction.forecast
  );
  const forecastRows = Array.isArray(rawForecast) ? rawForecast.map((item, index) => {
    const monthValue = item.month ?? item.predicted_month ?? item.forecast_month ?? item.date;
    const expenditure = Number(item.predicted_expenditure ?? item.expenditure ?? item.prediction ?? item.amount ?? item.predicted_value);
    let label = monthValue;
    if (typeof monthValue === "number") {
      label = `${monthNames[(monthValue - 1) % 12]} ${Number(targetYear) + Math.floor((monthValue - 1) / 12)}`;
    } else if (typeof monthValue === "string" && /^\d{4}-\d{2}$/.test(monthValue)) {
      const [year, month] = monthValue.split("-").map(Number);
      label = `${monthNames[month - 1]} ${year}`;
    }
    if (!label) {
      const date = new Date(Number(targetYear), Number(targetMonth) - 1 + index, 1);
      label = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    }
    return { label: String(label), expenditure: Number.isFinite(expenditure) ? expenditure : 0 };
  }) : [];
  const totalForecast = forecastRows.reduce((sum, item) => sum + item.expenditure, 0);
  const averageForecast = forecastRows.length ? totalForecast / forecastRows.length : 0;
  const maxForecast = Math.max(1, ...forecastRows.map((item) => item.expenditure));

  return (
    <div>
      <PageTitle title="AI Expenditure Prediction" subtitle="Forecast school food expenditure for the next 12 months using your trained Random Forest model." />
      <div className="info-box">
        <strong>AI Model:</strong> Random Forest Regression<br />
        <strong>Backend:</strong> FastAPI<br />
        <strong>Prediction:</strong> 12-month food expenditure forecast
      </div>

      <div className="table-card">
        <div className="table-header"><h3>Generate a 12-Month Forecast</h3></div>
        <form onSubmit={generatePrediction} style={{ padding: "24px" }}>
          <div className="form-grid">
            <div className="form-group"><label>Previous Month Expenditure (₹)</label><input type="number" min="0.01" step="0.01" value={previousMonth} onChange={(e) => setPreviousMonth(e.target.value)} required /></div>
            <div className="form-group"><label>Expenditure Two Months Ago (₹)</label><input type="number" min="0.01" step="0.01" value={twoMonthsAgo} onChange={(e) => setTwoMonthsAgo(e.target.value)} required /></div>
            <div className="form-group"><label>Start Year</label><input type="number" min="2000" max="2100" value={targetYear} onChange={(e) => setTargetYear(e.target.value)} required /></div>
            <div className="form-group"><label>Start Month</label><select value={targetMonth} onChange={(e) => setTargetMonth(e.target.value)} required>{monthNames.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></div>
          </div>
          <button type="submit" className="primary-button" disabled={loading}>{loading ? "Generating 12-Month Forecast..." : "Generate 12-Month Forecast"}</button>
        </form>
      </div>

      {error && <div className="error-box" role="alert" style={{ marginTop: "20px" }}>{error}</div>}

      {prediction && (
        <>
          {forecastRows.length > 0 ? (
            <>
              <div className="stats-grid" style={{ marginTop: "24px" }}>
                <StatCard icon="💰" title="12-Month Total" value={formatCurrency(totalForecast)} />
                <StatCard icon="📊" title="Monthly Average" value={formatCurrency(averageForecast)} />
                <StatCard icon="📅" title="Months Forecast" value={forecastRows.length} />
              </div>
              <div className="table-card" style={{ marginTop: "24px" }}>
                <div className="table-header"><h3>12-Month Expenditure Forecast</h3></div>
                <div style={{ width: "100%", height: 420, padding: "20px 24px 12px", boxSizing: "border-box" }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={forecastRows}
                      margin={{ top: 16, right: 28, left: 16, bottom: 72 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        interval={0}
                        angle={-35}
                        textAnchor="end"
                        height={80}
                        tick={{ fontSize: 12 }}
                        label={{ value: "Month", position: "insideBottom", offset: -58 }}
                      />
                      <YAxis
                        tickFormatter={(value) => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}
                        width={95}
                        domain={["auto", "auto"]}
                        label={{ value: "Predicted expenditure (₹)", angle: -90, position: "insideLeft", offset: 0 }}
                      />
                      <Tooltip
                        labelFormatter={(label) => `Month: ${label}`}
                        formatter={(value) => [formatCurrency(value), "Predicted expenditure"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="expenditure"
                        name="Predicted expenditure"
                        stroke="#2563eb"
                        strokeWidth={3}
                        dot={{ r: 5, fill: "#2563eb", strokeWidth: 1 }}
                        activeDot={{ r: 8 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="table-card" style={{ marginTop: "24px" }}>
                <div className="table-header"><h3>Monthly Prediction Details</h3></div>
                <div className="table-wrapper"><table><thead><tr><th>#</th><th>Forecast Month</th><th>Predicted Expenditure</th></tr></thead><tbody>{forecastRows.map((item, index) => <tr key={`${item.label}-row-${index}`}><td>{index + 1}</td><td>{item.label}</td><td><strong>{formatCurrency(item.expenditure)}</strong></td></tr>)}</tbody><tfoot><tr><th colSpan="2">12-Month Total</th><th>{formatCurrency(totalForecast)}</th></tr></tfoot></table></div>
              </div>
            </>
          ) : (
            <div className="table-card" style={{ marginTop: "24px", padding: "24px" }}>
              <h3>Prediction response received, but no monthly array was found.</h3>
              <p>Check the browser console or share the JSON response from POST /predict/next-12-months so the response field can be mapped exactly.</p>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(prediction, null, 2)}</pre>
            </div>
          )}
          <div className="info-box" style={{ marginTop: "20px" }}><strong>Important limitation:</strong> {prediction.warning || "This is an experimental forecast based on a small sample dataset. Its accuracy is not established for real-world school expenditure."}</div>
        </>
      )}

      <div className="table-card" style={{ marginTop: "24px" }}>
        <div className="table-header"><h3>Historical Monthly Expenditure</h3></div>
        <div className="table-wrapper"><table><thead><tr><th>Month</th><th>Expenditure</th></tr></thead><tbody>{monthlyData.length === 0 ? <tr><td colSpan="2" className="empty-cell">No local attendance expenditure records are available yet.</td></tr> : monthlyData.map((item) => <tr key={item.month}><td>{item.month}</td><td>{formatCurrency(item.amount)}</td></tr>)}</tbody></table></div>
      </div>
      <div className="info-box"><strong>Prototype notice:</strong> This model was trained on a small sample dataset. Its predictions are experimental and should not be treated as reliable financial estimates.</div>
    </div>
  );
}

/* =========================================================
   TEACHER APP
========================================================= */

function TeacherApp({
  user,
  onLogout,
  schoolName,
  foodItems,
  attendance,
  setAttendance,
}) {
  const [
    activePage,
    setActivePage,
  ] = useState(
    "dashboard"
  );

  const menuItems = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: "🏠",
    },

    {
      id: "attendance",
      label: "Attendance",
      icon: "👥",
    },

    {
      id: "food",
      label: "Today's Food",
      icon: "🍎",
    },

    {
      id: "reports",
      label: "My Reports",
      icon: "📄",
    },
  ];

  const renderPage = () => {
    switch (
      activePage
    ) {
      case "attendance":
        return (
          <TeacherAttendance
            user={user}
            attendance={
              attendance
            }
            setAttendance={
              setAttendance
            }
          />
        );

      case "food":
        return (
          <TeacherFood
            foodItems={
              foodItems
            }
          />
        );

      case "reports":
        return (
          <TeacherReports
            user={user}
            foodItems={
              foodItems
            }
            attendance={
              attendance
            }
          />
        );

      default:
        return (
          <TeacherDashboard
            user={user}
            attendance={
              attendance
            }
            setActivePage={
              setActivePage
            }
          />
        );
    }
  };

  return (
    <div className="app-layout">
      <Sidebar
        title="Teacher Panel"
        activePage={
          activePage
        }
        setActivePage={
          setActivePage
        }
        menuItems={
          menuItems
        }
        onLogout={
          onLogout
        }
      />

      <div className="main-area">
        <Topbar
          schoolName={
            schoolName
          }
          user={user}
        />

        <main className="page-content">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

/* =========================================================
   TEACHER DASHBOARD
========================================================= */

function TeacherDashboard({
  user,
  attendance,
  setActivePage,
}) {
  const todayRecord =
    attendance.find(
      (record) =>
        record.teacherId ===
          user.id &&
        record.date ===
          todayString()
    );

  const present =
    todayRecord
      ? Number(
          todayRecord.vegPresent ||
            0
        ) +
        Number(
          todayRecord.nonVegPresent ||
            0
        )
      : 0;

  const absent =
    Math.max(
      0,
      Number(
        user.totalStudents ||
          0
      ) - present
    );

  return (
    <div>
      <PageTitle
        title="Teacher Dashboard"
        subtitle={`Welcome, ${user.name}`}
      />

      <div className="assignment-card">
        <div>
          <span>
            Class
          </span>

          <strong>
            {
              String(user.className ?? user.class_name ?? "-").toUpperCase()
            }
          </strong>
        </div>

        <div>
          <span>
            Section
          </span>

          <strong>
            {
              String(user.section ?? "-").toUpperCase()
            }
          </strong>
        </div>

        <div>
          <span>
            Total Students
          </span>

          <strong>
            {
              user.totalStudents ?? user.total_students ?? "-"
            }
          </strong>
        </div>

        <div>
          <span>
            Veg / Non-Veg
          </span>

          <strong>
            {user.vegStudents ?? user.veg_students ?? "-"}{" "}
            /{" "}
            {user.nonVegStudents ?? user.nonveg_students ?? "-"}
          </strong>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          icon="✅"
          title="Present Today"
          value={
            present
          }
        />

        <StatCard
          icon="❌"
          title="Absent Today"
          value={
            absent
          }
        />
      </div>

      <div className="quick-grid">
        <QuickCard
          icon="👥"
          title="Enter Attendance"
          text="Submit today's Veg and Non-Veg attendance."
          onClick={() =>
            setActivePage(
              "attendance"
            )
          }
        />

        <QuickCard
          icon="🍎"
          title="Today's Food"
          text="View the food items and rates."
          onClick={() =>
            setActivePage(
              "food"
            )
          }
        />

        <QuickCard
          icon="📄"
          title="My Reports"
          text="View attendance and expenditure records."
          onClick={() =>
            setActivePage(
              "reports"
            )
          }
        />
      </div>
    </div>
  );
}

/* =========================================================
   TEACHER ATTENDANCE
========================================================= */

function TeacherAttendance({
  user,
  attendance,
  setAttendance,
}) {
  const [date, setDate] =
    useState(
      todayString()
    );

  // Saturday (6) and Sunday (0) are holidays.
  // Append T00:00:00 to avoid UTC date-shift issues.
  const selectedDate = date
    ? new Date(`${date}T00:00:00`)
    : null;
  const isWeekendHoliday =
    selectedDate !== null &&
    [0, 6].includes(selectedDate.getDay());
  const holidayName = selectedDate?.getDay() === 6
    ? "Saturday"
    : "Sunday";

  const existingRecord =
    attendance.find(
      (record) =>
        record.teacherId ===
          user.id &&
        record.date ===
          date
    );

  const [
    vegPresent,
    setVegPresent,
  ] = useState(
    existingRecord?.vegPresent ??
      ""
  );

  const [
    nonVegPresent,
    setNonVegPresent,
  ] = useState(
    existingRecord?.nonVegPresent ??
      ""
  );

  useEffect(() => {
    const record =
      attendance.find(
        (item) =>
          item.teacherId ===
            user.id &&
          item.date ===
            date
      );

    setVegPresent(
      record?.vegPresent ??
        ""
    );

    setNonVegPresent(
      record?.nonVegPresent ??
        ""
    );
  }, [
    date,
    attendance,
    user.id,
  ]);

  const totalPresent =
    Number(
      vegPresent || 0
    ) +
    Number(
      nonVegPresent ||
        0
    );

  const totalAbsent =
    Math.max(
      0,
      Number(
        user.totalStudents ||
          0
      ) -
        totalPresent
    );

  const saveAttendanceRecord =
    () => {
      if (isWeekendHoliday) {
        alert(`${holidayName} is a holiday. Attendance cannot be saved.`);
        return;
      }

      const veg =
        Number(
          vegPresent
        );

      const nonVeg =
        Number(
          nonVegPresent
        );

      if (
        veg < 0 ||
        nonVeg < 0 ||
        veg >
          user.vegStudents ||
        nonVeg >
          user.nonVegStudents
      ) {
        alert(
          "Present students cannot exceed the assigned Veg/Non-Veg students."
        );

        return;
      }

      const newRecord = {
        id:
          existingRecord?.id ||
          Date.now(),

        teacherId:
          user.id,

        teacherName:
          user.name,

        date,

        totalStudents:
          user.totalStudents,

        vegStudents:
          user.vegStudents,

        nonVegStudents:
          user.nonVegStudents,

        vegPresent:
          veg,

        nonVegPresent:
          nonVeg,
      };

      setAttendance(
        (previous) => {
          const withoutCurrent =
            previous.filter(
              (record) =>
                !(
                  record.teacherId ===
                    user.id &&
                  record.date ===
                    date
                )
            );

          return [
            ...withoutCurrent,
            newRecord,
          ];
        }
      );

      alert(
        "Attendance saved successfully."
      );
    };

  return (
    <div>
      <PageTitle
        title="Daily Attendance"
        subtitle="Enter today's student attendance"
      />

      <div className="assignment-card">
        <div>
          <span>
            Class
          </span>

          <strong>
            {
              user.className
            }
          </strong>
        </div>

        <div>
          <span>
            Section
          </span>

          <strong>
            {
              user.section
            }
          </strong>
        </div>

        <div>
          <span>
            Total Students
          </span>

          <strong>
            {
              user.totalStudents
            }
          </strong>
        </div>

        <div>
          <span>
            Veg / Non-Veg
          </span>

          <strong>
            {user.vegStudents}{" "}
            /{" "}
            {
              user.nonVegStudents
            }
          </strong>
        </div>
      </div>

      <div className="form-card">
        <div className="form-grid">
          <div className="form-group">
            <label>Date</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>

          {isWeekendHoliday ? (
            <div
              role="status"
              style={{
                gridColumn: "1 / -1",
                padding: "24px",
                borderRadius: "12px",
                background: "#fff4e5",
                color: "#8a4b08",
                textAlign: "center",
                fontWeight: 600,
              }}
            >
              🗓️ {holidayName} is a holiday. Attendance cannot be entered or saved.
            </div>
          ) : (
            <>
              <div className="form-group">
                <label>Veg Students Present</label>
                <input
                  type="number"
                  min="0"
                  max={user.vegStudents}
                  value={vegPresent}
                  onChange={(event) => setVegPresent(event.target.value)}
                  placeholder={`Maximum ${user.vegStudents}`}
                />
              </div>

              <div className="form-group">
                <label>Non-Veg Students Present</label>
                <input
                  type="number"
                  min="0"
                  max={user.nonVegStudents}
                  value={nonVegPresent}
                  onChange={(event) => setNonVegPresent(event.target.value)}
                  placeholder={`Maximum ${user.nonVegStudents}`}
                />
              </div>
            </>
          )}
        </div>

        {!isWeekendHoliday && (
          <>
            <div className="attendance-summary">
              <div>
                <span>Total Present</span>
                <strong>{totalPresent}</strong>
              </div>

              <div>
                <span>Total Absent</span>
                <strong>{totalAbsent}</strong>
              </div>
            </div>

            <button
              className="primary-button"
              onClick={saveAttendanceRecord}
            >
              Save Attendance
            </button>
          </>
        )}
      </div>

      <div className="info-box">
        🔒 Class, section, total students,
        Veg students and Non-Veg students
        are assigned by the Admin and
        cannot be edited here.
      </div>
    </div>
  );
}

/* =========================================================
   TEACHER FOOD
========================================================= */

function TeacherFood({
  foodItems,
}) {
  return (
    <div>
      <PageTitle
        title="Today's Food"
        subtitle="Food items configured by the Admin"
      />

      <div className="table-card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  Food
                </th>

                <th>
                  Category
                </th>

                <th>
                  Rate
                </th>

                <th>
                  Quantity
                </th>

                <th>
                  Unit
                </th>
              </tr>
            </thead>

            <tbody>
              {foodItems.map(
                (food) => (
                  <tr
                    key={
                      food.id
                    }
                  >
                    <td>
                      <strong>
                        {
                          food.name
                        }
                      </strong>
                    </td>

                    <td>
                      <span
                        className={`category-badge ${
                          food.category ===
                          "Veg"
                            ? "veg"
                            : "nonveg"
                        }`}
                      >
                        {
                          food.category
                        }
                      </span>
                    </td>

                    <td>
                      {formatCurrency(
                        food.rate
                      )}
                    </td>

                    <td>
                      {
                        food.quantity
                      }
                    </td>

                    <td>
                      {
                        food.unit
                      }
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   TEACHER REPORTS
========================================================= */

function TeacherReports({
  user,
  foodItems,
  attendance,
}) {
  const records =
    attendance.filter(
      (record) =>
        record.teacherId ===
        user.id
    );

  const totalExpenditure =
    records.reduce(
      (
        sum,
        record
      ) =>
        sum +
        calculateRecordExpenditure(
          record,
          foodItems
        ),
      0
    );

  return (
    <div>
      <PageTitle
        title="My Reports"
        subtitle={`${user.className} - Section ${user.section}`}
      />

      <div className="stats-grid">
        <StatCard
          icon="📅"
          title="Attendance Records"
          value={
            records.length
          }
        />

        <StatCard
          icon="💰"
          title="Total Expenditure"
          value={formatCurrency(
            totalExpenditure
          )}
        />
      </div>

      <div className="table-card">
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>
                  Date
                </th>

                <th>
                  Veg Present
                </th>

                <th>
                  Non-Veg Present
                </th>

                <th>
                  Total Present
                </th>

                <th>
                  Absent
                </th>

                <th>
                  Expenditure
                </th>
              </tr>
            </thead>

            <tbody>
              {records.length ===
              0 ? (
                <tr>
                  <td
                    colSpan="6"
                    className="empty-cell"
                  >
                    No attendance records yet.
                  </td>
                </tr>
              ) : (
                records
                  .slice()
                  .sort(
                    (
                      a,
                      b
                    ) =>
                      b.date.localeCompare(
                        a.date
                      )
                  )
                  .map(
                    (
                      record
                    ) => {
                      const present =
                        Number(
                          record.vegPresent ||
                            0
                        ) +
                        Number(
                          record.nonVegPresent ||
                            0
                        );

                      return (
                        <tr
                          key={
                            record.id
                          }
                        >
                          <td>
                            {
                              record.date
                            }
                          </td>

                          <td>
                            {
                              record.vegPresent
                            }
                          </td>

                          <td>
                            {
                              record.nonVegPresent
                            }
                          </td>

                          <td>
                            {
                              present
                            }
                          </td>

                          <td>
                            {Math.max(
                              0,
                              user.totalStudents -
                                present
                            )}
                          </td>

                          <td>
                            {formatCurrency(
                              calculateRecordExpenditure(
                                record,
                                foodItems
                              )
                            )}
                          </td>
                        </tr>
                      );
                    }
                  )
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   REUSABLE COMPONENTS
========================================================= */

function PageTitle({
  title,
  subtitle,
}) {
  return (
    <div className="page-title">
      <h2>
        {title}
      </h2>

      <p>
        {subtitle}
      </p>
    </div>
  );
}

function StatCard({
  icon,
  title,
  value,
}) {
  return (
    <div className="stat-card">
      <div className="stat-icon">
        {icon}
      </div>

      <div>
        <span>
          {title}
        </span>

        <strong>
          {value}
        </strong>
      </div>
    </div>
  );
}

function QuickCard({
  icon,
  title,
  text,
  onClick,
}) {
  return (
    <button
      className="quick-card"
      onClick={
        onClick
      }
    >
      <div className="quick-icon">
        {icon}
      </div>

      <div>
        <h3>
          {title}
        </h3>

        <p>
          {text}
        </p>
      </div>

      <span className="arrow">
        →
      </span>
    </button>
  );
}

function EmptyState({
  text,
}) {
  return (
    <div className="empty-state">
      <div>
        📭
      </div>

      <p>
        {text}
      </p>
    </div>
  );
}

export default App; 