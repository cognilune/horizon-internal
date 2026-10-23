"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="standalone">
      <div className="error-card">
        <span className="eyebrow">HORIZON INTERNAL</span>
        <h1>We couldn’t connect.</h1>
        <p>
          The data source is temporarily unavailable. Your data has not been
          changed.
        </p>
        <button className="button primary" onClick={reset}>
          Try again
        </button>
        <a className="button" href="/login">
          Back to sign in
        </a>
      </div>
    </main>
  );
}
