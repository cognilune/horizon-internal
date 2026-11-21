import { requireAdmin } from "@/lib/auth";
import { apiError, json, PublicError } from "@/lib/db";
import { creatorPayoutSubmissions } from "@/lib/kyc";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const params = new URL(request.url).searchParams,
      page = Number(params.get("page") || 0);
    if (
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page > 100000
    )
      throw new PublicError("Invalid submission filter.", 422);
    return json(await creatorPayoutSubmissions(page));
  } catch (e) {
    return apiError(e);
  }
}
