# Horizon Internal

### Database administration

The `/database` page reads the primary Horizon database configured in `DATABASE_URL`. For each environment, apply platform migrations `098_internal_database_controls.sql` and `099_internal_database_inventory.sql`, then roll out the updated Horizon web service and all database workers before exposing the new Horizon Internal release. Old runtime replicas do not enforce the new flag. If the internal app uses a separate database role from the migration owner, grant that trusted server role `SELECT` on `public.internal_database_inventory` and `public.internal_database_actions` and `EXECUTE` on `public.internal_set_database_access(text,text,text,text,boolean,text)`. Keep execution private to the internal administration service. The transition function checks the signed-in administrator’s current account and writes the action to `public.internal_database_actions` atomically.

Usage cards count distinct users who selected a database or connected PostgreSQL, using the project owner for legacy records without a known creator, including blocked and disconnected records. Projects with an external connection use that connection as their displayed source. Static projects with no recorded sample selection or sample records are omitted. Creation-date filters use UTC.

The internal administration and analytics application for the existing Horizon platform. Built with Next.js 16, React 19, TypeScript, and PostgreSQL. All production analytics come from the existing database; there is no demo mode, seed operation, or static metrics fallback.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure DATABASE_URL, ADMIN_SESSION_SECRET, APP_ORIGIN, and SMTP settings.
npm run dev
```

Open `http://localhost:3100`, enter the email of an **existing active Horizon account with role `admin`**, and verify the six-digit code delivered by email. Customer, editor, viewer, suspended, removed, or tampered sessions cannot access the application. No development authentication bypass is supported.

For this Occaza workspace, configuration can be explicitly imported from the existing checkout **into process memory only**:

```powershell
node scripts/with-horizon-env.mjs "../cognilune website/cognilune-websites" dev
node scripts/with-horizon-env.mjs "../cognilune website/cognilune-websites" check:data
```

This does not copy `.env` files or print credentials. It reads only database, session, SMTP, and server-only KYC document settings into the child process. Approve or revoke administrators from **Internal users**; an approved email must have role `admin` and status `active` at both OTP request and verification time.

## Included

- Overview, users, plans/subscriptions, workspaces, projects, credits, payments, reports, and settings.
- Server-side search, bounded pagination, sorting, date filters, owner/workspace/project scopes, and CSV exports up to 50,000 matching rows.
- Cross-record drill-downs, owner balances, workspace members/invitations, purchase history, and operation history.
- Daily, weekly, and monthly charts, keyboard-accessible chart data tables, configurable 30-second refresh, and payment alerts.
- Desktop, tablet, and mobile navigation, focus-managed dialogs, loading/empty/error states, and reduced-motion support.
- Passwordless administrator authentication with a six-digit, five-minute email OTP, resend/attempt throttles, and Horizon-compatible signed sessions. Role and account status are rechecked in PostgreSQL on **every** API request.

## Data rules

Read [docs/DATA_MAP.md](docs/DATA_MAP.md) for the exact source mapping, reconciliation rules, and limitations. Customer analytics exclude internal staff accounts. Projects are Horizon `ai_projects`; separate CRM directory/website advertising billing is not represented as customer plan revenue.

- Workspace wallets take precedence over legacy account wallets. Credits are never summed across both representations of the same owner.
- Usage ledger records take precedence over their committed reservations; duplicate writes for one reservation count once. Reserved or refunded reservations are excluded.
- Orders are deduplicated across customer and workspace payment tables. Receipts require a recorded provider payment ID, a paid timestamp, and a `paid` or `refunded` state from the verified Horizon billing integration.
- A source `paid` flag without confirmation fields is displayed as **Unverified**, never as successful revenue.
- Gross receipts include the original receipt of subsequently refunded transactions. Refund totals and net revenue remain unavailable because authoritative refund amounts are not present.
- MRR, lifetime allocations, lifetime credit-usage percentage, balances after operations, and complete cancellation/transition history are unavailable where the source cannot support them.
- Current counts and balances are snapshots. Trends, operations, new records, and receipts follow the selected period. Dates use UTC and half-open intervals. The UI identifies snapshot and period metrics separately.
- Plan names are preserved. Account **Starter** maps to workspace **Pro**; account **Pro** maps to workspace **Business**. **Plus** does not exist. Prices are source configuration, not sample analytics; update `lib/catalog.ts` when upstream pricing changes.

## Security and deployment

Use a dedicated private/internal deployment connected to the existing Horizon database. Set `APP_ORIGIN` to the exact HTTPS origin and `ADMIN_SESSION_SECRET` to the existing Horizon secret (at least 32 characters). Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, and `AUTH_FROM_EMAIL` with Horizon's email delivery settings. Secrets stay server-side. `DATABASE_URL` must have the existing authentication and audit permissions. Optionally set `ANALYTICS_DATABASE_URL` to a separate read-only role for analytics and role lookups. The shared database must include Horizon migration `075_passwordless_email_otp.sql`.

All analytics run in a **read-only, repeatable-read database transaction** with a 15-second statement timeout and a bounded connection pool. OTPs are HMAC-hashed at rest, expire after five minutes, allow five verification attempts, enforce a 60-second resend delay, and use the persistent login-rate-limit table. Sign-ins, sensitive record views, and CSV exports are logged in `audit_logs`. The only writes are authentication/access bookkeeping and audit records. No plan, credit, project, payment, or workspace mutations are exposed.

KYC Management (`/kyc`) uses the primary Horizon database and reads creator payout submissions written by the “Submit Your KYC” flow (`creator_payout_profiles`, migrations 081–084). Provide the same server-only `KYC_DOCUMENT_KEY_V1` as Horizon Web, plus `KYC_DOCUMENT_KEY_LEGACY` during a key rotation. Active administrators can view submitted member, business, identity, and payout details and securely open uploaded evidence. The screen refreshes automatically every three seconds while visible. Horizon Internal does not duplicate or manually re-enter submission data and does not change gateway or payout status.

```powershell
npm run build
npm start
```

Use HTTPS and an authenticated private network boundary where available. The health endpoint `/api/health` is a non-sensitive process-liveness check; `npm run check:data` separately verifies database integration. Apply existing Horizon migrations through the upstream application. No application data tables are created here.

Optional large-dataset indexes are in [ops/analytics-indexes.sql](ops/analytics-indexes.sql). They are intentionally **not applied automatically**. Run them through the normal database change process after checking existing indexes and execution plans. Search uses escaped `ILIKE`; consider `pg_trgm` only after measuring search latency on large datasets. CSV exports above the row limit require narrower filters instead of silently truncating records.

## Verification

```powershell
npm run typecheck
npm test
npm run build
npm run check:data                # requires database configuration
node tests/http-smoke.mjs         # with the local app running
node --import tsx tests/ui-preview.ts
```

The last command is an explicitly separate, loopback-only UI test harness on port 3101. It uses disposable in-memory PostgreSQL fixtures and is labelled **ISOLATED TEST FIXTURE — NOT LIVE DATA**. It is never part of the Next.js application and does not bypass production authentication. `/desktop` and `/mobile` render 1440px and 390px test frames. Stop the harness after testing.

Automated checks cover payment/reservation deduplication, unverified receipts, expired entitlements, snapshot and time-series consistency, source-plan filtering, owner/workspace/project scopes, all table queries, date boundaries, pagination, search escaping, CSV formula protection, signed sessions, and role/suspension revalidation. Live aggregate verification is read-only and emits no customer names or emails.
