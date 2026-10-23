"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import { Empty, type DataRow } from "./Charts";
function useSearch(value: string) {
  const [rows, setRows] = useState<DataRow[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (value.length < 2) {
      setRows([]);
      setError("");
      return;
    }
    const abort = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      fetch(`/api/admin?view=search&q=${encodeURIComponent(value)}`, {
        signal: abort.signal,
      })
        .then(async (r) => {
          const b = await r.json();
          if (!r.ok) throw new Error(b.error);
          setRows(b.rows);
        })
        .catch((e) => {
          if (e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (!abort.signal.aborted) setBusy(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [value]);
  return { rows, busy, error };
}
export function GlobalSearch({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (resource: string, id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [q, setQ] = useState("");
  const { rows, busy, error } = useSearch(q);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="search-dialog"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
    >
      <div className="search-dialog-input">
        <Icon name="search" />
        <input
          autoFocus
          aria-label="Search all users, workspaces and projects"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search users, workspaces, projects…"
        />
        <button
          className="icon-button"
          aria-label="Close search"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="search-results">
        {error ? (
          <div className="error-banner">{error}</div>
        ) : busy ? (
          <p className="search-help">Searching Horizon…</p>
        ) : q.length < 2 ? (
          <p className="search-help">
            Search by name, email, or record ID. Enter at least two characters.
          </p>
        ) : rows.length ? (
          rows.map((r) => (
            <button
              key={String(r.kind) + r.id}
              onClick={() => onSelect(String(r.kind), String(r.id))}
            >
              <span className="search-kind">
                <Icon name={String(r.kind)} />
              </span>
              <span>
                <strong>{String(r.name)}</strong>
                <small>{String(r.description)}</small>
              </span>
              <span className="badge">{String(r.kind)}</span>
              <Icon name="chevron" size={16} />
            </button>
          ))
        ) : (
          <Empty
            title="No matching records"
            message="Try a different name, email, or ID."
          />
        )}
      </div>
      <div className="search-help search-bottom">
        <kbd>esc</kbd> to close{" "}
        <span>All platform records · Administrator access</span>
      </div>
    </dialog>
  );
}
export function EntityPicker({
  kind,
  value,
  onChange,
}: {
  kind: string;
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState(""),
    [open, setOpen] = useState(false);
  const { rows, busy, error } = useSearch(q);
  return (
    <div className="entity-picker">
      <div>
        <Icon name={kind} size={15} />
        <input
          aria-label={`Filter by ${kind}`}
          placeholder={value ? `${kind}: ${value}` : `All ${kind}`}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
        {value && (
          <button
            className="icon-button"
            aria-label={`Clear ${kind} filter`}
            onClick={() => {
              onChange("");
              setQ("");
            }}
          >
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
      {open && q.length >= 2 && (
        <div className="entity-results">
          {error ? (
            <p>{error}</p>
          ) : busy ? (
            <p>Searching…</p>
          ) : rows.filter((r) => r.kind === kind).length ? (
            rows
              .filter((r) => r.kind === kind)
              .map((r) => (
                <button
                  key={String(r.id)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(String(r.id));
                    setQ("");
                    setOpen(false);
                  }}
                >
                  <strong>{String(r.name)}</strong>
                  <small>{String(r.description)}</small>
                </button>
              ))
          ) : (
            <p>No matching {kind}</p>
          )}
        </div>
      )}
    </div>
  );
}
