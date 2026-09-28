import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { BreadcrumbItem } from "../types/shell";

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumbs: BreadcrumbItem[];
  actions?: React.ReactNode;
}) {
  return (
    <header className="mb-8">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {breadcrumbs.map((item, index) => (
            <li
              key={`${item.label}-${index}`}
              className="flex items-center gap-2"
            >
              {index > 0 && (
                <ChevronRight className="size-3" aria-hidden="true" />
              )}
              {item.href && index < breadcrumbs.length - 1 ? (
                <Link
                  href={item.href}
                  className="rounded hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={
                    index === breadcrumbs.length - 1 ? "page" : undefined
                  }
                >
                  {item.label}
                </span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        )}
      </div>
    </header>
  );
}
