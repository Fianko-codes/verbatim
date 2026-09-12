import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentViewer } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  // Already signed in: skip the form rather than showing a dead end.
  if (await currentViewer()) redirect(safeNextPath(next));
  return <AuthForm mode="signin" next={next ?? null} />;
}
