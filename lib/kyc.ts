import { createDecipheriv } from "node:crypto";
import { getDb, PublicError } from "./db";

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const stages = [
  "pending",
  "under_review",
  "verified",
  "rejected",
] as const;

type Photo = { type: string; base64: string };
export type CreatorPayoutApplication = {
  fullName?: string;
  businessName?: string;
  businessType?: string;
  registeredAddress?: string;
  phone?: string;
  businessDetails?: string;
  email?: string;
  beneficiary?: string;
  accountNumber?: string;
  ifsc?: string;
  consent?: string;
  identity?: {
    type?: string;
    number?: string;
    front?: Photo;
    back?: Photo;
    base64?: string;
  };
  legacyIdentity?: Photo;
  business?: Photo;
  pan?: string;
};

type CreatorProfileBlob = {
  id: string;
  workspace_id: string;
  project_id: string;
  environment: string;
  sealed_application: Uint8Array;
};

function documentKey(name: "KYC_DOCUMENT_KEY_V1" | "KYC_DOCUMENT_KEY_LEGACY") {
  const value = process.env[name] || "";
  return /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : null;
}

export function decodeCreatorApplication(row: CreatorProfileBlob) {
  const current = documentKey("KYC_DOCUMENT_KEY_V1");
  if (!current)
    throw new PublicError("The payout document storage key is unavailable.", 503);
  const keys = [current], legacy = documentKey("KYC_DOCUMENT_KEY_LEGACY");
  if (legacy && !legacy.equals(current)) keys.push(legacy);
  const bytes = Buffer.from(row.sealed_application);
  for (const key of keys) {
    try {
      const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
      cipher.setAuthTag(bytes.subarray(12, 28));
      cipher.setAAD(
        Buffer.from(
          [row.id, row.workspace_id, row.project_id, row.environment].join("/"),
        ),
      );
      return JSON.parse(
        Buffer.concat([
          cipher.update(bytes.subarray(28)),
          cipher.final(),
        ]).toString("utf8"),
      ) as CreatorPayoutApplication;
    } catch {
      // Try the explicitly configured legacy key before marking this row unreadable.
    }
  }
  throw new PublicError("Saved payout details could not be decrypted.", 503);
}

function creatorDocumentSlots(application: CreatorPayoutApplication) {
  const slots: string[] = [];
  if (application.identity?.front?.base64) slots.push("front");
  if (application.identity?.back?.base64) slots.push("back");
  if (application.identity?.base64 || application.legacyIdentity?.base64)
    slots.push("identity");
  if (application.business?.base64) slots.push("business");
  return slots;
}

export async function creatorPayoutSubmissions(page: number) {
  const rows = await getDb(false)`SELECT p.id,p.workspace_id,p.project_id,p.environment,p.status,p.submitted_at,p.sealed_application,
    w.name AS workspace,project.name AS project,u.name AS member_name,u.email AS member_email
    FROM creator_payout_profiles p
    LEFT JOIN customer_workspaces w ON w.id=p.workspace_id
    LEFT JOIN ai_projects project ON project.id=p.project_id
    LEFT JOIN users u ON u.id=p.submitted_by
    ORDER BY p.submitted_at DESC,p.id DESC LIMIT 26 OFFSET ${page * 25}`;
  const submissions = rows.slice(0, 25).map((row) => {
    try {
      const application = decodeCreatorApplication(row as CreatorProfileBlob);
      return {
        id: row.id,
        workspace: row.workspace || "Deleted workspace",
        project: row.project || "Deleted website",
        environment: row.environment,
        status: row.status,
        submitted_at: row.submitted_at,
        member_name: row.member_name || "Workspace member",
        member_email: row.member_email || "",
        full_name: application.fullName || "",
        business_name: application.businessName || "",
        contact_email: application.email || "",
        document_type: application.identity?.type || (application.pan ? "pan" : ""),
        slots: creatorDocumentSlots(application),
        details_error: "",
      };
    } catch {
      return {
        id: row.id,
        workspace: row.workspace || "Deleted workspace",
        project: row.project || "Deleted website",
        environment: row.environment,
        status: row.status,
        submitted_at: row.submitted_at,
        member_name: row.member_name || "Workspace member",
        member_email: row.member_email || "",
        slots: [],
        details_error:
          "Encrypted payout details could not be opened with the configured KYC key.",
      };
    }
  });
  return { rows: submissions, more: rows.length > 25 };
}

