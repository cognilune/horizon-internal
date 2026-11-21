import { requireAdmin } from "@/lib/auth";
import { apiError, json } from "@/lib/db";
import { creatorPayoutDetails } from "@/lib/kyc";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdmin();
    const { id } = await params;
    return json({ submission: await creatorPayoutDetails(id) });
  } catch (error) {
    return apiError(error);
  }
}
