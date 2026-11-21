import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PublicError } from "@/lib/db";
import Dashboard from "@/components/Dashboard";
export const dynamic = "force-dynamic";
const sections = [
  "overview",
  "users",
  "internal-users",
  "plans",
  "workspaces",
  "projects",
  "storage",
  "database",
  "credits",
  "payments",
  "analytics",
  "settings",
];
export default async function DashboardPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.includes(section)) notFound();
  let admin;
  try {
    admin = await requireAdmin();
  } catch (error) {
    if (error instanceof PublicError && [401, 403].includes(error.status))
      redirect("/login");
    throw error;
  }
  if (section === "storage") {
    const origin = new URL(process.env.HORIZON_PUBLIC_ORIGIN ||
      (process.env.NODE_ENV === "production" ? "https://horizon.cognilune.com" : "http://localhost:3000"));
    if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost","127.0.0.1"].includes(origin.hostname)))
      throw new PublicError("The Horizon administration origin is unavailable.",503);
    redirect(new URL("/admin/storage", origin.origin).href);
  }
  return (
    <Dashboard
      key={section}
      section={section}
      admin={{ name: admin.name, email: admin.email }}
    />
  );
}
