"use client";
import { useState } from "react";
import { Icon, Logo } from "./Icon";
export default function Login({ initialError = "" }: { initialError?: string }) {
  const [error, setError] = useState(initialError),
    [busy, setBusy] = useState(false),
    [showPassword, setShowPassword] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          password: data.get("password"),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      window.location.assign("/overview");
    } catch (e) {
      setError((e as Error).message || "Unable to sign in.");
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <section className="login-story">
        <a className="brand" href="/">
          <Logo />
          <span>
            horizon<span className="brand-label">INTERNAL</span>
          </span>
        </a>
        <div className="login-copy">
          <span className="eyebrow">A CLEARER VIEW OF YOUR PLATFORM</span>
          <h1>
            Every signal.
            <br />
            One horizon.
          </h1>
          <p>
            Your people, projects, and platform performance.
            <br />
            Connected in one thoughtful workspace.
          </p>
          <div className="login-graphic" aria-hidden="true">
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
            <div />
          </div>
        </div>
        <span className="login-footer">
          <Icon name="shield" size={16} /> A secure workspace for Horizon
          administrators
        </span>
      </section>
      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <span className="login-icon">
            <Icon name="lock" size={25} />
          </span>
          <h2>Welcome back</h2>
          <p>Sign in to your administration workspace.</p>
          <label>
            Email address
            <input
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
              maxLength={254}
            />
          </label>
          <label>
            Password
            <span className="password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                maxLength={200}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                <Icon name={showPassword ? "eye-off" : "eye"} size={19} />
              </button>
            </span>
          </label>
          {error && (
            <div className="error-banner" role="alert">
              {error}
            </div>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in…" : "Sign in to Horizon"}
            <Icon name="arrow" size={17} />
          </button>
          <div className="login-divider" aria-hidden="true">
            <span>or</span>
          </div>
          <a className="google-login-button" href="/api/auth/google/start">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.2-.2-1.74H12v3.32h5.37a4.6 4.6 0 0 1-2 3.01v2.16h3.24c1.9-1.75 2.74-4.33 2.74-6.75Z" />
              <path fill="#34A853" d="M12 21.7c2.7 0 4.98-.9 6.63-2.44l-3.24-2.16c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.23A10 10 0 0 0 12 21.7Z" />
              <path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.84H3.05A10 10 0 0 0 2 12c0 1.5.38 2.92 1.05 4.16l3.34-2.23Z" />
              <path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.88-2.89A9.67 9.67 0 0 0 12 1.94a10 10 0 0 0-8.95 5.9l3.34 2.23C7.18 7.7 9.39 5.94 12 5.94Z" />
            </svg>
            <span>Continue with Google</span>
          </a>
          <div className="login-note">
            <Icon name="shield" size={16} />
            <span>
              Use your existing Horizon administrator account. Access is
              verified on every request.
            </span>
          </div>
        </form>
        <span className="login-copyright">
          Horizon Internal · Platform intelligence
        </span>
      </section>
    </main>
  );
}
