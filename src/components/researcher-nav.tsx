"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import type { Viewer } from "@/lib/auth/session";

/** Account chip + sign out, shown on every researcher page. */
export function ResearcherNav({ viewer, className = "" }: { viewer: Viewer; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await fetch("/api/auth/signout", { method: "POST" });
    } catch {
      /* the cookie is cleared server-side; a failure here just means we retry */
    }
    // The session row is already deleted server-side, so the account is signed
    // out regardless of what the client does next. `refresh()` then drops the
    // router cache so no previously rendered dashboard can be navigated back to.
    router.replace("/signin");
    router.refresh();
  };

  return (
    <div className={`flex items-center gap-2 shrink-0 ${className}`}>
      <span className="hidden sm:inline text-[13px] text-muted" title={viewer.username}>
        {viewer.name || viewer.username}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        aria-label="Sign out"
        title="Sign out"
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white px-2.5 sm:px-3 h-8 text-[13px] text-ink-2 hover:border-ink/30 hover:text-ink transition disabled:opacity-50"
      >
        <LogOut className="w-3.5 h-3.5" />
        {/* Icon-only on phones so three-button headers fit a 320px screen. */}
        <span className="hidden sm:inline">{busy ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  );
}
