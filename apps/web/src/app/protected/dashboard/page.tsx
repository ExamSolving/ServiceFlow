import { requireAuth } from "@/src/lib/auth/require-auth";

import { LogoutButton } from "@/src/features/auth/components/logout-button";

export default async function DashboardPage() {
  const session = await requireAuth();

  return (
    <main className="p-10">
      <h1 className="text-3xl font-semibold">ServiceFlow Dashboard</h1>

      <p className="mt-4">{session.email}</p>

      <div className="mt-6">
        <LogoutButton />
      </div>
    </main>
  );
}
