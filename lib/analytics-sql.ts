// A single normalized model is shared by cards, reports, exports and drill-downs.
// Values are always bound parameters. Identifiers used by callers come from fixed allowlists.
export const model = `WITH
 clock AS (SELECT $1::timestamptz now,$2::timestamptz start_at,$3::timestamptz end_at),
 customers AS (
  SELECT u.id,u.name,u.email,CASE WHEN u.status IN ('blocked','suspended') THEN 'blocked' ELSE u.status END status,u.created_at,u.last_login_at,
   GREATEST(u.last_login_at,(SELECT MAX(s.last_seen_at) FROM customer_account_sessions s WHERE s.user_id=u.id)) last_active_at
  FROM users u WHERE u.role='customer'
 ),
 wallets AS (
  SELECT w.id,w.owner_user_id user_id,w.name,w.plan_code,'workspace:'||w.plan_code plan_key,
   'workspace' source,w.billing_interval,CASE WHEN w.status='deleted' THEN 'suspended' ELSE w.status END status,w.created_at,w.updated_at,w.plan_started_at,w.plan_expires_at,
   w.daily_limit,w.subscription_credits,w.topup_credits,
   CASE WHEN w.status='active' AND (CASE WHEN w.plan_code='free' THEN w.free_credits_until ELSE w.plan_expires_at END)>(SELECT now FROM clock)
    THEN CASE WHEN w.last_refill_on<((SELECT now FROM clock) AT TIME ZONE 'UTC')::date THEN w.daily_limit ELSE w.daily_remaining END ELSE 0 END daily_remaining,
   CASE WHEN w.plan_code='free' THEN w.free_credits_until ELSE w.plan_expires_at END available_until,
   0::numeric rollover_credits
  FROM customer_workspaces w JOIN customers c ON c.id=w.owner_user_id
  WHERE to_jsonb(w)->>'deleted_at' IS NULL
  UNION ALL
  SELECT 'account:'||c.id,c.id,c.name||' (legacy account)',COALESCE(b.plan_code,'free'),'account:'||COALESCE(b.plan_code,'free'),
   'account',b.billing_interval,c.status,c.created_at,b.updated_at,b.plan_started_at,b.plan_expires_at,
   COALESCE(w.daily_limit,0),COALESCE(b.subscription_credits,0),COALESCE(b.topup_credits,0),
   CASE WHEN c.status='active' AND w.available_until>(SELECT now FROM clock) THEN CASE WHEN w.last_refill_on<((SELECT now FROM clock) AT TIME ZONE 'UTC')::date THEN w.daily_limit ELSE w.daily_remaining END ELSE 0 END,
   w.available_until,CASE WHEN (to_jsonb(b)->>'rollover_expires_at')::timestamptz>(SELECT now FROM clock) THEN COALESCE((to_jsonb(b)->>'rollover_credits')::numeric,0) ELSE 0 END
  FROM customers c LEFT JOIN customer_billing_accounts b ON b.owner_user_id=c.id LEFT JOIN customer_credit_wallets w ON w.owner_user_id=c.id
  WHERE NOT EXISTS(SELECT 1 FROM customer_workspaces ws WHERE ws.owner_user_id=c.id)
 ),
 subscriptions AS (
  SELECT w.*,CASE WHEN w.plan_code='free' THEN 'free' WHEN w.status='pending_payment' THEN 'pending'
   WHEN w.status<>'active' THEN 'inactive' WHEN w.plan_expires_at IS NULL THEN 'unknown'
   WHEN w.plan_expires_at<=(SELECT now FROM clock) THEN 'expired' ELSE 'active' END subscription_status,
   CASE WHEN w.status='active' THEN w.daily_remaining+w.subscription_credits+w.topup_credits+w.rollover_credits ELSE 0 END remaining,
   CASE WHEN w.source='workspace' AND w.plan_code='pro' OR w.source='account' AND w.plan_code='starter' THEN 40
    WHEN w.source='workspace' AND w.plan_code='business' OR w.source='account' AND w.plan_code='pro' THEN 100
    WHEN w.plan_code='free' THEN 0 ELSE NULL END plan_allowance
  FROM wallets w
 ),
 payments_raw AS (
  SELECT p.id,p.owner_user_id user_id,p.metadata->>'workspace_id' workspace_id,'account:'||COALESCE(p.plan_code,'topup') plan_key,
   p.plan_code,p.kind,p.billing_interval,p.amount_paise,p.currency,p.status,p.razorpay_order_id order_id,p.razorpay_payment_id provider_payment_id,
   p.created_at,p.paid_at,NULLIF(p.metadata->>'method','') method,'customer_payments' source
  FROM customer_payments p WHERE NOT EXISTS (
   SELECT 1 FROM customer_workspace_payments wp
   WHERE (wp.razorpay_order_id=p.razorpay_order_id OR (p.razorpay_payment_id IS NOT NULL AND wp.razorpay_payment_id=p.razorpay_payment_id))
    AND wp.status IN ('paid','refunded') AND wp.razorpay_payment_id IS NOT NULL AND wp.paid_at IS NOT NULL
    AND NOT (p.status IN ('paid','refunded') AND p.razorpay_payment_id IS NOT NULL AND p.paid_at IS NOT NULL))
  UNION ALL
  SELECT p.id,p.created_by,p.workspace_id,'workspace:'||p.plan_code,p.plan_code,'plan',p.billing_interval,p.amount_paise,'INR',p.status,
   p.razorpay_order_id,p.razorpay_payment_id,p.created_at,p.paid_at,NULL,'customer_workspace_payments'
  FROM customer_workspace_payments p WHERE NOT EXISTS (
   SELECT 1 FROM customer_payments cp WHERE (cp.razorpay_order_id=p.razorpay_order_id OR (p.razorpay_payment_id IS NOT NULL AND cp.razorpay_payment_id=p.razorpay_payment_id))
    AND ((cp.status IN ('paid','refunded') AND cp.razorpay_payment_id IS NOT NULL AND cp.paid_at IS NOT NULL)
     OR NOT (p.status IN ('paid','refunded') AND p.razorpay_payment_id IS NOT NULL AND p.paid_at IS NOT NULL)))
 ),
 payments AS (
  SELECT p.*,CASE WHEN p.status IN ('paid','refunded') AND p.provider_payment_id IS NOT NULL AND p.paid_at IS NOT NULL THEN true ELSE false END verified,
   COALESCE(p.paid_at,p.created_at) event_at
  FROM payments_raw p JOIN customers c ON c.id=p.user_id
 ),
 reservations AS (
  SELECT r.id,r.owner_user_id user_id,COALESCE(to_jsonb(r)->>'actor_user_id',r.owner_user_id) actor_id,
   NULL::text workspace_id,r.idempotency_key,r.action,r.amount,r.committed_at,r.created_at,to_jsonb(r)->>'project_id' project_id
  FROM customer_credit_reservations r WHERE r.status='committed'
  UNION ALL
  SELECT r.id,w.owner_user_id,COALESCE(r.user_id,w.owner_user_id),r.workspace_id,r.idempotency_key,r.action,r.amount,r.committed_at,r.created_at,NULL
  FROM customer_workspace_credit_reservations r JOIN customer_workspaces w ON w.id=r.workspace_id WHERE r.status='committed'
 ),
 usage_records AS (
  SELECT DISTINCT ON (CASE WHEN NULLIF(u.metadata->>'reservationId','') IS NOT NULL THEN 'reservation:'||(u.metadata->>'reservationId') ELSE 'event:'||u.id::text END) u.*
  FROM customer_credit_usage u
  ORDER BY CASE WHEN NULLIF(u.metadata->>'reservationId','') IS NOT NULL THEN 'reservation:'||(u.metadata->>'reservationId') ELSE 'event:'||u.id::text END,u.created_at,u.id
 ),
 usage_raw AS (
  SELECT 'usage:'||u.id::text id,u.owner_user_id user_id,COALESCE(to_jsonb(u)->>'actor_user_id',r.actor_id,u.owner_user_id) actor_id,
   COALESCE(r.workspace_id,p.workspace_id,c.workspace_id) workspace_id,u.project_id,u.project_name,u.action,u.credits,u.created_at,
   CASE WHEN LOWER(u.action) LIKE '%plan%' OR u.metadata->>'mode'='plan' THEN 'plan'
    WHEN LOWER(u.action) LIKE '%chat%' THEN 'chat' WHEN u.category='run' THEN 'run' ELSE 'build' END operation,
   'usage_ledger' source,NULL::numeric balance_after
  FROM usage_records u LEFT JOIN ai_projects p ON p.id=u.project_id
   LEFT JOIN customer_chat_conversations c ON c.id=u.conversation_id
   LEFT JOIN reservations r ON r.id=u.metadata->>'reservationId'
  UNION ALL
  SELECT 'reservation:'||r.id,r.user_id,r.actor_id,COALESCE(r.workspace_id,p.workspace_id,c.workspace_id),
   COALESCE(r.project_id,m.project_id,c.project_id),COALESCE(p.name,c.title,'Unattributed operation'),r.action,r.amount,COALESCE(r.committed_at,r.created_at),
   CASE WHEN LOWER(r.action) LIKE '%plan%' THEN 'plan' WHEN LOWER(r.action) LIKE '%chat%' THEN 'chat' ELSE 'build' END,'committed_reservation',NULL
  FROM reservations r LEFT JOIN customer_chat_messages m ON m.id=r.idempotency_key
   LEFT JOIN customer_chat_conversations c ON c.id=m.conversation_id
   LEFT JOIN ai_projects p ON p.id=COALESCE(r.project_id,m.project_id,c.project_id)
  WHERE NOT EXISTS (SELECT 1 FROM customer_credit_usage u WHERE u.metadata->>'reservationId'=r.id)
 ),
 usage AS (
  SELECT r.id,COALESCE(w.owner_user_id,r.user_id) user_id,r.actor_id,r.workspace_id,r.project_id,r.project_name,r.action,r.credits,r.created_at,r.operation,r.source,r.balance_after,
   COALESCE('workspace:'||w.plan_code,s.plan_key,'account:free') plan_key
  FROM usage_raw r JOIN customers c ON c.id=r.user_id LEFT JOIN customer_workspaces w ON w.id=r.workspace_id
   LEFT JOIN LATERAL (SELECT plan_key FROM subscriptions WHERE user_id=r.user_id ORDER BY (subscription_status='active') DESC,plan_allowance DESC NULLS LAST LIMIT 1) s ON true
 ),
 invites AS (
  SELECT i.id,i.workspace_id,w.owner_user_id user_id,i.invited_by,i.email,i.role,i.status,i.created_at,i.accepted_at,i.expires_at FROM customer_workspace_invites i JOIN customer_workspaces w ON w.id=i.workspace_id
  UNION ALL
  SELECT i.id,NULL,i.owner_user_id,i.invited_by,i.email,i.role,i.status,i.created_at,i.accepted_at,i.expires_at FROM customer_workspace_invitations i
  WHERE NOT EXISTS(SELECT 1 FROM customer_workspace_invites n WHERE n.id=i.id)
 ),
 scoped_users AS (
  SELECT c.* FROM customers c WHERE ($5::text='' OR c.id=$5)
   AND ($4::text='' OR EXISTS(SELECT 1 FROM subscriptions s WHERE s.user_id=c.id AND (s.plan_key=$4 OR $4='free' AND s.plan_code='free')))
   AND ($6::text='' OR EXISTS(SELECT 1 FROM customer_workspaces w WHERE w.id=$6 AND w.owner_user_id=c.id))
   AND ($7::text='' OR EXISTS(SELECT 1 FROM ai_projects p LEFT JOIN customer_workspaces w ON w.id=p.workspace_id WHERE p.id=$7 AND (p.owner_user_id=c.id OR w.owner_user_id=c.id)))
 ),
 scoped_wallets AS (
  SELECT s.* FROM subscriptions s JOIN scoped_users c ON c.id=s.user_id
  WHERE ($6::text='' OR s.id=$6) AND ($4::text='' OR s.plan_key=$4 OR $4='free' AND s.plan_code='free')
   AND ($7::text='' OR s.id=(SELECT workspace_id FROM ai_projects WHERE id=$7))
 ),
 scoped_workspace_history AS (
  SELECT w.id,w.owner_user_id,w.created_at FROM customer_workspaces w JOIN customers c ON c.id=w.owner_user_id
  WHERE ($5::text='' OR w.owner_user_id=$5) AND ($6::text='' OR w.id=$6)
   AND ($4::text='' OR 'workspace:'||w.plan_code=$4 OR $4='free' AND w.plan_code='free')
   AND ($7::text='' OR w.id=(SELECT workspace_id FROM ai_projects WHERE id=$7))
 ),
 scoped_projects AS (
  SELECT p.*,CASE WHEN p.deleted_at IS NOT NULL THEN 'deleted' WHEN s.status='published' THEN 'published' ELSE 'draft' END project_status
  FROM ai_projects p JOIN customers c ON c.id=p.owner_user_id LEFT JOIN sites s ON s.id=p.site_id
  WHERE ($5::text='' OR p.owner_user_id=$5) AND ($6::text='' OR p.workspace_id=$6) AND ($7::text='' OR p.id=$7)
   AND ($4::text='' OR EXISTS(SELECT 1 FROM scoped_wallets sw WHERE sw.id=p.workspace_id) OR p.workspace_id IS NULL)
 ),
 scoped_usage AS (
  SELECT u.* FROM usage u JOIN scoped_users c ON c.id=u.user_id
  WHERE ($6::text='' OR u.workspace_id=$6) AND ($7::text='' OR u.project_id=$7)
   AND ($4::text='' OR u.plan_key=$4 OR $4='free' AND u.plan_key IN ('workspace:free','account:free'))
 ),
 scoped_payments AS (
  SELECT p.* FROM payments p JOIN customers c ON c.id=p.user_id WHERE ($5::text='' OR p.user_id=$5) AND ($6::text='' OR p.workspace_id=$6)
   AND ($4::text='' OR p.plan_key=$4) AND $7::text=''
 ),
 scoped_invites AS (
  SELECT i.* FROM invites i JOIN scoped_users c ON c.id=i.user_id WHERE ($6::text='' OR i.workspace_id=$6) AND $7::text=''
 ),
 period_usage AS (SELECT * FROM scoped_usage WHERE created_at>=(SELECT start_at FROM clock) AND created_at<(SELECT end_at FROM clock)),
 period_payments AS (SELECT * FROM scoped_payments WHERE event_at>=(SELECT start_at FROM clock) AND event_at<(SELECT end_at FROM clock))
`;