export async function creatorPayoutDetails(id: string) {
  if (!uuid.test(id)) throw new PublicError("Payout submission not found.", 404);
  const [row] = await getDb(false)`SELECT p.id,p.workspace_id,p.project_id,p.environment,p.status,p.submitted_at,p.sealed_application,
    w.name AS workspace,project.name AS project,u.name AS member_name,u.email AS member_email
    FROM creator_payout_profiles p
    LEFT JOIN customer_workspaces w ON w.id=p.workspace_id
    LEFT JOIN ai_projects project ON project.id=p.project_id
    LEFT JOIN users u ON u.id=p.submitted_by WHERE p.id=${id}`;
  if (!row) throw new PublicError("Payout submission not found.", 404);
  const application = decodeCreatorApplication(row as CreatorProfileBlob);
  return {
    id: row.id,
    workspace: row.workspace || "Deleted workspace",
    project: row.project || "Deleted website",
    environment: row.environment,
    status: row.status,
    submitted_at: row.submitted_at,
    member_name: row.member_name || "Workspace member",
    member_email: row.member_email || "",
    full_name: application.fullName || "",
    business_name: application.businessName || "",
    business_type: application.businessType || "",
    registered_address: application.registeredAddress || "",
    phone: application.phone || "",
    business_details: application.businessDetails || "",
    contact_email: application.email || "",
    beneficiary: application.beneficiary || "",
    account_number: application.accountNumber || "",
    ifsc: application.ifsc || "",
    document_type: application.identity?.type || (application.pan ? "pan" : ""),
    document_number: application.identity?.number || application.pan || "",
    consent: application.consent === "on",
    slots: creatorDocumentSlots(application),
  };
}

export async function openEvidence(
  actor: string,
  id: string,
  slot: string,
  sql = getDb(false),
) {
  if (
    !uuid.test(id) ||
    !["front", "back", "pan", "gst", "identity", "business"].includes(slot)
  )
    throw new PublicError("Document not found.", 404);
  return sql.begin(async (tx) => {
    const [creator] =
      await tx`SELECT p.id,p.workspace_id,p.project_id,p.environment,p.sealed_application
      FROM creator_payout_profiles p WHERE p.id=${id}
      AND EXISTS(SELECT 1 FROM users WHERE id=${actor} AND role='admin' AND status='active')`;
    if (creator) {
      const application = decodeCreatorApplication(creator as CreatorProfileBlob);
      const photo =
        slot === "front"
          ? application.identity?.front
          : slot === "back"
            ? application.identity?.back
            : slot === "identity"
              ? application.legacyIdentity ||
                (application.identity?.base64
                  ? {
                      type: "application/octet-stream",
                      base64: application.identity.base64,
                    }
                  : undefined)
              : slot === "business"
                ? application.business
                : undefined;
      if (
        !photo?.base64 ||
        !["image/jpeg", "image/png", "application/pdf"].includes(photo.type)
      )
        throw new PublicError("Document not found.", 404);
      return {
        bytes: new Uint8Array(Buffer.from(photo.base64, "base64")),
        mime: photo.type,
      };
    }
    const [d] =
      await tx`SELECT r.workspace_id,e.mime,e.sealed FROM workspace_kyc_evidence e
      JOIN workspace_kyc_requests r ON r.id=e.request_id WHERE r.id=${id} AND e.slot=${slot}
      AND EXISTS(SELECT 1 FROM users WHERE id=${actor} AND role='admin' AND status='active')`;
    if (!d) throw new PublicError("Document not found.", 404);
    const key = process.env.KYC_DOCUMENT_KEY_V1 || "";
    if (!/^[a-f0-9]{64}$/i.test(key))
      throw new PublicError("The document storage key is unavailable.", 503);
    const bytes = Buffer.from(d.sealed),
      cipher = createDecipheriv(
        "aes-256-gcm",
        Buffer.from(key, "hex"),
        bytes.subarray(0, 12),
      );
    cipher.setAuthTag(bytes.subarray(12, 28));
    cipher.setAAD(Buffer.from([id, d.workspace_id, slot, d.mime].join("/")));
    const clear = Buffer.concat([
      cipher.update(bytes.subarray(28)),
      cipher.final(),
    ]);
    await tx`INSERT INTO workspace_kyc_audit(request_id,actor_id,action) VALUES(${id},${actor},${"viewed_" + slot})`;
    return { bytes: new Uint8Array(clear), mime: String(d.mime) };
  });
}
