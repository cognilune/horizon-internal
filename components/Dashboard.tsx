"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon, Logo } from "./Icon";
import {
  Metric,
  LineChart,
  PlanChart,
  Breakdown,
  Empty,
  number,
  money,
  date,
  change,
  type DataRow,
} from "./Charts";
import DataTable from "./DataTable";
import DetailDrawer from "./DetailDrawer";
import InternalUsers from "./InternalUsers";
import { GlobalSearch, EntityPicker } from "./Search";
import { catalog, limitations, planLabel, statusOptions } from "@/lib/catalog";

const navigation = [
  {
    id: "overview",
    label: "Overview",
    description: "A clear view of everything happening across your platform.",
  },
  {
    id: "users",
    label: "Users",
    description: "Understand your people, their activity, and their journey.",
  },
  {
    id: "internal-users",
    label: "Internal users",
    description: "Approve and manage the people who can access Horizon Internal.",
  },
  {
    id: "plans",
    label: "Plans & subscriptions",
    description:
      "Current entitlements, verified purchases, and plan performance.",
  },
  {
    id: "workspaces",
    label: "Workspaces",
    description: "The spaces where your customers bring their ideas together.",
  },
  {
    id: "projects",
    label: "Projects",
    description: "Every project, every workspace, all in one place.",
  },
  {
    id: "credits",
    label: "Credits & usage",
    description:
      "Follow every recorded credit, from your platform to an operation.",
  },
  {
    id: "payments",
    label: "Payments & revenue",
    description: "A reliable view of verified receipts and payment activity.",
  },
  {
    id: "analytics",
    label: "Analytics & reports",
    description: "Turn platform activity into a clearer perspective.",
  },
  {
    id: "settings",
    label: "Settings",
    description:
      "Your administration workspace, data connections, and reporting rules.",
  },
];
type Payload = {
  asOf: string;
  summary: Record<string, number | null>;
  series: DataRow[];
  plans: DataRow[];
  purchases: DataRow[];
  revenueByPlan: DataRow[];
  breakdowns: Record<string, DataRow[]>;
  notifications: { title: string; detail: string; section: string }[];
  configuration?: Record<string, unknown>;
};
const periods = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "custom", label: "Custom range" },
];

const visiblePlanNames = new Map([
  ["workspace:free", "Free"],
  ["workspace:pro", "Plus"],
  ["workspace:business", "Pro"],
]);
const visiblePlans = catalog
  .filter((plan) => visiblePlanNames.has(plan.key))
  .map((plan) => ({ ...plan, name: visiblePlanNames.get(plan.key)! }));

function PeriodPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = periods.find((period) => period.value === value) || periods[2];
  return (
    <div
      className="period-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="period-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="period-picker-menu" role="listbox" aria-label="Reporting period">
          <strong>Reporting period</strong>
          {periods.map((period) => (
            <button
              type="button"
              role="option"
              aria-selected={value === period.value}
              className={value === period.value ? "selected" : ""}
              key={period.value}
              onClick={() => {
                onChange(period.value);
                setOpen(false);
              }}
            >
              <span>{period.label}</span>
              {value === period.value && <i aria-hidden="true">✓</i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  description,
  children,
  action,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function PlanPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = visiblePlans.find((plan) => plan.key === value);
  return (
    <div
      className="plan-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="plan-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected ? selected.name : "All plans"}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open && (
        <div className="plan-picker-menu" role="listbox" aria-label="Filter by plan">
          <button
            type="button"
            role="option"
            aria-selected={!value}
            className={!value ? "selected" : ""}
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            <span>All plans</span>
            {!value && <i aria-hidden="true">✓</i>}
          </button>
          <div className="plan-picker-group" role="group" aria-label="Plans">
            <strong>Plans</strong>
            {visiblePlans.map((plan) => (
              <button
                type="button"
                role="option"
                aria-selected={value === plan.key}
                className={value === plan.key ? "selected" : ""}
                key={plan.key}
                onClick={() => {
                  onChange(plan.key);
                  setOpen(false);
                }}
              >
                <span>{plan.name}</span>
                {value === plan.key && <i aria-hidden="true">✓</i>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusPicker({
  value,
  options,
  allLabel,
  heading = "Status",
  ariaLabel = "Filter by status",
  labels = {},
  onChange,
}: {
  value: string;
  options: string[];
  allLabel: string;
  heading?: string;
  ariaLabel?: string;
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = (option: string) =>
    option
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  return (
    <div
      className="status-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="status-picker-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value ? labels[value] || label(value) : allLabel}</span>
        <Icon name="chevron" size={15} />
      </button>
      {open && (
        <div className="status-picker-menu" role="listbox" aria-label={ariaLabel}>
          <strong>{heading}</strong>
          {[{ value: "", label: allLabel }, ...options.map((option) => ({ value: option, label: labels[option] || label(option) }))].map(
            (option) => (
              <button
                type="button"
                role="option"
                aria-selected={value === option.value}
                className={value === option.value ? "selected" : ""}
                key={option.value || "all"}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {value === option.value && <i aria-hidden="true">✓</i>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

function ChartIntervalPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: "day", label: "Today" },
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
  ];
  const selected = options.find((option) => option.value === value) || options[0];
  return (
    <div
      className="chart-interval-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="chart-interval-trigger"
        aria-label="Chart interval"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <Icon name="down" size={14} />
      </button>
      {open && (
        <div className="chart-interval-menu" role="listbox" aria-label="Chart interval">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={value === option.value}
              className={value === option.value ? "selected" : ""}
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              <span>{option.label}</span>
              {value === option.value && <i aria-hidden="true">✓</i>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard({
  section,
  admin,
}: {
  section: string;
  admin: { name: string; email: string };
}) {
  const router = useRouter(),
    searchParams = useSearchParams(),
    params = searchParams.toString(),
    p = new URLSearchParams(params);
  const [data, setData] = useState<Payload | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [refresh, setRefresh] = useState(0),
    [autoRefresh, setAutoRefresh] = useState(true);
  const [mobile, setMobile] = useState(false),
    [globalSearch, setGlobalSearch] = useState(false),
    [notifications, setNotifications] = useState(false),
    [profile, setProfile] = useState(false),
    [addInternalUser, setAddInternalUser] = useState(false),
    [confirmLogout, setConfirmLogout] = useState(false),
    [signingOut, setSigningOut] = useState(false),
    [detail, setDetail] = useState<{ resource: string; id: string } | null>(
      null,
    );
  const [metric, setMetric] = useState(
      section === "payments"
        ? "revenue"
        : section === "credits"
          ? "credits"
          : "users",
    ),
    [creditTab, setCreditTab] = useState("credits"),
    [workspaceTab, setWorkspaceTab] = useState("workspaces");
  const [customStart, setCustomStart] = useState(p.get("start") || ""),
    [customEnd, setCustomEnd] = useState(p.get("end") || ""),
    [custom, setCustom] = useState(false),
    [rangeError, setRangeError] = useState("");
  const [query, setQuery] = useState(p.get("q") || "");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const current = navigation.find((n) => n.id === section)!;
  const reportParams = new URLSearchParams(
    [...p].filter(
      ([key]) =>
        ![
          "q",
          "status",
          "activity",
          "allDates",
          "page",
          "pageSize",
          "sort",
          "direction",
        ].includes(key),
    ),
  ).toString();
  const setParams = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) =>
      v ? next.set(k, v) : next.delete(k),
    );
    next.delete("page");
    router.replace(`/${section}?${next}`, { scroll: false });
  };
  const navigate = (next: string, key?: string, id?: string) => {
    const f = new URLSearchParams(params);
    [
      "q",
      "status",
      "activity",
      "allDates",
      "user",
      "workspace",
      "project",
    ].forEach((k) => f.delete(k));
    if (key && id) f.set(key, id);
    if (key) f.set("allDates", "true");
    setDetail(null);
    setNotifications(false);
    router.push(`/${next}?${f}`);
  };
  const open = (resource: string, id: string) => {
    setGlobalSearch(false);
    setDetail({ resource, id });
  };
  useEffect(() => {
    setAutoRefresh(localStorage.getItem("horizon-auto-refresh") !== "false");
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setGlobalSearch((v) => !v);
      }
      if (event.key === "Escape") {
        setMobile(false);
        setNotifications(false);
        setProfile(false);
        setAddInternalUser(false);
        setConfirmLogout(false);
      }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") setRefresh((v) => v + 1);
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefresh]);
  useEffect(() => {
    if (!profile) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfile(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [profile]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const f = new URLSearchParams(reportParams);
    f.set("view", section === "settings" ? "settings" : "overview");
    fetch(`/api/admin?${f}`, { signal: controller.signal })
      .then(async (res) => {
        const b = await res.json();
        if (res.status === 401 || res.status === 403) {
          router.replace("/login");
          return;
        }
        if (!res.ok) throw new Error(b.error);
        setData(b);
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [reportParams, refresh, section, router]);
  useEffect(
    () => () => {
      if (queryTimer.current) clearTimeout(queryTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (queryTimer.current) clearTimeout(queryTimer.current);
    const currentParams = new URLSearchParams(params);
    setQuery(currentParams.get("q") || "");
    setCustomStart(currentParams.get("start") || "");
    setCustomEnd(currentParams.get("end") || "");
  }, [params]);
  const s = data?.summary || {},
    granularity = p.get("granularity") || "day",
    period = p.get("period") || "30d";
  const chartActions = (
    <ChartIntervalPicker
      value={granularity}
      onChange={(value) => setParams({ granularity: value })}
    />
  );
  const tableResource =
    section === "credits"
      ? creditTab
      : section === "workspaces"
        ? workspaceTab
        : section;
  const tableParams = new URLSearchParams(params);
  tableParams.delete("page");
  if (!tableParams.has("allDates")) tableParams.set("allDates", "true");
  const showStock = (key: string) =>
    new URLSearchParams({
      ...Object.fromEntries(tableParams),
      allDates: "true",
      ...(key ? { status: key } : {}),
    }).toString();
  const metricCards = (
    items: {
      label: string;
      key: string;
      icon?: string;
      currency?: boolean;
      note?: string;
      previous?: string;
      target?: string;
      accent?: boolean;
    }[],
  ) => (
    <div className="metric-grid">
      {items.map((i) => (
        <Metric
          key={i.label}
          label={i.label}
          value={
            i.currency ? money(s[i.key]) : number(s[i.key], i.currency ? 0 : 1)
          }
          icon={i.icon}
          accent={i.accent}
          note={i.note}
          delta={i.previous ? change(s[i.key], s[i.previous]) : undefined}
          onClick={i.target ? () => navigate(i.target!) : undefined}
        />
      ))}
    </div>
  );
  const dimension = "project";
  const periodNote = "Selected reporting period",
    currentNote = "Current snapshot";
  const breakdownPanel = (
    <Panel
      title="Where credits go"
      description="Top 5 projects · selected period"
    >
      <Breakdown
        rows={(data?.breakdowns?.[dimension] || []).slice(0, 5)}
        dimension={dimension}
        onSelect={(id) => navigate("credits", "project", id)}
      />
    </Panel>
  );
  const trend = (field: string, title: string, color?: string) => (
    <Panel
      title={title}
      description="Recorded activity · reporting timezone UTC"
      action={chartActions}
    >
      <LineChart
        rows={data?.series || []}
        field={field}
        label={title}
        color={color}
        currency={field === "revenue"}
      />
    </Panel>
  );
  async function logout() {
    setError("");
    setSigningOut(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error((await res.json()).error);
      window.location.assign("/login");
    } catch (e) {
      setError((e as Error).message);
      setConfirmLogout(false);
      setSigningOut(false);
    }
  }
  function requestLogout() {
    setProfile(false);
    setNotifications(false);
    setConfirmLogout(true);
  }
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {mobile && (
        <button
          className="mobile-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        id="navigation-sidebar"
        className={`sidebar ${mobile ? "is-open" : ""}`}
      >
        <button
          className="icon-button sidebar-close"
          aria-label="Close sidebar"
          onClick={() => setMobile(false)}
        >
          <Icon name="close" size={18} />
        </button>
        <Link href="/overview" className="brand">
          <Logo />
          <span>
            horizon<span className="brand-label">INTERNAL</span>
          </span>
        </Link>
        <div className="sidebar-scroll">
          <span className="nav-label">WORKSPACE</span>
          <nav aria-label="Main navigation">
          {navigation.filter((n) => n.id !== "settings").map((n) => (
            <Link
              key={n.id}
              href={`/${n.id}?${new URLSearchParams([...p].filter(([k]) => !["q", "status", "activity", "allDates"].includes(k)))}`}
              className={section === n.id ? "active" : ""}
              aria-current={section === n.id ? "page" : undefined}
              onClick={() => setMobile(false)}
            >
              <Icon name={n.id} />
              <span>{n.label}</span>
              {section === n.id && <i />}
            </Link>
          ))}
          </nav>
          <div className="sidebar-bottom">
          <span className="nav-label">PREFERENCES</span>
          <nav>
            <Link
              href="/settings"
              className={section === "settings" ? "active" : ""}
            >
              <Icon name="settings" />
              <span>Settings</span>
            </Link>
          </nav>
          <div className="secure-card">
            <span className="secure-icon">
              <Icon name="shield" size={18} />
            </span>
            <strong>A trusted view</strong>
            <p>
              Read-only insights. Verified sources. Your platform, protected.
            </p>
            <Link href="/settings">
              Data & access details <Icon name="arrow" size={13} />
            </Link>
          </div>
          <div className="sidebar-user">
            <span className="avatar purple">
              {admin.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{admin.name}</strong>
              <small>Administrator</small>
            </span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={requestLogout}
            >
              <Icon name="logout" size={17} />
            </button>
          </div>
          </div>
        </div>
      </aside>
      <div className="app-main" inert={mobile}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobile}
              aria-controls="navigation-sidebar"
              onClick={() => setMobile(true)}
            >
              <Icon name="menu" />
            </button>
            <span className="breadcrumb">
              Workspace <Icon name="chevron" size={12} />{" "}
              <strong>{current.label}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <div className="popover-wrap">
              <button
                className="icon-button notification-button"
                aria-label="Notifications"
                aria-expanded={notifications}
                onClick={() => {
                  setNotifications(!notifications);
                  setProfile(false);
                }}
              >
                <Icon name="bell" size={20} />
                {!!data?.notifications?.length && <i />}
              </button>
              {notifications && (
                <div className="popover notifications">
                  <div className="popover-heading">
                    <strong>Notifications</strong>
                    <button
                      className="icon-button"
                      aria-label="Close notifications"
                      onClick={() => setNotifications(false)}
                    >
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  {data?.notifications?.length ? (
                    data.notifications.map((n, i) => (
                      <button key={i} onClick={() => navigate(n.section)}>
                        <strong>{n.title}</strong>
                        <span>{n.detail}</span>
                      </button>
                    ))
                  ) : (
                    <p>No payment alerts in this reporting period.</p>
                  )}
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="popover-wrap" ref={profileRef}>
              <button
                className="profile-button"
                aria-label="Administrator profile"
                aria-expanded={profile}
                onClick={() => {
                  setProfile(!profile);
                  setNotifications(false);
                }}
              >
                <span className="avatar purple">
                  {admin.name
                    .split(" ")
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <Icon name="down" size={13} />
              </button>
              {profile && (
                <div className="popover profile-popover">
                  <strong>{admin.name}</strong>
                  <p>{admin.email}</p>
                  <Link href="/settings">
                    <Icon name="settings" size={16} /> Workspace preferences
                  </Link>
                  <button onClick={requestLogout}>
                    <Icon name="logout" size={16} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main id="main" className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">HORIZON / PLATFORM INTELLIGENCE</div>
              <h1>
                {current.label}
                {section === "overview" && <span className="heading-dot" />}
              </h1>
              <p>{current.description}</p>
            </div>
            <div className={`page-actions ${section === "internal-users" ? "internal-users-page-actions" : ""}`}>
              {section === "internal-users" && (
                <button
                  type="button"
                  className="button primary"
                  onClick={() => setAddInternalUser(true)}
                >
                  <Icon name="internal-users" size={16} /> Add user
                </button>
              )}
              {!["settings", "internal-users"].includes(section) && (
                <>
                  <button
                    className={`button icon-only ${loading ? "refreshing" : ""}`}
                    aria-label="Refresh analytics"
                    onClick={() => setRefresh((v) => v + 1)}
                    disabled={loading}
                  >
                    <Icon name="refresh" size={16} />
                  </button>
                  <div className="date-control">
                    <Icon name="calendar" size={16} />
                    <PeriodPicker
                      value={period}
                      onChange={(value) => {
                        if (value === "custom") setCustom(true);
                        else {
                          setCustom(false);
                          setParams({
                            period: value,
                            start: "",
                            end: "",
                          });
                        }
                      }}
                    />
                    {period === "custom" && (
                      <button
                        className="icon-button"
                        aria-label="Edit custom range"
                        onClick={() => setCustom(!custom)}
                      >
                        <Icon name="settings" size={14} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          {custom && (
            <form
              className="custom-range panel"
              onSubmit={(e) => {
                e.preventDefault();
                if (!customStart || !customEnd || customStart > customEnd) {
                  setRangeError("Choose a valid start and end date.");
                  return;
                }
                setRangeError("");
                setParams({
                  period: "custom",
                  start: customStart,
                  end: customEnd,
                });
                setCustom(false);
              }}
            >
              <label>
                Start date (UTC)
                <input
                  type="date"
                  value={customStart}
                  required
                  onChange={(e) => setCustomStart(e.target.value)}
                />
              </label>
              <label>
                End date (UTC)
                <input
                  type="date"
                  value={customEnd}
                  required
                  min={customStart}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </label>
              <button className="button primary">Apply range</button>
              <button
                className="button"
                type="button"
                onClick={() => setCustom(false)}
              >
                Cancel
              </button>
              {rangeError && <span role="alert">{rangeError}</span>}
            </form>
          )}
          {!["settings", "internal-users"].includes(section) && (
            <>
              <div className="context-line">
                <span className={`live-dot ${error ? "offline" : ""}`} />
                <span>
                  {loading
                    ? "Updating analytics…"
                    : error
                      ? "Data source unavailable"
                      : `Updated ${new Date(data?.asOf || Date.now()).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`}
                </span>
                <span className="context-divider">/</span>
                <span>Report dates in UTC</span>
                <span className="context-right">
                  <Icon name="shield" size={13} /> Read-only access
                </span>
              </div>
              <div className="filter-bar">
                <PlanPicker
                  value={p.get("plan") || ""}
                  onChange={(plan) => setParams({ plan })}
                />
                <EntityPicker
                  kind="users"
                  value={p.get("user") || ""}
                  onChange={(id) => setParams({ user: id })}
                />
                {section !== "users" && (
                  <EntityPicker
                    kind="workspaces"
                    value={p.get("workspace") || ""}
                    onChange={(id) => setParams({ workspace: id })}
                  />
                )}{" "}
                {["credits", "projects", "analytics"].includes(section) && (
                  <EntityPicker
                    kind="projects"
                    value={p.get("project") || ""}
                    onChange={(id) => setParams({ project: id })}
                  />
                )}{" "}
                {[
                  "plan",
                  "user",
                  "workspace",
                  "project",
                  "q",
                  "status",
                  "activity",
                ].some((k) => p.has(k)) && (
                  <button
                    className="text-button clear-filters"
                    onClick={() => {
                      setQuery("");
                      setParams({
                        plan: "",
                        user: "",
                        workspace: "",
                        project: "",
                        q: "",
                        status: "",
                        activity: "",
                      });
                    }}
                  >
                    Clear filters <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            </>
          )}
          {error && (
            <div className="error-banner large" role="alert">
              <Icon name="info" />
              <div>
                <strong>Analytics couldn’t be loaded</strong>
                <p>{error}</p>
              </div>
              <button
                className="button"
                onClick={() => setRefresh((v) => v + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {loading && !data ? (
            <div
              className={`dashboard-skeleton dashboard-skeleton-${section}`}
              role="status"
              aria-label="Loading dashboard"
            >
              {section === "overview" ? (
                <>
                  <div className="metric-grid" aria-hidden="true">
                    {[1, 2, 3, 4].map((i) => (
                      <div className="skeleton-metric" key={i}>
                        <span className="skeleton-line label" />
                        <span className="skeleton-icon" />
                        <span className="skeleton-line value" />
                        <span className="skeleton-line note" />
                      </div>
                    ))}
                  </div>
                  <div className="skeleton-overview-grid" aria-hidden="true">
                    <div className="skeleton-panel skeleton-chart">
                      <span className="skeleton-line title" />
                      <span className="skeleton-line subtitle" />
                      <div className="skeleton-plot" />
                    </div>
                    <div className="skeleton-panel skeleton-chart">
                      <span className="skeleton-line title" />
                      <span className="skeleton-line subtitle" />
                      <div className="skeleton-donut" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="skeleton-panel skeleton-table" aria-hidden="true">
                  <div className="skeleton-table-heading">
                    <span className="skeleton-line title" />
                    <span className="skeleton-line action" />
                  </div>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div className="skeleton-table-row" key={i}>
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                  ))}
                </div>
              )}
              <span className="sr-only">Loading the latest Horizon data…</span>
            </div>
          ) : (
            data && (
              <div
                className={
                  loading ? "dashboard-content updating" : "dashboard-content"
                }
              >
                {section === "overview" && (
                  <>
                    {metricCards([
                      {
                        label: "Registered customers",
                        key: "users",
                        icon: "users",
                        note: currentNote,
                        target: "users",
                      },
                      {
                        label: "Credits consumed",
                        key: "credits",
                        icon: "credits",
                        note: "vs. previous equal period",
                        previous: "previous_credits",
                        target: "credits",
                        accent: true,
                      },
                      {
                        label: "Gross payments received",
                        key: "gross",
                        icon: "payments",
                        currency: true,
                        previous: "previous_gross",
                        note: "Verified receipts · selected period",
                        target: "payments",
                      },
                      {
                        label: "Total projects created",
                        key: "projects_created",
                        icon: "projects",
                        note: `${number(s.new_projects)} created in this period`,
                        target: "projects",
                      },
                    ])}
                    <div className="charts-grid">
                      <Panel
                        title={
                          metric === "users"
                            ? "User growth"
                            : metric === "credits"
                              ? "Credit consumption"
                              : "Revenue trends"
                        }
                        description="A little perspective on your platform’s progress"
                        action={chartActions}
                      >
                        <div className="chart-toolbar">
                          <div className="tabs compact">
                            {["users", "credits", "revenue"].map((m) => (
                              <button
                                key={m}
                                className={metric === m ? "selected" : ""}
                                onClick={() => setMetric(m)}
                              >
                                {m === "users"
                                  ? "New users"
                                  : m === "credits"
                                    ? "Credits"
                                    : "Gross revenue"}
                              </button>
                            ))}
                          </div>
                        </div>
                        <LineChart
                          rows={data.series}
                          field={metric}
                          label={
                            metric === "users"
                              ? "New users"
                              : metric === "credits"
                                ? "Credits"
                                : "Gross revenue"
                          }
                          currency={metric === "revenue"}
                        />
                      </Panel>
                      <Panel
                        title="Plan distribution"
                        description="Current workspace & legacy account entitlements"
                        action={
                          <button
                            className="icon-button"
                            aria-label="Open plan analytics"
                            onClick={() => navigate("plans")}
                          >
                            <Icon name="arrow" size={16} />
                          </button>
                        }
                      >
                        <PlanChart
                          plans={data.plans}
                          onSelect={(id) => navigate("plans", "plan", id)}
                        />
                      </Panel>
                    </div>
                    <div className="snapshot-strip">
                      {[
                        {
                          label: "Workspaces created · all time",
                          key: "workspaces_created",
                          icon: "workspaces",
                        },
                        {
                          label: "Active users in period",
                          key: "active_users",
                          icon: "users",
                        },
                        {
                          label: "Active paid entitlements",
                          key: "active_subscriptions",
                          icon: "plans",
                        },
                        {
                          label: "Invitations sent · all time",
                          key: "invitations",
                          icon: "mail",
                        },
                      ].map((m) => (
                        <div key={m.key}>
                          <Icon name={m.icon} />
                          <span>
                            <small>{m.label}</small>
                            <strong>{number(s[m.key])}</strong>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="lower-grid">
                      <DataTable
                        resource="users"
                        title="Recently registered users"
                        params={tableParams.toString()}
                        onOpen={open}
                        refresh={refresh}
                        compact
                      />
                      {breakdownPanel}
                    </div>
                    <div className="metric-grid subtle-metrics">
                      <Metric
                        label="Available credits now"
                        value={number(s.remaining)}
                        icon="credits"
                        note="Current wallets; not a historical balance"
                      />
                      <Metric
                        label="No active paid entitlement"
                        value={number(s.free_or_expired_users)}
                        icon="users"
                        note="Includes free, expired, and inactive accounts"
                      />
                      <Metric
                        label="Monthly recurring revenue"
                        value="—"
                        icon="payments"
                        note="Automatic renewal data unavailable"
                      />
                      <Metric
                        label="Lifetime credits allocated"
                        value="—"
                        icon="credits"
                        note="Complete allocation ledger unavailable"
                      />
                    </div>
                  </>
                )}
                {section === "users" && (
                  <>
                    {metricCards([
                      {
                        label: "Registered customers",
                        key: "users",
                        icon: "users",
                        note: currentNote,
                      },
                      {
                        label: "Active in period",
                        key: "active_users",
                        icon: "trend",
                        note: "Latest session or login in this period",
                      },
                      {
                        label: "New registrations",
                        key: "new_users",
                        icon: "users",
                        previous: "previous_users",
                        note: "vs. previous equal period",
                      },
                      {
                        label: "Active paying owners",
                        key: "paying_customers",
                        icon: "plans",
                        note: "Distinct owners of active paid entitlements",
                      },
                    ])}
                  </>
                )}
                {section === "plans" && (
                  <>
                    {metricCards([
                      {
                        label: "Active paid entitlements",
                        key: "active_subscriptions",
                        icon: "plans",
                        note: currentNote,
                      },
                      {
                        label: "Active paying owners",
                        key: "paying_customers",
                        icon: "users",
                        note: "Distinct owners · current snapshot",
                      },
                      {
                        label: "Verified lifetime receipts",
                        key: "lifetime_gross",
                        icon: "payments",
                        currency: true,
                        note: "Confirmed customer and workspace payments",
                      },
                      {
                        label: "MRR",
                        key: "mrr",
                        icon: "analytics",
                        note: "Recurring collection not confirmed",
                      },
                    ])}
                    <div className="plan-cards">
                      {visiblePlans
                        .filter(
                          (c) => !p.get("plan") || c.key === p.get("plan"),
                        )
                        .map((plan) => {
                          const counts = data.plans.find(
                              (r) => r.key === plan.key,
                            ),
                            purchases = data.purchases.find(
                              (r) => r.key === plan.key,
                            );
                          return (
                            <article
                              className={`panel plan-card ${plan.key === "workspace:pro" ? "featured-plan" : ""}`}
                              key={plan.key}
                            >
                              <div className="plan-card-top">
                                <span className="plan-symbol">
                                  <Icon name="plans" />
                                </span>
                                <span className="badge">Horizon plan</span>
                              </div>
                              <h2>{plan.name}</h2>
                              <p className="plan-price">
                                {plan.monthly === null
                                  ? "Custom"
                                  : money(plan.monthly)}
                                <small>
                                  {plan.monthly !== null ? " / month" : ""}
                                </small>
                              </p>
                              <p className="plan-annual">
                                {plan.yearly === null
                                  ? "Custom billing agreement"
                                  : `${money(plan.yearly)} billed yearly`}
                              </p>
                              <div className="plan-quota">
                                <Icon name="credits" size={15} />
                                {plan.credits === null
                                  ? "Custom allowance"
                                  : `${number(plan.credits)} plan credits + ${number(plan.daily)} daily`}
                              </div>
                              <dl className="plan-stats">
                                {[
                                  ["Current owners", counts?.users || 0],
                                  [
                                    "Selected entitlements",
                                    counts?.selected || 0,
                                  ],
                                  ["Active paid", counts?.active || 0],
                                  ["Inactive", counts?.inactive || 0],
                                  ["Expired", counts?.expired || 0],
                                  [
                                    "Pending entitlements",
                                    counts?.pending || 0,
                                  ],
                                  ["New in period", counts?.new || 0],
                                  [
                                    "Ever purchased · owners",
                                    purchases?.ever_purchased || 0,
                                  ],
                                  [
                                    "Pending orders",
                                    purchases?.pending_orders || 0,
                                  ],
                                ].map(([label, v]) => (
                                  <div key={String(label)}>
                                    <dt>{String(label)}</dt>
                                    <dd>{number(v)}</dd>
                                  </div>
                                ))}
                              </dl>
                              <div className="plan-revenue">
                                <span>Verified lifetime gross</span>
                                <strong>{money(purchases?.gross || 0)}</strong>
                              </div>
                              <button
                                className="button"
                                onClick={() =>
                                  setParams({
                                    plan: plan.key,
                                    allDates: "true",
                                  })
                                }
                              >
                                Explore plan
                                <Icon name="chevron" size={15} />
                              </button>
                            </article>
                          );
                        })}
                    </div>
                    <p className="data-note">
                      Prices come from the existing Horizon configuration, not
                      revenue estimates. Cancellation history is unavailable.
                    </p>
                    <DataTable
                      resource="subscriptions"
                      params={showStock("")}
                      onOpen={open}
                      refresh={refresh}
                      title="Current subscription records"
                    />
                  </>
                )}
                {section === "workspaces" && (
                  <>
                    {metricCards([
                      {
                        label: "Total workspaces",
                        key: "workspaces",
                        icon: "workspaces",
                        note: currentNote,
                      },
                      {
                        label: "Created in period",
                        key: "new_workspaces",
                        icon: "trend",
                        note: periodNote,
                      },
                      {
                        label: "Invitations sent",
                        key: "new_invitations",
                        icon: "mail",
                        note: periodNote,
                      },
                      {
                        label: "Accepted invitations",
                        key: "accepted_invitations",
                        icon: "check",
                        note: `${Number(s.new_invitations) > 0 ? number((Number(s.accepted_invitations) / Number(s.new_invitations)) * 100) + "%" : "—"} acceptance of period’s invitations`,
                      },
                    ])}
                    <div className="charts-grid">
                      <Panel
                        title="Workspace growth"
                        description={`Average ${Number(s.workspace_owners) > 0 ? number(Number(s.workspaces) / Number(s.workspace_owners)) : "—"} current workspaces per owner`}
                        action={chartActions}
                      >
                        <LineChart
                          rows={data.series}
                          field="workspaces"
                          label="Workspaces"
                        />
                      </Panel>
                      <Panel
                        title="Invitation activity"
                        description="Invitations sent during the selected period"
                      >
                        <LineChart
                          rows={data.series}
                          field="invitations"
                          label="Invitations"
                          color="#6cad9e"
                        />
                      </Panel>
                    </div>
                    <div className="tabs">
                      <button
                        className={
                          workspaceTab === "workspaces" ? "selected" : ""
                        }
                        onClick={() => {
                          setWorkspaceTab("workspaces");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Workspaces
                      </button>
                      <button
                        className={
                          workspaceTab === "invitations" ? "selected" : ""
                        }
                        onClick={() => {
                          setWorkspaceTab("invitations");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Invitations
                      </button>
                      <button
                        className={workspaceTab === "members" ? "selected" : ""}
                        onClick={() => {
                          setWorkspaceTab("members");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Memberships
                      </button>
                    </div>
                  </>
                )}
                {section === "projects" && (
                  <>
                    {metricCards([
                      {
                        label: "Total current projects",
                        key: "projects",
                        icon: "projects",
                        note: "Excludes soft-deleted projects",
                      },
                      {
                        label: "New projects",
                        key: "new_projects",
                        icon: "trend",
                        note: periodNote,
                      },
                      {
                        label: "Credits consumed",
                        key: "credits",
                        icon: "credits",
                        note: periodNote,
                      },
                      {
                        label: "Recorded operations",
                        key: "operations",
                        icon: "analytics",
                        note: "Usage ledger and committed reservations",
                      },
                    ])}
                    <div className="charts-grid">
                      {trend("projects", "Project creation")}
                      {breakdownPanel}
                    </div>
                  </>
                )}
                {section === "credits" && (
                  <>
                    {metricCards([
                      {
                        label: "Credits consumed",
                        key: "credits",
                        icon: "credits",
                        note: "vs. previous equal period",
                        previous: "previous_credits",
                        accent: true,
                      },
                      {
                        label: "Available balance now",
                        key: "remaining",
                        icon: "credits",
                        note: "Current deduplicated wallets",
                      },
                      {
                        label: "Recorded operations",
                        key: "operations",
                        icon: "analytics",
                        note: periodNote,
                      },
                      {
                        label: "Lifetime allocations",
                        key: "allocated",
                        icon: "plans",
                        note: "Allocation ledger unavailable",
                      },
                    ])}
                    <div className="charts-grid">
                      {trend("credits", "Credit consumption")}
                      {breakdownPanel}
                    </div>
                    <div className="info-banner">
                      <Icon name="info" size={18} />
                      <span>
                        Workspace wallets take precedence over legacy account
                        wallets. Plan and operation breakdowns use the current
                        plan. Historical balance, full allocation totals, and
                        lifetime usage percentages are unavailable.
                      </span>
                    </div>
                    <div className="tabs">
                      <button
                        className={creditTab === "credits" ? "selected" : ""}
                        onClick={() => {
                          setCreditTab("credits");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Operation ledger
                      </button>
                      <button
                        className={creditTab === "users" ? "selected" : ""}
                        onClick={() => {
                          setCreditTab("users");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Balances by owner
                      </button>
                      <button
                        className={
                          creditTab === "subscriptions" ? "selected" : ""
                        }
                        onClick={() => {
                          setCreditTab("subscriptions");
                          setParams({ status: "", q: "" });
                          setQuery("");
                        }}
                      >
                        Allocation sources & expiry
                      </button>
                    </div>
                  </>
                )}
                {section === "payments" && (
                  <>
                    {metricCards([
                      {
                        label: "Gross receipts",
                        key: "gross",
                        currency: true,
                        icon: "payments",
                        previous: "previous_gross",
                        note: "Confirmed receipts · selected period",
                        accent: true,
                      },
                      {
                        label: "Received this month",
                        key: "month_gross",
                        currency: true,
                        icon: "calendar",
                        note: "Current calendar month · UTC",
                      },
                      {
                        label: "Received today",
                        key: "today_gross",
                        currency: true,
                        icon: "clock",
                        note: "Current day · UTC",
                      },
                      {
                        label: "Active paying owners",
                        key: "paying_customers",
                        icon: "users",
                        note: currentNote,
                      },
                    ])}
                    <div className="payment-status-strip">
                      {[
                        {
                          k: "successful",
                          label: "Successful",
                          color: "green",
                        },
                        { k: "failed", label: "Failed", color: "red" },
                        { k: "pending", label: "Pending", color: "amber" },
                        { k: "refunded", label: "Refunded", color: "rose" },
                      ].map((v) => (
                        <button
                          className={v.color}
                          key={v.k}
                          onClick={() =>
                            setParams({
                              status:
                                v.k === "successful"
                                  ? "paid"
                                  : v.k === "pending"
                                    ? "created"
                                    : v.k,
                            })
                          }
                        >
                          <span>
                            <i />
                            {v.label} transactions
                          </span>
                          <strong>{number(s[v.k])}</strong>
                          <Icon name="arrow" size={16} />
                        </button>
                      ))}
                    </div>
                    <div className="charts-grid">
                      {trend("revenue", "Gross revenue")}
                      <Panel
                        title="Revenue by purchased plan"
                        description="Confirmed receipts · INR · selected period"
                      >
                        {data.revenueByPlan.length ? (
                          <div className="revenue-list">
                            {data.revenueByPlan.map((r) => (
                              <button
                                key={String(r.key)}
                                onClick={() =>
                                  setParams({ plan: String(r.key) })
                                }
                              >
                                <span className="plan-symbol">
                                  <Icon name="plans" size={18} />
                                </span>
                                <span>
                                  <strong>{planLabel(r.key)}</strong>
                                  <small>
                                    {number(r.purchasers)} purchasing customers
                                  </small>
                                </span>
                                <strong>{money(r.revenue)}</strong>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty title="No confirmed receipts" />
                        )}
                      </Panel>
                    </div>
                    <div className="info-banner">
                      <Icon name="info" size={18} />
                      <span>
                        <strong>Gross receipts ≠ net revenue.</strong> Refund
                        amounts, refund dates, and confirmed recurring
                        collections are missing. Net revenue and MRR remain
                        unavailable. No payment status is modified here.
                      </span>
                    </div>
                    {metricCards([
                      {
                        label: "Lifetime gross receipts",
                        key: "lifetime_gross",
                        currency: true,
                        icon: "payments",
                        note: "All confirmed customer and workspace receipts",
                      },
                      {
                        label: "Refund amount",
                        key: "refunds",
                        currency: true,
                        icon: "payments",
                        note: "Authoritative refund amounts unavailable",
                      },
                      {
                        label: "Net revenue",
                        key: "net_revenue",
                        currency: true,
                        icon: "analytics",
                        note: "Requires verified refund amounts",
                      },
                      {
                        label: "MRR",
                        key: "mrr",
                        currency: true,
                        icon: "plans",
                        note: "Recurring collection data unavailable",
                      },
                    ])}
                  </>
                )}
                {[
                  "users",
                  "workspaces",
                  "projects",
                  "credits",
                  "payments",
                ].includes(section) && (
                  <>
                    <div className="table-tools">
                      <label className="table-search">
                        <Icon name="search" size={16} />
                        <input
                          aria-label="Search table"
                          placeholder={`Search ${section}…`}
                          value={query}
                          onChange={(e) => {
                            const value = e.target.value;
                            setQuery(value);
                            if (queryTimer.current)
                              clearTimeout(queryTimer.current);
                            queryTimer.current = setTimeout(
                              () => setParams({ q: value }),
                              350,
                            );
                          }}
                        />
                      </label>
                      <div>
                        <StatusPicker
                          value={p.get("status") || ""}
                          options={statusOptions[tableResource] || []}
                          allLabel={
                            tableResource === "credits"
                              ? "All operations"
                              : tableResource === "members"
                                ? "All roles"
                                : "All statuses"
                          }
                          onChange={(status) => setParams({ status })}
                        />
                        {section === "users" && (
                          <StatusPicker
                            value={p.get("activity") || ""}
                            options={["active", "inactive"]}
                            allLabel="All activity"
                            heading="Activity"
                            ariaLabel="Filter by activity"
                            labels={{
                              active: "Active in period",
                              inactive: "No recent activity",
                            }}
                            onChange={(activity) => setParams({ activity })}
                          />
                        )}
                        {!["credits", "payments"].includes(section) && (
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={p.get("allDates") !== "false"}
                              onChange={(e) =>
                                setParams({
                                  allDates: e.target.checked ? "true" : "false",
                                })
                              }
                            />
                            All creation dates
                          </label>
                        )}
                      </div>
                    </div>
                    <DataTable
                      resource={
                        section === "credits"
                          ? creditTab
                          : section === "workspaces"
                            ? workspaceTab
                            : section
                      }
                      params={
                        section === "credits" && creditTab !== "credits"
                          ? showStock("")
                          : tableParams.toString()
                      }
                      onOpen={open}
                      refresh={refresh}
                      title={
                        section === "credits"
                          ? creditTab === "credits"
                            ? "Credit operation ledger"
                            : creditTab === "users"
                              ? "Owner credit balances"
                              : "Credit sources & validity"
                          : section === "payments"
                            ? "Payment transactions"
                            : undefined
                      }
                    />
                  </>
                )}
                {section === "analytics" && (
                  <>
                    <div className="report-intro">
                      <span className="report-icon">
                        <Icon name="analytics" size={28} />
                      </span>
                      <div>
                        <span className="eyebrow">
                          YOUR PLATFORM, IN PERSPECTIVE
                        </span>
                        <h2>Small signals. Meaningful insights.</h2>
                        <p>
                          Explore growth, engagement, consumption, and verified
                          revenue. Every chart follows the filters above.
                        </p>
                      </div>
                    </div>
                    <div className="report-grid">
                      {trend("users", "User growth")}
                      {trend("workspaces", "Workspace creation", "#6cad9e")}
                      {trend("projects", "Project creation", "#ba8c60")}
                      {trend("credits", "Credit consumption")}
                      {trend("revenue", "Monthly & daily revenue", "#6cad9e")}
                      {trend("invitations", "Invitation activity", "#d23f68")}
                      <Panel
                        title="Current plan distribution"
                        description="Current snapshot; users can own more than one plan"
                      >
                        <PlanChart
                          plans={data.plans}
                          onSelect={(id) => setParams({ plan: id })}
                        />
                      </Panel>
                      {breakdownPanel}
                    </div>
                    <Panel
                      title="Subscription status"
                      description="Current entitlements, grouped by plan"
                    >
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Plan</th>
                              <th>Active</th>
                              <th>Inactive</th>
                              <th>Expired</th>
                              <th>Pending</th>
                              <th>Unknown</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.plans.map((r) => (
                              <tr key={String(r.key)}>
                                <td>{planLabel(r.key)}</td>
                                {[
                                  "active",
                                  "inactive",
                                  "expired",
                                  "pending",
                                  "unknown",
                                ].map((k) => (
                                  <td key={k}>{number(r[k])}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                    <div className="report-grid">
                      <Panel
                        title="Choose a report"
                        description="Preview a report below, then use Export CSV for all matching rows (up to 50,000)."
                      >
                        <div className="export-links">
                          {[
                            "users",
                            "workspaces",
                            "projects",
                            "credits",
                            "payments",
                            "subscriptions",
                            "invitations",
                          ].map((r) => (
                            <button
                              key={r}
                              className="button"
                              aria-pressed={creditTab === r}
                              onClick={() => {
                                setCreditTab(r);
                              }}
                            >
                              <Icon name="analytics" size={15} />
                              {r[0].toUpperCase() + r.slice(1)}
                              <Icon name="chevron" size={15} />
                            </button>
                          ))}
                        </div>
                      </Panel>
                      <Panel
                        title="About these reports"
                        description="Definitions that keep your numbers consistent"
                      >
                        <div className="methodology">
                          <p>
                            <strong>Stocks and flows.</strong> Current totals
                            and balances are snapshots. Trends and usage reflect
                            the selected dates.
                          </p>
                          <p>
                            <strong>Verified payments.</strong> Gross receipts
                            require a recorded provider payment ID, paid
                            timestamp, and paid or refunded status.
                          </p>
                          <p>
                            <strong>No duplicate credit counts.</strong>{" "}
                            Recorded usage takes precedence over its committed
                            reservation.
                          </p>
                        </div>
                      </Panel>
                    </div>
                    <DataTable
                      resource={creditTab}
                      params={tableParams.toString()}
                      title="Selected report"
                      onOpen={open}
                      refresh={refresh}
                    />
                  </>
                )}
                {section === "internal-users" && (
                  <InternalUsers
                    currentEmail={admin.email}
                    addOpen={addInternalUser}
                    onCloseAdd={() => setAddInternalUser(false)}
                  />
                )}
                {section === "settings" && (
                  <>
                    <div className="settings-grid">
                      <Panel
                        title="Administrator profile"
                        description="Access is checked against the existing Horizon account"
                      >
                        <div className="settings-profile">
                          <span className="avatar purple large">
                            {admin.name
                              .split(" ")
                              .map((s) => s[0])
                              .slice(0, 2)
                              .join("")}
                          </span>
                          <div>
                            <h3>{admin.name}</h3>
                            <p>{admin.email}</p>
                            <span className="badge badge-active">
                              Administrator
                            </span>
                          </div>
                        </div>
                        <div className="setting-row">
                          <span>
                            <strong>Automatic refresh</strong>
                            <small>
                              Refresh visible reports every 30 seconds.
                            </small>
                          </span>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={autoRefresh}
                              aria-label="Automatic refresh"
                              onChange={(e) => {
                                setAutoRefresh(e.target.checked);
                                localStorage.setItem(
                                  "horizon-auto-refresh",
                                  String(e.target.checked),
                                );
                              }}
                            />
                            <span />
                          </label>
                        </div>
                        <div className="setting-row">
                          <span>
                            <strong>Session</strong>
                            <small>
                              Eight-hour, signed, HTTP-only session.
                            </small>
                          </span>
                          <button className="button" onClick={requestLogout}>
                            Sign out
                          </button>
                        </div>
                      </Panel>
                      <Panel
                        title="Data & access"
                        description="Server configuration; credentials are never returned to the browser"
                      >
                        <dl className="connection-details">
                          {Object.entries(data.configuration || {}).map(
                            ([k, v]) => (
                              <div key={k}>
                                <dt>
                                  {k
                                    .replace(/([A-Z])/g, " $1")
                                    .replace(/^./, (c) => c.toUpperCase())}
                                </dt>
                                <dd>
                                  {typeof v === "boolean"
                                    ? v
                                      ? "Configured"
                                      : "Not configured"
                                    : String(v)}
                                </dd>
                              </div>
                            ),
                          )}
                        </dl>
                      </Panel>
                    </div>
                    <Panel
                      title="Data definitions & availability"
                      description="Source limitations are disclosed wherever the metric appears"
                    >
                      <div className="limitations-grid">
                        {limitations.map((l) => (
                          <article key={l.title}>
                            <Icon name="info" size={18} />
                            <div>
                              <h3>{l.title}</h3>
                              <p>{l.detail}</p>
                            </div>
                          </article>
                        ))}
                      </div>
                    </Panel>
                    <Panel
                      title="Plan mapping"
                      description="Names and prices are preserved from the existing platform"
                    >
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Source</th>
                              <th>Plan</th>
                              <th>Monthly</th>
                              <th>Yearly</th>
                              <th>Plan credits</th>
                              <th>Mapping</th>
                            </tr>
                          </thead>
                          <tbody>
                            {catalog.map((c) => (
                              <tr key={c.key}>
                                <td>{c.source}</td>
                                <td>{c.name}</td>
                                <td>{money(c.monthly)}</td>
                                <td>{money(c.yearly)}</td>
                                <td>{number(c.credits)}</td>
                                <td>{c.mapping}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Panel>
                  </>
                )}
              </div>
            )
          )}
          <footer className="page-footer">
            <span>
              Horizon Internal <span>·</span> A clearer view of your platform
            </span>
            <span>
              <Icon name="shield" size={13} /> Administrator workspace
            </span>
          </footer>
        </main>
      </div>
      {globalSearch && (
        <GlobalSearch onClose={() => setGlobalSearch(false)} onSelect={open} />
      )}{" "}
      {confirmLogout && (
        <div
          className="confirmation-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !signingOut)
              setConfirmLogout(false);
          }}
        >
          <section
            className="confirmation-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
            aria-describedby="signout-description"
          >
            <span className="confirmation-icon" aria-hidden="true">
              <Icon name="logout" size={22} />
            </span>
            <h2 id="signout-title">Sign out of Horizon?</h2>
            <p id="signout-description">
              You’ll need to sign in again to access the administration workspace.
            </p>
            <div className="confirmation-actions">
              <button
                type="button"
                className="button"
                autoFocus
                disabled={signingOut}
                onClick={() => setConfirmLogout(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button primary"
                disabled={signingOut}
                onClick={logout}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </section>
        </div>
      )}
      {detail && (
        <DetailDrawer
          target={detail}
          params={params}
          onClose={() => setDetail(null)}
          onOpen={open}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}
