const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8001"
).replace(/\/+$/, "");

/**
 * Authenticate a user through the FastAPI backend.
 */
export async function loginUser(username, password) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });
  } catch (error) {
    console.error("Login connection error:", error);

    throw new Error(
      `Cannot connect to the backend at ${API_BASE_URL}. Make sure FastAPI is running.`
    );
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid username or password.");
    }

    if (response.status === 422) {
      throw new Error(
        "The login request has invalid fields. Check the backend login schema."
      );
    }

    throw new Error(
      data.detail || `Login failed with status ${response.status}.`
    );
  }

  return data;
}

/**
 * Read users saved locally in this browser.
 * Kept for compatibility with the existing App.jsx.
 */
export function getAllUsers() {
  try {
    const savedUsers = localStorage.getItem("ssfms_users");

    if (!savedUsers) {
      return [];
    }

    const parsedUsers = JSON.parse(savedUsers);

    return Array.isArray(parsedUsers) ? parsedUsers : [];
  } catch (error) {
    console.error("Unable to read saved users:", error);
    return [];
  }
}

/**
 * Save the local user list.
 * Kept for compatibility with the existing App.jsx.
 */
export function saveUsers(users) {
  try {
    localStorage.setItem(
      "ssfms_users",
      JSON.stringify(Array.isArray(users) ? users : [])
    );
  } catch (error) {
    console.error("Unable to save users:", error);
  }
}