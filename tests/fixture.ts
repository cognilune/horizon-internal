import { PGlite } from "@electric-sql/pglite";
import type { Query } from "../lib/db";
// Isolated, in-memory test records. Never loaded by the application or a production database.
export async function fixture() {
  const pg = new PGlite();
  await pg.exec(`
 SET TIME ZONE 'UTC';
 CREATE TABLE users(id text PRIMARY KEY,name text,email text,role text,status text,created_at timestamptz,last_login_at timestamptz);
 CREATE TABLE customer_account_sessions(id text,user_id text,last_seen_at timestamptz);
 CREATE TABLE customer_workspaces(id text PRIMARY KEY,name text,owner_user_id text,plan_code text,billing_interval text,status text,daily_limit numeric,daily_remaining numeric,last_refill_on date,subscription_credits numeric,topup_credits numeric,free_credits_until timestamptz,plan_started_at timestamptz,plan_expires_at timestamptz,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
 CREATE TABLE customer_billing_accounts(owner_user_id text,plan_code text,billing_interval text,plan_started_at timestamptz,plan_expires_at timestamptz,subscription_credits numeric,topup_credits numeric,updated_at timestamptz,rollover_credits numeric,rollover_expires_at timestamptz);
 CREATE TABLE customer_credit_wallets(owner_user_id text,daily_limit numeric,daily_remaining numeric,last_refill_on date,available_until timestamptz);
 CREATE TABLE customer_payments(id text,owner_user_id text,metadata jsonb,plan_code text,kind text,billing_interval text,amount_paise integer,currency text,status text,razorpay_order_id text,razorpay_payment_id text,created_at timestamptz,paid_at timestamptz);
 CREATE TABLE customer_workspace_payments(id text,workspace_id text,created_by text,plan_code text,billing_interval text,amount_paise integer,status text,razorpay_order_id text,razorpay_payment_id text,created_at timestamptz,paid_at timestamptz);
 CREATE TABLE customer_credit_reservations(id text,owner_user_id text,actor_user_id text,idempotency_key text,action text,amount numeric,status text,committed_at timestamptz,created_at timestamptz,project_id text);
 CREATE TABLE customer_workspace_credit_reservations(id text,workspace_id text,user_id text,idempotency_key text,action text,amount numeric,status text,committed_at timestamptz,created_at timestamptz);
 CREATE TABLE customer_credit_usage(id integer,owner_user_id text,actor_user_id text,project_id text,conversation_id text,project_name text,action text,credits numeric,created_at timestamptz,category text,metadata jsonb);
 CREATE TABLE customer_chat_conversations(id text,project_id text,workspace_id text,title text);
 CREATE TABLE customer_chat_messages(id text,project_id text,conversation_id text);
 CREATE TABLE ai_projects(id text,owner_user_id text,workspace_id text,site_id text,name text,created_at timestamptz,updated_at timestamptz,deleted_at timestamptz);
 CREATE TABLE sites(id text,status text);
 CREATE TABLE customer_workspace_invites(id text,workspace_id text,invited_by text,email text,role text,status text,created_at timestamptz,accepted_at timestamptz,expires_at timestamptz);
 CREATE TABLE customer_workspace_invitations(id text,owner_user_id text,invited_by text,email text,role text,status text,created_at timestamptz,accepted_at timestamptz,expires_at timestamptz);
 CREATE TABLE customer_workspace_access(id text,workspace_id text,user_id text,role text,joined_at timestamptz,monthly_credit_limit numeric);
 INSERT INTO users VALUES
 ('alice','Alice Test','alice@example.test','customer','active','2026-10-01','2026-10-20'),
 ('bob','Bob Test','bob@example.test','customer','active','2026-10-02','2026-10-15'),
 ('carol','Carol Legacy','carol@example.test','customer','suspended','2026-08-01',NULL),
 ('admin','Test Admin','admin@example.test','admin','active','2026-01-01','2026-10-22');
 INSERT INTO customer_workspaces VALUES
 ('w1','Design workspace','alice','pro','monthly','active',5,2,'2026-10-22',30,10,'2026-10-31','2026-10-01','2026-11-01','2026-10-01','2026-10-21',NULL),
 ('w2','Engineering workspace','bob','business','yearly','active',5,5,'2026-10-21',80,0,'2026-09-01','2026-08-01','2026-10-01','2026-08-01','2026-10-21',NULL);
 INSERT INTO customer_billing_accounts VALUES ('alice','starter','monthly','2026-10-01','2026-11-01',30,10,'2026-10-21',0,NULL),('carol','free',NULL,NULL,NULL,0,0,'2026-10-01',0,NULL);
 INSERT INTO customer_credit_wallets VALUES ('alice',5,5,'2026-10-22','2026-10-31'),('carol',5,5,'2026-10-22','2026-10-31');
 INSERT INTO sites VALUES ('s1','published');
 INSERT INTO ai_projects VALUES ('p1','alice','w1','s1','Brand studio','2026-10-05','2026-10-21',NULL),('p2','bob','w2',NULL,'Analytics portal','2026-10-02','2026-10-20',NULL),('deleted','alice','w1',NULL,'Deleted project','2026-10-01','2026-10-02','2026-10-03');
 INSERT INTO customer_chat_conversations VALUES ('c1','p1','w1','Brand studio');
 INSERT INTO customer_chat_messages VALUES ('m1','p1','c1'),('m2','p1','c1'),('m3','p1','c1');
 INSERT INTO customer_workspace_credit_reservations VALUES
 ('r1','w1','alice','m1','Build',3,'committed','2026-10-20','2026-10-20'),
 ('r2','w1','alice','m2','Plan',2,'committed','2026-10-21','2026-10-21'),
 ('r3','w1','alice','m3','Build',7,'refunded',NULL,'2026-10-21'),
 ('r4','w1','alice','m4','Build',10,'reserved',NULL,'2026-10-21');
 INSERT INTO customer_credit_usage VALUES (1,'alice','alice','p1','c1','Brand studio','Build',3,'2026-10-20','build','{"reservationId":"r1"}'),(2,'bob','bob','p2',NULL,'Analytics portal','Build',4,'2026-10-21','build','{}');
 INSERT INTO customer_payments VALUES
 ('pay1','alice','{"workspace_id":"w1"}','starter','plan','monthly',59900,'INR','paid','order1','provider1','2026-10-01','2026-10-01'),
 ('pay2','bob','{"workspace_id":"w2"}','pro','plan','monthly',149900,'INR','created','order2',NULL,'2026-10-02',NULL),
 ('bad','bob','{"workspace_id":"w2"}','pro','plan','monthly',149900,'INR','paid','order3',NULL,'2026-10-03','2026-10-03'),
 ('refund','alice','{"workspace_id":"w1"}','starter','plan','monthly',59900,'INR','refunded','order4','provider4','2026-10-04','2026-10-04');
 INSERT INTO customer_workspace_payments VALUES ('duplicate','w1','alice','pro','monthly',59900,'paid','order1','provider1','2026-10-01','2026-10-01');
 INSERT INTO customer_workspace_access VALUES ('access1','w1','alice','owner','2026-10-01',NULL),('access2','w1','bob','editor','2026-10-02',20);
 INSERT INTO customer_workspace_invites VALUES ('i1','w1','alice','bob@example.test','editor','accepted','2026-10-01','2026-10-02','2026-10-08'),('i2','w1','alice','pending@example.test','viewer','pending','2026-10-10',NULL,'2026-10-12');
 `);
  const query: Query = async (text, params = []) =>
    (await pg.query(text, params)).rows as never;
  return { pg, query };
}
