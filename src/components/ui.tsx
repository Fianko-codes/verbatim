import Link from "next/link";
import type { Sentiment } from "@/db/schema";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`inline-flex items-baseline gap-1.5 group ${className}`}>
      <span className="inline-block w-2.5 h-2.5 rounded-full bg-accent translate-y-[-1px] group-hover:scale-110 transition-transform" />
      <span className="font-display text-[26px] leading-none tracking-tight">Verbatim</span>
    </Link>
  );
}

export function SentimentChip({ value, className = "" }: { value: Sentiment; className?: string }) {
  const map: Record<Sentiment, string> = {
    positive: "bg-pos-soft text-pos",
    negative: "bg-neg-soft text-neg",
    mixed: "bg-mixed-soft text-mixed",
    neutral: "bg-neu-soft text-neu",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${map[value]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
      {value}
    </span>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function buttonClass({ variant = "primary", size = "md" }: Pick<ButtonProps, "variant" | "size">) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
  const sizes = { sm: "h-8 px-3.5 text-[13px]", md: "h-10 px-5 text-sm", lg: "h-12 px-7 text-[15px]" };
  const variants = {
    primary: "bg-ink text-paper hover:bg-ink-2 shadow-sm",
    secondary: "bg-white text-ink border border-line hover:border-ink/30 hover:bg-paper-2",
    ghost: "text-ink-2 hover:bg-paper-2",
    danger: "bg-accent text-white hover:bg-accent-deep",
  };
  return `${base} ${sizes[size]} ${variants[variant]}`;
}

export function Button({ variant = "primary", size = "md", className = "", ...rest }: ButtonProps) {
  return <button className={`${buttonClass({ variant, size })} ${className}`} {...rest} />;
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <span className="text-[13px] font-medium text-ink">{children}</span>
      {hint && <span className="text-[12px] text-muted">{hint}</span>}
    </div>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink placeholder:text-muted/70 focus:outline-none focus:border-ink/40 focus:ring-4 focus:ring-ink/5 transition";

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-[0.14em] text-muted ${className}`}>{children}</div>
  );
}

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m ? `${m}m ${s.toString().padStart(2, "0")}s` : `${s}s`;
}

export function timeAgo(date: Date | string | number) {
  const d = typeof date === "object" ? date.getTime() : new Date(date).getTime();
  const diff = Math.max(0, Date.now() - d);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  return days === 1 ? "yesterday" : `${days}d ago`;
}
