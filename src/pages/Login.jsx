import { useState } from "react";
import { loginUser } from "../services/authService";

function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    setError("");
    setLoading(true);

    const cleanUsername = username.trim();

    try {
      // Admin and teacher accounts both authenticate through the backend.
      // The old hardcoded admin/admin123 bypass has been removed.
      const user = await loginUser(cleanUsername, password);

      if (!user) {
        setError("Invalid username or password.");
        return;
      }

      onLogin(user);
    } catch (err) {
      console.error("Login error:", err);

      setError(
        err.message || "Unable to log in. Check your credentials and backend."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand-icon">🍎</div>

        <h1>SSFMS</h1>

        <p className="login-subtitle">
          Smart School Food Management System
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="login-username">Username</label>

            <input
              id="login-username"
              type="text"
              value={username}
              placeholder="Enter your username"
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password">Password</label>

            <div className="login-password-wrapper">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                placeholder="Enter your password"
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            className="primary-button login-button"
            disabled={loading}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default Login;