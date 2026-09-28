import { Card } from "@/components/ui/card";

const shimmer = "animate-pulse bg-muted motion-reduce:animate-none";

export function OrganizationSettingsSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading organization settings" className="space-y-8">
      <span className="sr-only">Loading organization settings…</span>
      <div className="space-y-3">
        <div className={`h-3 w-40 rounded ${shimmer}`} />
        <div className={`h-9 w-72 rounded ${shimmer}`} />
        <div className={`h-4 w-full max-w-xl rounded ${shimmer}`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Card className={`h-72 ${shimmer}`} />
        <Card className={`h-72 ${shimmer}`} />
      </div>
      <Card className={`h-24 ${shimmer}`} />
    </div>
  );
}
