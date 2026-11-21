"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, Logo } from "./Icon";

export default function Login({ initialError = "" }: { initialError?: string }) {
  const [step, setStep] = useState<"email" | "otp">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const otpRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step !== "otp") return;
    otpRef.current?.focus();
    const update = () => setSeconds(Math.max(0, Math.ceil((resendAt - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendAt]);

  async function requestCode(requestedEmail: string) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: requestedEmail }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to send the code.");
      setEmail(body.email);
      setResendAt(new Date(body.resendAt).getTime());
      setStep("otp");
    } catch (reason) {
      setError((reason as Error).message || "Unable to send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitEmail(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode(String(new FormData(event.currentTarget).get("email") || ""));
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: data.get("otp") }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to verify the code.");
      window.location.assign("/overview");
    } catch (reason) {
      setError((reason as Error).message || "Unable to verify the code.");
      setBusy(false);
    }
  }

  return <main className="login-page">
    <section className="login-story">
      <a className="brand" href="/"><Logo /><span>horizon<span className="brand-label">INTERNAL</span></span></a>
      <div className="login-copy">
        <span className="eyebrow">A CLEARER VIEW OF YOUR PLATFORM</span>
        <h1>Every signal.<br />One horizon.</h1>
        <p>Your people, projects, and platform performance.<br />Connected in one thoughtful workspace.</p>
        <div className="login-graphic" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <div key={index} />)}</div>
      </div>
      <span className="login-footer"><Icon name="shield" size={16} /> A secure workspace for Horizon administrators</span>
    </section>
    <section className="login-form-wrap">
      <form className="login-form" onSubmit={step === "email" ? submitEmail : verifyCode}>
        <span className="login-icon"><Icon name="lock" size={25} /></span>
        <h2>{step === "email" ? "Welcome back" : "Check your email"}</h2>
        <p>{step === "email" ? "Enter your approved email to receive a one-time sign-in code." : <>We sent a six-digit code to <strong>{email}</strong>.</>}</p>
        {step === "email" ? <label>Email address<input key="email-input" name="email" type="email" autoComplete="email" placeholder="you@company.com" required maxLength={254} autoFocus /></label> : <label>Verification code<input key="otp-input" ref={otpRef} className="otp-input" name="otp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" placeholder="000000" required minLength={6} maxLength={6} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 6); }} /></label>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        <button className="button primary" disabled={busy}>{busy ? step === "email" ? "Sending code…" : "Verifying…" : step === "email" ? "Continue" : "Verify and sign in"}<Icon name="arrow" size={17} /></button>
        {step === "otp" && <div className="otp-actions">
          <button type="button" onClick={() => { setStep("email"); setError(""); setSeconds(0); }} disabled={busy}>Change email</button><span aria-hidden="true">·</span>
          <button type="button" onClick={() => void requestCode(email)} disabled={busy || seconds > 0}>{seconds > 0 ? `Resend in ${seconds}s` : "Resend code"}</button>
        </div>}
        <div className="login-divider" aria-hidden="true"><span>or</span></div>
        <a className="google-login-button" href="/api/auth/google/start"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.35 12.2c0-.7-.06-1.2-.2-1.74H12v3.32h5.37a4.6 4.6 0 0 1-2 3.01v2.16h3.24c1.9-1.75 2.74-4.33 2.74-6.75Z" /><path fill="#34A853" d="M12 21.7c2.7 0 4.98-.9 6.63-2.44l-3.24-2.16c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.23A10 10 0 0 0 12 21.7Z" /><path fill="#FBBC05" d="M6.39 13.93A6 6 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.84H3.05A10 10 0 0 0 2 12c0 1.5.38 2.92 1.05 4.16l3.34-2.23Z" /><path fill="#EA4335" d="M12 5.94c1.47 0 2.78.5 3.82 1.5l2.88-2.89A9.67 9.67 0 0 0 12 1.94a10 10 0 0 0-8.95 5.9l3.34 2.23C7.18 7.7 9.39 5.94 12 5.94Z" /></svg><span>Continue with Google</span></a>
        <div className="login-note"><Icon name="shield" size={16} /><span>Only active users approved in Horizon Internal can sign in. Access is verified on every request.</span></div>
      </form>
      <span className="login-copyright">Horizon Internal · Platform intelligence</span>
    </section>
  </main>;
}
