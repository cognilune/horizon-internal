"use client";
import { useEffect, useState } from "react";

type Row = {
  id: string;
  workspace: string;
  project: string;
  environment: "test" | "live";
  status: string;
  member_name: string;
  member_email: string;
  full_name?: string;
  business_name?: string;
  contact_email?: string;
  document_type?: string;
  submitted_at: string;
  slots: string[];
  details_error?: string;
};
type DetailRow = Row & {
  business_type: string;
  registered_address: string;
  phone: string;
  business_details: string;
  beneficiary: string;
  account_number: string;
  ifsc: string;
  document_number: string;
  consent: boolean;
};
const documents: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  gst: "GST",
};
const statuses: Record<string, string> = {
  saved: "Saved",
  pending: "Pending",
  approved: "Approved",
  review: "Under review",
  rejected: "Rejected",
  verified: "Verified",
  active: "Active",
  suspended: "Suspended",
};
const date = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function SensitiveValue({ value }: { value: string }) {
  const [visible, setVisible] = useState(false);
  const ending = value.slice(-4);
  return (
    <span className="kyc-sensitive">
      <span>{visible ? value : `••••••${ending}`}</span>
      <button
        type="button"
        className="kyc-reveal"
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? "Hide" : "Show"}
      </button>
    </span>
  );
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children || "—"}</dd>
    </div>
  );
}

