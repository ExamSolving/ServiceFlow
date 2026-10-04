"use client";

import { LoaderCircle, MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function JobNoteForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const text = body.trim();
    if (!text || saving) return;
    setSaving(true);
    setError(null);
    const id = requestId ?? crypto.randomUUID();
    if (!requestId) setRequestId(id);
    try {
      const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/notes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: text, requestId: id }) });
      if (response.redirected || response.status === 401) { setError("Your session expired. Sign in in another tab, then try again."); return; }
      if (!response.ok) { setError(response.status === 403 ? "You don’t have permission to add notes." : "We couldn’t save this note. Please try again."); return; }
      setBody("");
      setRequestId(null);
      router.refresh();
    } catch {
      setError("We couldn’t reach ServiceFlow. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-2" onSubmit={(event) => { event.preventDefault(); void submit(); }} aria-busy={saving}>
      <label htmlFor="job-note" className="sr-only">New note</label>
      <textarea id="job-note" rows={3} maxLength={2000} value={body} disabled={saving} onChange={(event) => setBody(event.target.value)} placeholder="Add an internal note for your team…" className="w-full resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{body.length}/2,000</p>
        <Button type="submit" size="sm" disabled={saving || !body.trim()}>{saving ? <LoaderCircle aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : <MessageSquarePlus aria-hidden="true" />}Add note</Button>
      </div>
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
