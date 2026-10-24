import {
  API_BASE_URL,
  clearSession,
  setToken,
} from "./api";

/**
 * Authenticate a user through the FastAPI backend.
 * Returns the user object and stores the access token for later requests.
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
      `Cannot connect to the backend at ${API_BASE_URL || window.location.origin}. Please try again.`
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

    if (response.status === 429) {
      throw new Error("Too many login attempts. Please wait a minute.");
    }

    throw new Error(
      data.detail || `Login failed with status ${response.status}.`
    );
  }

  if (!data?.user || !data?.access_token) {
    throw new Error("The backend returned an unexpected login response.");
  }

  setToken(data.access_token);

  return data.user;
}

export function logoutUser() {
  clearSession();
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
