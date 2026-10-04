import { Card } from "@/components/ui/card";

const shimmer = "animate-pulse rounded bg-muted motion-reduce:animate-none";

export function ProductsSkeleton({ label = "products" }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={`Loading ${label}`} className="space-y-8">
      <span className="sr-only">Loading {label}…</span>
      <div className="space-y-3">
        <div className={`h-3 w-40 max-w-full ${shimmer}`} />
        <div className={`h-9 w-64 max-w-full ${shimmer}`} />
        <div className={`h-4 w-full max-w-lg ${shimmer}`} />
      </div>
      <Card className="gap-0 py-0">
        <div className="space-y-4 border-b border-border p-5">
          <div className={`h-4 w-40 ${shimmer}`} />
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem_10rem_7rem]">
            <div className={`h-10 ${shimmer}`} />
            <div className={`h-10 ${shimmer}`} />
            <div className={`h-10 ${shimmer}`} />
            <div className={`h-10 ${shimmer}`} />
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-5 p-5">
              <div className="w-1/2 space-y-2"><div className={`h-4 w-full max-w-52 ${shimmer}`} /><div className={`h-3 w-24 ${shimmer}`} /></div>
              <div className={`h-6 w-20 ${shimmer}`} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
