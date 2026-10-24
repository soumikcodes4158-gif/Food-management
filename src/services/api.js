/**
 * Single place that knows where the API lives and how to authenticate.
 *
 * Local development:  VITE_API_BASE_URL=http://127.0.0.1:8001
 * AWS deployment:     VITE_API_BASE_URL=/api  (CloudFront proxies /api/* to
 *                     the FastAPI container on the same origin, so no CORS)
 */

const rawBase = (import.meta.env.VITE_API_BASE_URL ?? "").trim();

export const API_BASE_URL = rawBase.replace(/\/+$/, "");

const TOKEN_KEY = "ssfms_token";
const CURRENT_USER_KEY = "ssfms_current_user";

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token) {
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function isAuthenticated() {
  return Boolean(getToken());
}

/**
 * fetch() wrapper that adds the bearer token and reacts to expired sessions.
 */
export async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    clearSession();
    window.dispatchEvent(new Event("ssfms:unauthorized"));
  }

  return response;
}
