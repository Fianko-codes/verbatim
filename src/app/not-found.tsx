import Link from "next/link";
import { Wordmark, buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex-1 flex flex-col">
      <header className="px-6 py-6 max-w-5xl mx-auto w-full">
        <Wordmark />
      </header>
      <section className="flex-1 grid place-items-center px-6 pb-20 text-center">
        <div>
          <h1 className="font-display text-[44px]">Nothing here.</h1>
          <p className="mt-2 text-ink-2">That study or interview doesn&apos;t exist — or the link was cut short.</p>
          <Link href="/" className={`${buttonClass({ variant: "secondary" })} mt-6`}>
            Back to Verbatim
          </Link>
        </div>
      </section>
    </main>
  );
}
