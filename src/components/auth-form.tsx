"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { safeNextPath } from "@/lib/auth/next-path";
import { Button, Label, Wordmark, inputClass } from "@/components/ui";

type Mode = "signin" | "signup";

const COPY = {
  signin: {
    title: "Sign in",
    blurb: "Your studies, interviews and recordings are private to your account.",
    action: "Sign in",
    swapText: "Need an account?",
    swapLabel: "Create one",
    swapHref: "/signup",
    endpoint: "/api/auth/signin",
  },
  signup: {
    title: "Create your account",
    blurb: "One account owns its studies. Participants never need one — they join on a link.",
    action: "Create account",
    swapText: "Already have an account?",
    swapLabel: "Sign in",
    swapHref: "/signin",
    endpoint: "/api/auth/signup",
  },
} as const;

export function AuthForm({ mode, next }: { mode: Mode; next: string | null }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(copy.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "signup" ? { username, password, name } : { username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      const dest = safeNextPath(next);
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-6 max-w-5xl mx-auto w-full">
        <Wordmark />
      </header>
      <section className="flex-1 grid place-items-center px-6 pb-24">
        <div className="w-full max-w-[400px]">
          <h1 className="font-display text-[36px] sm:text-[40px] leading-[1.05] tracking-tight">{copy.title}</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{copy.blurb}</p>

          <form onSubmit={submit} className="card mt-7 p-6 space-y-4">
            {mode === "signup" && (
              <div>
                <Label hint="Optional">Your name</Label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                  autoComplete="name"
                  placeholder="Maya Alvarez"
                />
              </div>
            )}
            <div>
              <Label>Username</Label>
              <input
                id="username"
                name="username"
                className={inputClass}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                maxLength={40}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                autoComplete="username"
                placeholder="maya"
              />
            </div>
            <div>
              <Label hint={mode === "signup" ? "At least 12 characters" : undefined}>Password</Label>
              <input
                id="password"
                name="password"
                type="password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={mode === "signup" ? 12 : 1}
                maxLength={200}
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
              />
            </div>

            {error && (
              <div role="alert" className="rounded-xl bg-neg-soft px-3.5 py-2.5 text-[13px] text-neg">
                {error}
              </div>
            )}

            <Button type="submit" disabled={busy} className="w-full" data-testid="auth-submit">
              {busy ? "Working…" : copy.action}
            </Button>
          </form>

          <p className="mt-5 text-[13px] text-muted text-center">
            {copy.swapText}{" "}
            <Link
              href={next ? `${copy.swapHref}?next=${encodeURIComponent(next)}` : copy.swapHref}
              className="text-ink underline underline-offset-2"
            >
              {copy.swapLabel}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
