import { PublicError } from "./db";
export type Filters = {
  start: string;
  end: string;
  asOf: string;
  period: string;
  granularity: "day" | "week" | "month";
  plan: string;
  user: string;
  workspace: string;
  project: string;
  q: string;
  status: string;
  activity: string;
  page: number;
  pageSize: number;
  sort: string;
  direction: "asc" | "desc";
};
export const resources = [
  "users",
  "subscriptions",
  "workspaces",
  "projects",
  "credits",
  "payments",
  "invitations",
  "members",
] as const;
export type Resource = (typeof resources)[number];
export function parseFilters(
  params: URLSearchParams,
  now = new Date(),
): Filters {
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const period = params.get("period") || "30d";
  let start = new Date(today),
    end = new Date(today.getTime() + 86400000);
  if (["7d", "30d", "90d"].includes(period))
    start.setUTCDate(start.getUTCDate() - Number(period.slice(0, -1)) + 1);
  else if (period === "month") start.setUTCDate(1);
  else if (period === "year")
    start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  else if (period === "custom") {
    const a = params.get("start") || "",
      b = params.get("end") || "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b))
      throw new PublicError("Choose a valid start and end date.");
    start = new Date(`${a}T00:00:00Z`);
    end = new Date(`${b}T00:00:00Z`);
    if (
      !Number.isFinite(+start) ||
      !Number.isFinite(+end) ||
      start.toISOString().slice(0, 10) !== a ||
      end.toISOString().slice(0, 10) !== b
    )
      throw new PublicError("Choose valid calendar dates.");
    end.setUTCDate(end.getUTCDate() + 1);
  } else if (period !== "today")
    throw new PublicError("Unsupported reporting period.");
  if (+start >= +end || +end - +start > 732 * 86400000 || +start > +now)
    throw new PublicError(
      "Choose a past or current date range of up to two years.",
    );
  const get = (key: string) => (params.get(key) || "").trim().slice(0, 200);
  const page = Number(params.get("page") || 1),
    pageSize = Number(params.get("pageSize") || 5);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    ![5, 10, 20, 50, 100].includes(pageSize)
  )
    throw new PublicError("Invalid pagination.");
  const granularity = params.get("granularity") || "day";
  if (!["day", "week", "month"].includes(granularity))
    throw new PublicError("Invalid chart interval.");
  return {
    start: start.toISOString(),
    end: new Date(Math.min(+end, +now)).toISOString(),
    asOf: now.toISOString(),
    period,
    granularity: granularity as Filters["granularity"],
    plan: get("plan"),
    user: get("user"),
    workspace: get("workspace"),
    project: get("project"),
    q: get("q"),
    status: get("status"),
    activity: get("activity"),
    page,
    pageSize,
    sort: get("sort"),
    direction: params.get("direction") === "asc" ? "asc" : "desc",
  };
}
export function filterParams(f: Filters): unknown[] {
  return [f.asOf, f.start, f.end, f.plan, f.user, f.workspace, f.project];
}
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/^[\s]*[=+@\-\t\r]/.test(text) && typeof value !== "number")
    text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
export function toCsv(rows: Record<string, unknown>[], columns: string[]) {
  return (
    "\uFEFF" +
    [
      columns.map(csvCell).join(","),
      ...rows.map((row) => columns.map((key) => csvCell(row[key])).join(",")),
    ].join("\r\n")
  );
}
