import type { Metadata } from "next";
import { requireViewer } from "@/lib/auth/guards";
import { NewStudyForm } from "./new-study-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New study" };

export default async function NewStudyPage() {
  const viewer = await requireViewer("/new");
  return <NewStudyForm viewer={viewer} />;
}
