import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { currentViewer } from "@/lib/auth/guards";
import { safeNextPath } from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await currentViewer()) redirect(safeNextPath(next));
  return <AuthForm mode="signup" next={next ?? null} />;
}
