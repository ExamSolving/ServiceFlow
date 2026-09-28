export default function Loading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-6">
      <span className="sr-only">Loading workspace…</span>
      <div className="h-4 w-32 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="h-8 w-48 animate-pulse rounded bg-muted motion-reduce:animate-none" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        {[0, 1].map((item) => (
          <div
            key={item}
            className="h-72 animate-pulse rounded-xl border border-border bg-card motion-reduce:animate-none"
          />
        ))}
      </div>
    </div>
  );
}
