import { requireAdmin } from "@/lib/auth";
import { apiError } from "@/lib/db";
import { openEvidence } from "@/lib/kyc";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; slot: string }> },
) {
  try {
    const admin = await requireAdmin(),
      { id, slot } = await params;
    const doc = await openEvidence(admin.userId, id, slot);
    return new Response(doc.bytes, {
      headers: {
        "Content-Type": doc.mime,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Content-Security-Policy":
          "sandbox; default-src 'none'; frame-ancestors 'none'",
        "Content-Disposition":
          doc.mime === "application/pdf"
            ? 'attachment; filename="kyc-document.pdf"'
            : "inline",
      },
    });
  } catch (e) {
    return apiError(e);
  }
}
