import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PublicError } from "@/lib/db";
import Dashboard from "@/components/Dashboard";
import { ReviewQueue } from "./ReviewQueue";
import "./kyc.css";

export default async function KycPage() {
  let admin;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof PublicError && [401, 403].includes(e.status))
      redirect("/login");
    throw e;
  }
  return (
    <Dashboard
      section="kyc"
      admin={{ name: admin.name, email: admin.email }}
    >
      <ReviewQueue />
    </Dashboard>
  );
}
