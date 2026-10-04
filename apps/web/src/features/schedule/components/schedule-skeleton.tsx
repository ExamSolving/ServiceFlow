import { Card } from "@/components/ui/card";

const shimmer = "animate-pulse rounded bg-muted motion-reduce:animate-none";

export function ScheduleSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading schedule" className="space-y-6">
      <span className="sr-only">Loading schedule…</span>
      <div className="space-y-3"><div className={`h-3 w-40 ${shimmer}`} /><div className={`h-9 w-56 ${shimmer}`} /><div className={`h-4 w-full max-w-lg ${shimmer}`} /></div>
      <Card className="p-4"><div className="grid gap-3 lg:grid-cols-[8rem_1fr_10rem_14rem_6rem]">{Array.from({ length: 5 }, (_, index) => <div key={index} className={`h-10 ${shimmer}`} />)}</div></Card>
      <Card className="gap-0 py-0">
        <div className="border-b border-border p-5"><div className={`h-4 w-48 ${shimmer}`} /></div>
        <div className="divide-y divide-border">{Array.from({ length: 3 }, (_, index) => <div key={index} className="grid gap-3 p-5 lg:grid-cols-[14rem_1fr]"><div className={`h-9 w-40 ${shimmer}`} /><div className="grid gap-2 sm:grid-cols-3"><div className={`h-16 ${shimmer}`} /><div className={`h-16 ${shimmer}`} /></div></div>)}</div>
      </Card>
    </div>
  );
}
