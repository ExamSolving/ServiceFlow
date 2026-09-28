import { requireAuth } from "@/src/lib/auth/require-auth";

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <main className="p-10">
      <h1 className="text-3xl font-semibold">ServiceFlow Dashboard</h1>

      <p className="mt-4 text-muted-foreground">Signed in as:</p>

      <p className="font-medium">{session.email}</p>

      <p className="mt-2 text-sm">UID: {session.uid}</p>
    </main>
  );
}
