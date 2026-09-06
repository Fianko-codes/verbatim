import type { Metadata } from "next";
import { NewStudyForm } from "./new-study-form";

export const metadata: Metadata = { title: "New study" };

export default function NewStudyPage() {
  return <NewStudyForm />;
}