export const tableQueries = {
  users: `SELECT c.id,c.name,c.email,c.status,c.created_at,c.last_active_at,
  (SELECT string_agg(DISTINCT s.plan_key,', ') FROM scoped_wallets s WHERE s.user_id=c.id) plan,
  COALESCE((SELECT string_agg(DISTINCT s.subscription_status,', ') FROM scoped_wallets s WHERE s.user_id=c.id),'unavailable') subscription_status,
  (SELECT CASE WHEN bool_or(s.plan_allowance IS NULL) THEN NULL ELSE SUM(s.daily_limit+s.plan_allowance)::float END FROM scoped_wallets s WHERE s.user_id=c.id) credit_allowance,
  NULL::numeric usage_percentage,
  (SELECT COALESCE(SUM(s.remaining),0)::float FROM scoped_wallets s WHERE s.user_id=c.id) remaining,
  (SELECT COALESCE(SUM(u.credits),0)::float FROM period_usage u WHERE u.user_id=c.id) credits_used,
  (SELECT COUNT(*)::int FROM scoped_wallets w WHERE w.user_id=c.id AND w.source='workspace') workspaces,
  (SELECT COUNT(*)::int FROM scoped_projects p WHERE p.owner_user_id=c.id) projects,
  (SELECT COUNT(*)::int FROM scoped_invites i WHERE i.invited_by=c.id) invited_members,
  (SELECT COALESCE(SUM(p.amount_paise),0)::float/100 FROM scoped_payments p WHERE p.user_id=c.id AND p.verified) total_paid
 FROM scoped_users c`,
  subscriptions: `SELECT s.id,s.user_id,u.name owner,u.email,s.name,s.plan_key plan,s.source,s.billing_interval,s.subscription_status status,
  s.plan_started_at created_at,s.plan_expires_at expires_at,s.available_until,s.daily_limit,s.plan_allowance,s.remaining::float remaining,
  s.daily_remaining::float daily_remaining,s.subscription_credits::float plan_balance,s.topup_credits::float topup_balance,s.rollover_credits::float rollover_balance,
  (date_trunc('day',(SELECT now FROM clock) AT TIME ZONE 'UTC')+interval '1 day') AT TIME ZONE 'UTC' daily_reset_at,
  (SELECT COUNT(*)::int FROM payments p WHERE p.user_id=s.user_id AND p.verified AND p.kind='plan' AND (p.workspace_id=s.id OR s.source='account' AND p.workspace_id IS NULL)) confirmed_purchases
 FROM scoped_wallets s JOIN customers u ON u.id=s.user_id`,
  workspaces: `SELECT s.id,s.name,s.user_id,u.name owner,u.email,s.plan_key plan,s.status,s.created_at,s.remaining::float remaining,
  (SELECT COUNT(*)::int FROM customer_workspace_access a WHERE a.workspace_id=s.id) members,
  (SELECT COUNT(*)::int FROM invites i WHERE i.workspace_id=s.id) invitations,
  (SELECT COUNT(*)::int FROM invites i WHERE i.workspace_id=s.id AND i.status='accepted') accepted,
  (SELECT COUNT(*)::int FROM invites i WHERE i.workspace_id=s.id AND i.status='pending' AND i.expires_at>(SELECT now FROM clock)) pending,
  (SELECT COUNT(*)::int FROM scoped_projects p WHERE p.workspace_id=s.id AND p.deleted_at IS NULL) projects,
  (SELECT COALESCE(SUM(credits),0)::float FROM period_usage x WHERE x.workspace_id=s.id) credits_used
 FROM scoped_wallets s JOIN customers u ON u.id=s.user_id WHERE s.source='workspace'`,
  projects: `SELECT p.id,p.name,p.owner_user_id user_id,u.name owner,u.email,COALESCE((to_jsonb(p)->'memory'->>'adminBlocked')::boolean,false) website_blocked,p.workspace_id,w.name workspace,
  COALESCE(
    (SELECT 'https://'||d.hostname FROM customer_workspace_domains d WHERE d.project_id=p.id AND d.status IN ('connected','published') AND d.ssl_status='active' ORDER BY d.published_at DESC NULLS LAST LIMIT 1),
    (SELECT d.url FROM ai_deployments d WHERE d.project_id=p.id AND d.status='ready' ORDER BY d.completed_at DESC NULLS LAST,d.id DESC LIMIT 1),
    '/api/admin/project-preview/'||p.id
  ) website_url,p.created_at,p.updated_at,p.project_status status,
  (SELECT COALESCE(SUM(x.credits),0)::float FROM period_usage x WHERE x.project_id=p.id) credits_used,
  (SELECT COUNT(*)::int FROM period_usage x WHERE x.project_id=p.id) operations
 FROM scoped_projects p JOIN customers u ON u.id=p.owner_user_id LEFT JOIN customer_workspaces w ON w.id=p.workspace_id`,
  credits: `SELECT MIN(x.id) id,x.user_id,u.name "user",u.email,x.actor_id,a.name actor,x.workspace_id,w.name workspace,
  CASE WHEN COUNT(DISTINCT x.project_id)=1 THEN MAX(x.project_id) END project_id,
  CASE WHEN COUNT(DISTINCT x.project_id)=1 THEN MAX(x.project_name)
   WHEN COUNT(DISTINCT x.project_id)>1 THEN COUNT(DISTINCT x.project_id)::text||' projects'
   ELSE 'Unattributed operations' END project,
  x.plan_key plan,x.operation,x.action,SUM(x.credits)::float credits,MAX(x.created_at) created_at,
  CASE WHEN COUNT(DISTINCT x.source)=1 THEN MAX(x.source) ELSE 'combined' END source,
  NULL::numeric balance_after,COUNT(*)::int events
 FROM period_usage x JOIN customers u ON u.id=x.user_id LEFT JOIN users a ON a.id=x.actor_id LEFT JOIN customer_workspaces w ON w.id=x.workspace_id
 GROUP BY x.user_id,u.name,u.email,x.actor_id,a.name,x.workspace_id,w.name,x.plan_key,x.operation,x.action`,
  payments: `SELECT p.id,p.user_id,u.name "user",u.email,p.workspace_id,w.name workspace,p.plan_key plan,p.kind,
  p.amount_paise::float/100 amount,p.currency,CASE WHEN p.status='paid' AND NOT p.verified THEN 'unverified' ELSE p.status END status,p.status recorded_status,p.verified,p.created_at,p.paid_at,p.event_at,p.method,p.order_id,p.provider_payment_id,p.billing_interval,p.source
 FROM period_payments p JOIN customers u ON u.id=p.user_id LEFT JOIN customer_workspaces w ON w.id=p.workspace_id`,
  invitations: `SELECT i.id,i.workspace_id,w.name workspace,i.user_id,i.invited_by,u.name invited_by_name,i.email,i.role,
  CASE WHEN i.status='pending' AND i.expires_at<=(SELECT now FROM clock) THEN 'expired' ELSE i.status END status,i.created_at,i.accepted_at,i.expires_at
 FROM scoped_invites i LEFT JOIN customer_workspaces w ON w.id=i.workspace_id JOIN users u ON u.id=i.invited_by`,
  members: `SELECT a.id,a.workspace_id,w.name workspace,a.user_id,u.name,u.email,a.role,a.joined_at created_at,a.monthly_credit_limit::float monthly_credit_limit
 FROM customer_workspace_access a JOIN scoped_wallets w ON w.id=a.workspace_id JOIN users u ON u.id=a.user_id`,
} as const;