function PayoutRecord({ row }: { row: Row }) {
  const [details, setDetails] = useState<DetailRow | null>();
  const [detailError, setDetailError] = useState("");
  async function loadDetails() {
    if (row.details_error || details !== undefined || detailError) return;
    setDetails(null);
    try {
      const response = await fetch("/api/kyc/" + encodeURIComponent(row.id), {
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Could not load payout details.");
      setDetails(body.submission);
    } catch (error) {
      setDetails(undefined);
      setDetailError(
        error instanceof Error ? error.message : "Could not load payout details.",
      );
    }
  }
  return (
    <li>
      <details
        className="kyc-record"
        onToggle={(event) => {
          if (event.currentTarget.open) void loadDetails();
        }}
      >
        <summary className="kyc-columns">
          <span className="kyc-person">
            <span className="kyc-avatar" aria-hidden="true">
              {(row.full_name || row.member_name || row.member_email || "U")
                .slice(0, 1)
                .toUpperCase()}
            </span>
            <span className="kyc-person-text">
              <strong>{row.full_name || row.member_name}</strong>
              <span>{row.contact_email || row.member_email}</span>
            </span>
          </span>
          <span className="kyc-business">
            <span className="kyc-mobile-label">Website</span>
            {row.project}
          </span>
          <span>
            <span className="kyc-mobile-label">Status</span>
            <span className={"kyc-status status-" + row.status}>
              {statuses[row.status] || row.status}
            </span>
          </span>
          <span className="kyc-date">
            <span className="kyc-mobile-label">Submitted</span>
            <time dateTime={row.submitted_at}>
              {date.format(new Date(row.submitted_at))}
            </time>
          </span>
          <span className="kyc-details-toggle">
            <span className="kyc-show">View details</span>
            <span className="kyc-hide">Hide details</span>
            <span className="kyc-chevron" aria-hidden="true">⌄</span>
          </span>
        </summary>
        <div className="kyc-details">
          {row.details_error || detailError ? (
            <p className="kyc-detail-error" role="alert">
              {row.details_error || detailError}
            </p>
          ) : details === undefined || details === null ? (
            <p className="kyc-details-loading" role="status">
              Loading payout details…
            </p>
          ) : (
            <>
              <section>
                <h3>Business and contact</h3>
                <dl>
                  <Detail label="Workspace">{details.workspace}</Detail>
                  <Detail label="Website">{details.project}</Detail>
                  <Detail label="Environment">
                    {details.environment === "live" ? "Live" : "Test"}
                  </Detail>
                  <Detail label="Full legal name">{details.full_name}</Detail>
                  <Detail label="Business name">{details.business_name}</Detail>
                  <Detail label="Business type">{details.business_type}</Detail>
                  <Detail label="Registered address">
                    {details.registered_address}
                  </Detail>
                  <Detail label="Indian mobile number">{details.phone}</Detail>
                  <Detail label="Contact email">{details.contact_email}</Detail>
                  <Detail label="Business activity">
                    {details.business_details}
                  </Detail>
                </dl>
              </section>
              <section>
                <h3>Bank and identity</h3>
                <dl>
                  <Detail label="Bank account holder">
                    {details.beneficiary}
                  </Detail>
                  <Detail label="Bank account number">
                    {details.account_number ? (
                      <SensitiveValue value={details.account_number} />
                    ) : (
                      "—"
                    )}
                  </Detail>
                  <Detail label="IFSC">{details.ifsc}</Detail>
                  <Detail label="Document type">
                    {documents[details.document_type || ""] ||
                      details.document_type}
                  </Detail>
                  <Detail label="Document number">
                    {details.document_number}
                  </Detail>
                  <Detail label="Payout consent">
                    {details.consent ? "Accepted" : "Not recorded"}
                  </Detail>
                </dl>
                <div className="kyc-documents">
                  <h3>Documents</h3>
                  <div className="kyc-document-links">
                    {details.slots.map((slot) => (
                      <a
                        key={slot}
                        className="button small"
                        href={"/api/kyc/" + details.id + "/" + slot}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {slot === "front"
                          ? "Aadhaar front"
                          : slot === "back"
                            ? "Aadhaar back"
                            : slot === "business"
                              ? "Business document"
                              : "Identity document"}
                        <span aria-hidden="true"> ↗</span>
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ))}
                    {!details.slots.length && (
                      <span className="kyc-muted">
                        No uploaded document for this document type.
                      </span>
                    )}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </details>
    </li>
  );
}

export function ReviewQueue() {
  const [page, setPage] = useState(0),
    [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [more, setMore] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    let loaded = false;
    setRows(null);
    setError("");
    setMore(false);

    async function load() {
      if (loading || controller.signal.aborted) return;
      loading = true;
      try {
        const res = await fetch("/api/kyc?page=" + page, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok)
          throw new Error(body.error || "Could not load payout submissions.");
        if (!controller.signal.aborted) {
          setRows(body.rows);
          setMore(body.more);
          setError("");
          loaded = true;
        }
      } catch (e) {
        if (!controller.signal.aborted && !loaded)
          setError(
            e instanceof Error
              ? e.message
              : "Could not load payout submissions.",
          );
      } finally {
        loading = false;
      }
    }

    const refresh = () => {
      if (document.visibilityState === "visible") void load();
    };
    void load();
    const timer = window.setInterval(refresh, 3000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [page, revision]);

  return (
    <section className="kyc-list" aria-labelledby="payout-submissions-heading">
      <div className="kyc-list-toolbar">
        <div className="kyc-list-title">
          <h2 id="payout-submissions-heading">KYC and payout submissions</h2>
          <span className="kyc-live">
            <span aria-hidden="true">●</span> Auto-updating
          </span>
        </div>
        <button
          className="button small"
          disabled={!rows && !error}
          onClick={() => setRevision((number) => number + 1)}
        >
          Refresh
        </button>
      </div>
      {error ? (
        <div className="kyc-empty" role="alert">
          <p>{error}</p>
          <button
            className="button small"
            onClick={() => setRevision((number) => number + 1)}
          >
            Try again
          </button>
        </div>
      ) : !rows ? (
        <div className="kyc-empty" role="status">
          Loading payout submissions…
        </div>
      ) : !rows.length ? (
        <div className="kyc-empty">
          <h3>No payout submissions {page ? "on this page" : "yet"}</h3>
          <p>
            Details saved through “Submit Your KYC” will appear here
            automatically.
          </p>
        </div>
      ) : (
        <>
          <div className="kyc-columns" aria-hidden="true">
            <span>User</span>
            <span>Website</span>
            <span>Status</span>
            <span>Submitted</span>
            <span />
          </div>
          <ul className="kyc-rows">
            {rows.map((row) => <PayoutRecord key={row.id} row={row} />)}
          </ul>
        </>
      )}
      {(page > 0 || more) && (
        <nav className="kyc-pagination" aria-label="KYC pages">
          <span>Page {page + 1}</span>
          <div>
            <button
              className="button small"
              disabled={!page || (!rows && !error)}
              onClick={() => setPage((number) => number - 1)}
            >
              Previous
            </button>
            <button
              className="button small"
              disabled={!more || !rows}
              onClick={() => setPage((number) => number + 1)}
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </section>
  );
}
