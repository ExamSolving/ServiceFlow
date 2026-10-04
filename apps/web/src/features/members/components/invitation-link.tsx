"use client";

import { Check, Copy } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

// Invitation links are shown once; ServiceFlow does not send email yet, so the
// administrator shares the link with the invitee directly.
const noop = () => () => {};
const browserOrigin = () => window.location.origin;
const serverOrigin = () => "";

export function InvitationLink({ acceptPath, email }: { acceptPath: string; email: string }) {
  // The origin is only known in the browser; render the path alone on the server.
  const origin = useSyncExternalStore(noop, browserOrigin, serverOrigin);
  const url = `${origin}${acceptPath}`;
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3" role="status">
      <p className="text-xs font-medium">Invitation link for {email}</p>
      <p className="text-xs leading-5 text-muted-foreground">Share this link with them. It can be used once, within 7 days, by an account with this email. It won’t be shown again.</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input readOnly value={url} aria-label="Invitation link" className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-xs" onFocus={(event) => event.currentTarget.select()} />
        <Button type="button" size="sm" variant="outline" onClick={() => void copy()}>{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? "Copied" : "Copy link"}</Button>
      </div>
    </div>
  );
}
