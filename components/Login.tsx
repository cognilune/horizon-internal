"use client";
import { useState } from "react";
import { Icon, Logo } from "./Icon";
export default function Login() {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              required
              maxLength={200}
            />
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
