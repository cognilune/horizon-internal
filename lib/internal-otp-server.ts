import { getDb, json } from "./db";
import { sendInternalLoginOtp, smtpConfigured } from "./internal-email";
import {
  createInternalOtpAuth,
  OtpError,
  type OtpQuery,
} from "./internal-otp";

function auth() {
  const sql = getDb(false);
  const adapt = (connection: Pick<typeof sql, "unsafe">): OtpQuery => ({
    query: async <T extends Record<string, unknown>>(
      query: string,
      parameters: unknown[] = [],
    ) => Array.from(await connection.unsafe<T[]>(query, parameters as never[])),
  });
  return createInternalOtpAuth({
    db: {
      ...adapt(sql),
      transaction: async (operation) =>
        sql.begin((tx) => operation(adapt(tx))) as ReturnType<typeof operation>,
    },
    secret: process.env.ADMIN_SESSION_SECRET || "",
    send: sendInternalLoginOtp,
  });
}

export function otpError(error: unknown) {
  if (error instanceof OtpError) {
    const response = json(
      { error: error.message, retryAfterSeconds: error.retryAfterSeconds },
      error.status,
    );
    if (error.retryAfterSeconds)
      response.headers.set("Retry-After", String(error.retryAfterSeconds));
    return response;
  }
  if (error instanceof SyntaxError)
    return json({ error: "Enter valid sign-in details." }, 422);
  throw error;
}

export function internalOtpAuth(requireEmailDelivery = false) {
  if (requireEmailDelivery && !smtpConfigured())
    throw new OtpError("Email delivery is not configured.", 503);
  return auth();
}
