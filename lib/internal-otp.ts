import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export interface OtpQuery {
  query<T extends Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<T[]>;
}

export interface OtpDatabase extends OtpQuery {
  transaction<T>(operation: (tx: OtpQuery) => Promise<T>): Promise<T>;
}

export class OtpError extends Error {
  constructor(
    message: string,
    public status = 400,
    public retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

type Admin = {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
};

type Challenge = {
  user_id: string | null;
  otp_hash: string;
  expires_at: Date | string;
  attempts: number;
};

export const OTP_VALIDITY_SECONDS = 300;
export const OTP_RESEND_SECONDS = 60;

export function normalizeOtpEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? email
    : null;
}

export function createInternalOtpAuth(options: {
  db: OtpDatabase;
  secret: string;
  send: (input: { email: string; name: string; otp: string }) => Promise<unknown>;
  now?: () => number;
}) {
  const { db, secret } = options;
  const now = options.now || Date.now;

  function checkSecret() {
    if (secret.length < 32)
      throw new OtpError("Administrator sign-in is not configured.", 503);
  }

  function digest(value: string) {
    return createHmac("sha256", secret).update(value).digest("hex");
  }

  async function limit(key: string, maximum: number) {
    const [row] = await db.query<{
      attempt_count: number;
      retry_after: number;
    }>(
      `INSERT INTO admin_login_rate_limits(client_hash,window_started_at,attempt_count)
       VALUES($1,NOW(),1) ON CONFLICT(client_hash) DO UPDATE SET
       attempt_count=CASE WHEN admin_login_rate_limits.window_started_at<=NOW()-INTERVAL '15 minutes' THEN 1 ELSE admin_login_rate_limits.attempt_count+1 END,
       window_started_at=CASE WHEN admin_login_rate_limits.window_started_at<=NOW()-INTERVAL '15 minutes' THEN NOW() ELSE admin_login_rate_limits.window_started_at END,
       updated_at=NOW()
       RETURNING attempt_count,CEIL(EXTRACT(EPOCH FROM window_started_at+INTERVAL '15 minutes'-NOW()))::int retry_after`,
      [digest(key)],
    );
    if (row.attempt_count > maximum)
      throw new OtpError(
        "Too many code requests. Try again later.",
        429,
        row.retry_after,
      );
  }

  async function requestCode(input: unknown, ip: string) {
    checkSecret();
    const email = normalizeOtpEmail((input as { email?: unknown })?.email);
    if (!email) throw new OtpError("Enter a valid email address.", 422);
    await limit(`internal-otp:ip:${ip}`, 30);
    await limit(`internal-otp:email:${email}`, 8);

    const [user] = await db.query<Admin>(
      `SELECT u.id,u.email,u.name,
       CASE WHEN a.status='active' THEN 'admin' ELSE u.role END role,
       CASE WHEN a.status='active' AND u.status='active' THEN 'active' ELSE 'suspended' END status
       FROM users u LEFT JOIN internal_admin_access a ON a.user_id=u.id
       WHERE lower(u.email)=$1 LIMIT 1`,
      [email],
    );
    // Do not reveal which email addresses are on the internal allowlist.
    if (!user || user.role !== "admin" || user.status !== "active") {
      const requestedAt = now();
      return {
        ok: true,
        email,
        expiresAt: new Date(requestedAt + OTP_VALIDITY_SECONDS * 1000).toISOString(),
        resendAt: new Date(requestedAt + OTP_RESEND_SECONDS * 1000).toISOString(),
      };
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const otpHash = digest(`login|${email}|${otp}`);
    const [challenge] = await db.query<{
      expires_at: Date | string;
      updated_at: Date | string;
    }>(
      `INSERT INTO email_otp_challenges(email,purpose,user_id,name,otp_hash,expires_at)
       VALUES($1,'login',$2,$3,$4,NOW()+INTERVAL '5 minutes')
       ON CONFLICT(email,purpose) DO UPDATE SET user_id=EXCLUDED.user_id,name=EXCLUDED.name,
       otp_hash=EXCLUDED.otp_hash,expires_at=EXCLUDED.expires_at,attempts=0,updated_at=NOW()
       WHERE email_otp_challenges.updated_at<=NOW()-INTERVAL '60 seconds'
       RETURNING expires_at,updated_at`,
      [email, user.id, user.name, otpHash],
    );
    if (!challenge) {
      const [row] = await db.query<{ retry_after: number }>(
        "SELECT GREATEST(1,CEIL(EXTRACT(EPOCH FROM updated_at+INTERVAL '60 seconds'-NOW())))::int retry_after FROM email_otp_challenges WHERE email=$1 AND purpose='login'",
        [email],
      );
      throw new OtpError(
        "Please wait before requesting another code.",
        429,
        row?.retry_after || OTP_RESEND_SECONDS,
      );
    }
    try {
      await options.send({ email, name: user.name, otp });
    } catch {
      await db.query(
        "DELETE FROM email_otp_challenges WHERE email=$1 AND purpose='login' AND otp_hash=$2",
        [email, otpHash],
      );
      throw new OtpError(
        "We could not send the code. Please try again in a moment.",
        503,
      );
    }
    return {
      ok: true,
      email,
      expiresAt: new Date(challenge.expires_at).toISOString(),
      resendAt: new Date(
        new Date(challenge.updated_at).getTime() + OTP_RESEND_SECONDS * 1000,
      ).toISOString(),
    };
  }

  async function verifyCode(input: unknown) {
    checkSecret();
    const email = normalizeOtpEmail((input as { email?: unknown })?.email);
    const otp = (input as { otp?: unknown })?.otp;
    if (!email || typeof otp !== "string" || !/^\d{6}$/.test(otp))
      throw new OtpError("Enter the six-digit code from your email.", 422);

    const result = await db.transaction(async (tx) => {
      const [challenge] = await tx.query<Challenge>(
        "SELECT user_id,otp_hash,expires_at,attempts FROM email_otp_challenges WHERE email=$1 AND purpose='login' FOR UPDATE",
        [email],
      );
      if (!challenge || new Date(challenge.expires_at).getTime() <= now())
        return { error: "This code is invalid or expired. Request a new code." } as const;
      if (challenge.attempts >= 5)
        return { error: "Too many incorrect attempts. Request a new code." } as const;
      const actual = Buffer.from(digest(`login|${email}|${otp}`), "hex");
      const expected = Buffer.from(challenge.otp_hash, "hex");
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      ) {
        await tx.query(
          "UPDATE email_otp_challenges SET attempts=attempts+1 WHERE email=$1 AND purpose='login'",
          [email],
        );
        return { error: "The code is incorrect. Please try again." } as const;
      }
      const [user] = await tx.query<Admin>(
        `SELECT u.id,u.email,u.name,
         CASE WHEN a.status='active' THEN 'admin' ELSE u.role END role,
         CASE WHEN a.status='active' AND u.status='active' THEN 'active' ELSE 'suspended' END status
         FROM users u LEFT JOIN internal_admin_access a ON a.user_id=u.id
         WHERE u.id=$1 AND lower(u.email)=$2 FOR UPDATE OF u`,
        [challenge.user_id, email],
      );
      if (!user || user.role !== "admin" || user.status !== "active") {
        await tx.query(
          "DELETE FROM email_otp_challenges WHERE email=$1 AND purpose='login'",
          [email],
        );
        return { error: "Administrator access is unavailable for this account." } as const;
      }
      await tx.query(
        "UPDATE users SET last_login_at=NOW(),email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=$1",
        [user.id],
      );
      await tx.query(
        "DELETE FROM email_otp_challenges WHERE email=$1 AND purpose='login'",
        [email],
      );
      return { user } as const;
    });
    if ("error" in result && result.error)
      throw new OtpError(result.error, 401);
    return result.user;
  }

  return { requestCode, verifyCode };
}
