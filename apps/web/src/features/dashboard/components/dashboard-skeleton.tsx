import { Card } from "@/components/ui/card";

const shimmer = "animate-pulse bg-muted motion-reduce:animate-none";

export function DashboardSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading dashboard"
      aria-busy="true"
      className="space-y-6"
    >
      <span className="sr-only">Loading dashboard…</span>
      <div className="space-y-3">
        <div className={`h-3 w-28 rounded ${shimmer}`} />
        <div className={`h-8 w-52 rounded ${shimmer}`} />
      </div>
      <Card className={`h-20 ${shimmer}`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <Card key={item} className={`h-36 ${shimmer}`} />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card className={`h-72 ${shimmer}`} />
        <Card className={`h-72 ${shimmer}`} />
      </div>
    </div>
  );
}
