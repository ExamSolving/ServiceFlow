"use client";

import { Check, LoaderCircle, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { serviceRequestIdSchema } from "../schemas/service-request.schema";
import type { ServiceRequestOption } from "../types/service-request";

export const referenceOptionSchema = z.object({ id: serviceRequestIdSchema, name: z.string().min(1), secondary: z.string().optional() });

type Kind = "customers" | "serviceTypes" | "technicians" | "products";
type Status = { kind: "idle" | "loading" | "error" | "session"; message?: string };

// Searches the tenant's active customers or service types through the server, so the
// browser never receives records outside the session's organization.
export function ReferencePicker<T extends ServiceRequestOption = ServiceRequestOption>({ kind, endpoint = "/api/service-requests/options", fieldId, label, noun, hint, selected, onSelect, disabled, error, optionSchema, required = true }: {
  kind: Kind;
  /** Options endpoint; defaults to the service request pickers. Must return { options, nextCursor }. */
  endpoint?: string;
  fieldId: string;
  label: string;
  noun: string;
  hint: string;
  selected: T | null;
  onSelect: (option: T | null) => void;
  disabled?: boolean;
  error?: string;
  /** Validates each option when the endpoint returns more than id, name and secondary. */
  optionSchema?: z.ZodType<T>;
  required?: boolean;
}) {
  const optionsSchema = useMemo(() => z.object({ options: z.array(optionSchema ?? (referenceOptionSchema as unknown as z.ZodType<T>)), nextCursor: z.string().nullable() }), [optionSchema]);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<T[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [loaded, setLoaded] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const searchId = `${fieldId}-search`;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  async function load(search: string, cursor?: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setStatus({ kind: "loading" });
    try {
      const params = new URLSearchParams({ kind, q: search });
      if (cursor) params.set("cursor", cursor);
      const response = await fetch(`${endpoint}?${params.toString()}`, { signal: current.signal, headers: { accept: "application/json" } });
      if (current.signal.aborted) return;
      if (response.redirected || response.status === 401) {
        setStatus({ kind: "session", message: "Your session has expired. Sign in again in another tab, then search again." });
        return;
      }
      const parsed = optionsSchema.safeParse(await response.json().catch(() => null));
      if (!response.ok || !parsed.success) {
        setStatus({ kind: "error", message: response.status === 403 ? `You don’t have permission to choose a ${noun}.` : `We couldn’t load ${noun} options. Try again.` });
        return;
      }
      setOptions((previous) => cursor ? [...previous, ...parsed.data.options] : parsed.data.options);
      setNextCursor(parsed.data.nextCursor);
      setLoaded(true);
      setStatus({ kind: "idle" });
    } catch (caught) {
      if (current.signal.aborted || (caught instanceof DOMException && caught.name === "AbortError")) return;
      setStatus({ kind: "error", message: "We couldn’t reach ServiceFlow. Check your connection and try again." });
    }
  }

  useEffect(() => {
    if (selected) return;
    const timer = setTimeout(() => { void load(query); }, loaded ? 250 : 0);
    return () => clearTimeout(timer);
    // `load` is stable for the lifetime of the picker; only the query and selection drive fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, selected]);

  useEffect(() => () => controller.current?.abort(), []);

  if (selected) {
    return (
      <div className="space-y-2">
        <Label htmlFor={`${fieldId}-selected`}>{label} {required && <span aria-hidden="true" className="text-muted-foreground">*</span>}</Label>
        <div id={`${fieldId}-selected`} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-describedby={error ? errorId : hintId}>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium break-words"><Check aria-hidden="true" className="size-4 shrink-0 text-primary" />{selected.name}</p>
            {selected.secondary && <p className="mt-1 text-xs text-muted-foreground break-words">{selected.secondary}</p>}
          </div>
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { setQuery(""); onSelect(null); }}>Change {noun}</Button>
        </div>
        {error ? <p id={errorId} role="alert" className="text-xs leading-5 text-destructive">{error}</p> : <p id={hintId} className="text-xs leading-5 text-muted-foreground">{hint}</p>}
      </div>
    );
  }

  const busy = status.kind === "loading";
  return (
    <div className="space-y-2">
      <Label htmlFor={searchId}>{label} {required && <span aria-hidden="true" className="text-muted-foreground">*</span>}</Label>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 z-10 size-4 text-muted-foreground" />
        <Input id={searchId} type="search" autoComplete="off" maxLength={120} value={query} disabled={disabled} placeholder={`Search ${noun}s by name…`} className="pl-9"
          aria-invalid={Boolean(error)} aria-describedby={error ? errorId : hintId} aria-controls={`${fieldId}-options`} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {error ? <p id={errorId} role="alert" className="text-xs leading-5 text-destructive">{error}</p> : <p id={hintId} className="text-xs leading-5 text-muted-foreground">{hint}</p>}
      <div id={`${fieldId}-options`} className="rounded-lg border border-border" aria-busy={busy}>
        {status.kind === "error" || status.kind === "session" ? (
          <div className="space-y-3 p-4">
            <p role="alert" className="text-sm text-destructive">{status.message}</p>
            {status.kind === "error" && <Button type="button" variant="outline" size="sm" onClick={() => { void load(query); }}>Try again</Button>}
          </div>
        ) : options.length ? (
          <ul className="divide-y divide-border">
            {options.map((option) => (
              <li key={option.id}>
                <button type="button" disabled={disabled} onClick={() => onSelect(option)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60">
                  <span className="min-w-0"><span className="block font-medium break-words">{option.name}</span>{option.secondary && <span className="mt-0.5 block text-xs text-muted-foreground break-words">{option.secondary}</span>}</span>
                  <span className="shrink-0 text-xs font-medium text-primary">Choose</span>
                </button>
              </li>
            ))}
          </ul>
        ) : loaded && !busy ? (
          <div className="p-3">
            <EmptyState icon={Search} title={query ? `No ${noun}s match` : `No active ${noun}s yet`} description={query ? "Try the beginning of a different name." : `Add an active ${noun} first, then return to log this request.`} className="min-h-32" />
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-2">
          <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {busy ? <span className="inline-flex items-center gap-1.5"><LoaderCircle aria-hidden="true" className="size-3.5 animate-spin motion-reduce:animate-none" />Searching…</span>
              : loaded ? `${options.length} ${options.length === 1 ? noun : `${noun}s`} shown${nextCursor ? " · More available" : ""}` : ""}
          </p>
          {nextCursor && !busy && <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => { void load(query, nextCursor); }}>Show more</Button>}
        </div>
      </div>
    </div>
  );
}
