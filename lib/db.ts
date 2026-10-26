import postgres from "postgres";
export type Row = Record<string, unknown>;
export type Query = <T extends Row = Row>(
  text: string,
  params?: unknown[],
) => Promise<T[]>;
const globalDb = globalThis as typeof globalThis & {
  horizonPools?: Record<string, ReturnType<typeof postgres>>;
};
export class PublicError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function getDb(analytics = true) {
  const key = analytics ? "analytics" : "auth";
  globalDb.horizonPools ??= {};
  if (globalDb.horizonPools[key]) return globalDb.horizonPools[key];
  const configured =
    (analytics && process.env.ANALYTICS_DATABASE_URL) ||
    process.env.DATABASE_URL;
  if (!configured)
    throw new PublicError(
      "The Horizon database connection has not been configured.",
      503,
    );
  const url = new URL(configured);
  if (
    process.env.DATABASE_PUBLIC_HOST &&
    process.env.DATABASE_PUBLIC_PORT &&
    !(analytics && process.env.ANALYTICS_DATABASE_URL)
  ) {
    url.hostname = process.env.DATABASE_PUBLIC_HOST;
    url.port = process.env.DATABASE_PUBLIC_PORT;
  }
  globalDb.horizonPools[key] = postgres(url.toString(), {
    ssl: process.env.DATABASE_SSL === "true" ? "require" : false,
    max: Math.min(
      8,
      Math.max(1, Number(process.env.DATABASE_MAX_CONNECTIONS) || 4),
    ),
    idle_timeout: 20,
    connect_timeout: 20,
    connection: {
      application_name: "horizon-internal",
      statement_timeout: 15000,
    },
  });
  return globalDb.horizonPools[key];
}
export async function readSnapshot<T>(
  callback: (query: Query) => Promise<T>,
): Promise<T> {
  // Database-enforced read-only, repeatable snapshot, even with a read/write credential.
  return (await getDb().begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const query: Query = async (text, params = []) =>
        (await tx.unsafe(text, params as never[])) as never;
      return callback(query);
    },
  )) as T;
}
export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store, private", Vary: "Cookie" },
  });
}
export function apiError(error: unknown) {
  if (error instanceof PublicError)
    return json({ error: error.message }, error.status);
  const code = (error as { code?: string })?.code;
  console.error("Horizon request failed", { code: code || "unknown" });
  return json(
    {
      error:
        code === "42P01" || code === "42703"
          ? "The Horizon schema is incomplete. Apply the existing platform migrations and retry."
          : "The data source is temporarily unavailable. Please retry.",
    },
    503,
  );
}
