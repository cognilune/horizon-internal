-- Optional operational indexes for the EXISTING Horizon schema.
-- Not run by this application. Inspect existing indexes before applying.
-- CONCURRENTLY must be executed outside a transaction, one statement at a time.
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_usage_reservation_ref_idx
  ON customer_credit_usage ((metadata->>'reservationId'))
  WHERE metadata->>'reservationId' IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_usage_time_owner_idx
  ON customer_credit_usage (created_at, owner_user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_committed_workspace_credits_idx
  ON customer_workspace_credit_reservations (committed_at, workspace_id)
  WHERE status='committed';
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_committed_account_credits_idx
  ON customer_credit_reservations (committed_at, owner_user_id)
  WHERE status='committed';
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_confirmed_customer_payments_idx
  ON customer_payments (paid_at, owner_user_id)
  WHERE status IN ('paid','refunded') AND razorpay_payment_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_customers_created_idx
  ON users (created_at, id) WHERE role='customer';
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_workspace_invites_date_idx
  ON customer_workspace_invites (created_at, workspace_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS horizon_customer_email_login_idx
  ON users (lower(email));
