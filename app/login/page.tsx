import Login from "@/components/Login";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ googleError?: string }>;
}) {
  const { googleError = "" } = await searchParams;
  return <Login initialError={googleError} />;
}
