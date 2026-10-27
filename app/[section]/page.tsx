import { redirect, notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { PublicError } from "@/lib/db";
import Dashboard from "@/components/Dashboard";
export const dynamic = "force-dynamic";
const sections = [
  "overview",
  "users",
  "plans",
  "workspaces",
  "projects",
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
  return (
    <Dashboard
      key={section}
      section={section}
      admin={{ name: admin.name, email: admin.email }}
    />
  );
}
