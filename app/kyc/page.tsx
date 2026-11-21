import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PublicError } from "@/lib/db";
import { ReviewQueue } from "./ReviewQueue";
import "./kyc.css";

export default async function KycPage() {
  try {
    await requireAdmin();
  } catch (e) {
    if (e instanceof PublicError && e.status === 401) redirect("/login");
    throw e;
  }
  return (
    <main className="kyc-review">
      <Link className="kyc-back" href="/overview">← Internal overview</Link>
      <header className="kyc-heading">
        <p className="eyebrow">HORIZON INTERNAL</p>
        <h1>KYC Management</h1>
        <p>
          KYC, business and payout details submitted through Cognilune Payment
          Gateway setup. New submissions appear automatically.
        </p>
      </header>
      <ReviewQueue />
    </main>
  );
}
