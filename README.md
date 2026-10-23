# Horizon Internal

The internal administration and analytics application for the existing Horizon platform. Built with Next.js 16, React 19, TypeScript, and PostgreSQL. All production analytics come from the existing database; there is no demo mode, seed operation, or static metrics fallback.

## Run locally

```powershell
npm ci
Copy-Item .env.example .env.local
# Configure DATABASE_URL, ADMIN_SESSION_SECRET, and APP_ORIGIN.
npm run dev
```

Open `http://localhost:3100` and use an **existing active Horizon account with role `admin`**. Customer, editor, viewer, suspended, expired, or tampered sessions cannot access the application. No development authentication bypass is supported.

For this Occaza workspace, configuration can be explicitly imported from the existing checkout **into process memory only**:

```powershell
node scripts/with-horizon-env.mjs "../cognilune website/cognilune-websites" dev
node scripts/with-horizon-env.mjs "../cognilune website/cognilune-websites" check:data
```

This does not copy `.env` files or print credentials. It reads only database connection settings and the shared session secret. Provision or recover administrator accounts through the existing Horizon administrator workflow; this dashboard does not create administrators.

## Included

- Overview, users, plans/subscriptions, workspaces, projects, credits, payments, reports, and settings.
- Server-side search, bounded pagination, sorting, date filters, owner/workspace/project scopes, and CSV exports up to 50,000 matching rows.
- Cross-record drill-downs, owner balances, workspace members/invitations, purchase history, and operation history.
- Daily, weekly, and monthly charts, keyboard-accessible chart data tables, configurable 30-second refresh, and payment alerts.
- Desktop, tablet, and mobile navigation, focus-managed dialogs, loading/empty/error states, and reduced-motion support.
- Admin authentication compatible with Horizon's existing password and session formats; role and account status are rechecked in PostgreSQL on **every** API request.

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

Use a dedicated private/internal deployment connected to the existing Horizon database. Set `APP_ORIGIN` to the exact HTTPS origin and `ADMIN_SESSION_SECRET` to the existing Horizon secret (at least 32 characters). Secrets stay server-side. `DATABASE_URL` must have the existing authentication and audit permissions. Optionally set `ANALYTICS_DATABASE_URL` to a separate read-only role for analytics and role lookups.

All analytics run in a **read-only, repeatable-read database transaction** with a 15-second statement timeout and a bounded connection pool. Sign-in uses the existing persistent login-rate-limit table and scrypt hashes. Sign-ins, sensitive record views, and CSV exports are logged in the existing `audit_logs` table. The only writes are authentication bookkeeping and audit records. No plan, status, credit, project, payment, or workspace mutations are exposed.

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
