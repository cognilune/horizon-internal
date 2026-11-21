import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  createInternalOtpAuth,
  normalizeOtpEmail,
  OtpError,
  type OtpQuery,
} from "../lib/internal-otp";

const secret = "internal-otp-test-secret-that-is-at-least-32-characters";

async function setup() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TABLE users(
      id text PRIMARY KEY,name text NOT NULL,email text NOT NULL,role text NOT NULL,
      status text NOT NULL,last_login_at timestamptz,email_verified_at timestamptz
    );
    CREATE TABLE admin_login_rate_limits(
      client_hash text PRIMARY KEY,window_started_at timestamptz NOT NULL,
      attempt_count integer NOT NULL,updated_at timestamptz DEFAULT NOW()
    );
    CREATE TABLE email_otp_challenges(
      email text NOT NULL,purpose text NOT NULL,user_id text REFERENCES users(id),
      name text NOT NULL,otp_hash text NOT NULL,expires_at timestamptz NOT NULL,
      attempts integer NOT NULL DEFAULT 0,updated_at timestamptz NOT NULL DEFAULT NOW(),
      PRIMARY KEY(email,purpose)
    );
    INSERT INTO users VALUES
      ('admin','Approved Admin','admin@example.test','admin','active',NULL,NULL),
      ('customer','Customer','customer@example.test','customer','active',NULL,NULL);
  `);
  const adapt = (connection: { query: PGlite["query"] }): OtpQuery => ({
    query: async <T extends Record<string, unknown>>(sql: string, params: unknown[] = []) =>
      (await connection.query<T>(sql, params)).rows,
  });
  let delivered: { email: string; otp: string } | null = null;
  const auth = createInternalOtpAuth({
    db: {
      ...adapt(pg),
      transaction: (operation) => pg.transaction((tx) => operation(adapt(tx))),
    },
    secret,
    send: async ({ email, otp }) => { delivered = { email, otp }; },
  });
  return { pg, auth, delivered: () => delivered };
}

test("OTP email normalization rejects malformed input", () => {
  assert.equal(normalizeOtpEmail(" Admin@Example.Test "), "admin@example.test");
  assert.equal(normalizeOtpEmail("not-an-email"), null);
  assert.equal(normalizeOtpEmail(null), null);
});

test("an approved active administrator can request and consume one OTP", async () => {
  const { pg, auth, delivered } = await setup();
  await auth.requestCode({ email: "ADMIN@example.test" }, "127.0.0.1");
  const message = delivered();
  assert.ok(message);
  const user = await auth.verifyCode({ email: message.email, otp: message.otp });
  assert.equal(user.id, "admin");
  await assert.rejects(
    auth.verifyCode({ email: message.email, otp: message.otp }),
    (error: unknown) => error instanceof OtpError && error.status === 401,
  );
  await pg.close();
});

test("unapproved accounts receive no OTP and access is rechecked at verification", async () => {
  const first = await setup();
  const generic = await first.auth.requestCode({ email: "customer@example.test" }, "127.0.0.2");
  assert.equal(generic.ok, true);
  assert.equal(first.delivered(), null);
  await first.pg.close();

  const second = await setup();
  await second.auth.requestCode({ email: "admin@example.test" }, "127.0.0.3");
  const message = second.delivered();
  assert.ok(message);
  await second.pg.query("UPDATE users SET status='suspended' WHERE id='admin'");
  await assert.rejects(
    second.auth.verifyCode({ email: message.email, otp: message.otp }),
    (error: unknown) =>
      error instanceof OtpError && /access is unavailable/i.test(error.message),
  );
  await second.pg.close();
});
