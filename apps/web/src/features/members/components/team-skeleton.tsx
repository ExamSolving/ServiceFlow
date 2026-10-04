import { Card } from "@/components/ui/card";

const shimmer = "animate-pulse rounded bg-muted motion-reduce:animate-none";

export function TeamSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading team" className="space-y-8">
      <span className="sr-only">Loading team…</span>
      <div className="space-y-3">
        <div className={`h-3 w-40 max-w-full ${shimmer}`} />
        <div className={`h-9 w-48 max-w-full ${shimmer}`} />
        <div className={`h-4 w-full max-w-lg ${shimmer}`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(20rem,1fr)]">
        <Card className="gap-0 py-0">
          <div className="border-b border-border p-5"><div className={`h-4 w-32 ${shimmer}`} /></div>
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center justify-between gap-5 p-5">
                <div className="w-1/2 space-y-2"><div className={`h-4 w-full max-w-48 ${shimmer}`} /><div className={`h-3 w-40 ${shimmer}`} /></div>
                <div className={`h-9 w-36 ${shimmer}`} />
              </div>
            ))}
          </div>
        </Card>
        <Card className="space-y-4 p-5"><div className={`h-4 w-40 ${shimmer}`} /><div className={`h-10 ${shimmer}`} /><div className={`h-10 ${shimmer}`} /><div className={`h-10 w-40 ${shimmer}`} /></Card>
      </div>
    </div>
  );
}
