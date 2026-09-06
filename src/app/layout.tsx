import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Verbatim — AI-moderated user interviews", template: "%s · Verbatim" },
  description:
    "Verbatim is an AI interviewer that runs real research conversations at scale — it asks follow-ups, never cuts people off, and turns every interview into themes, verbatim quotes, and sentiment.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  openGraph: {
    title: "Verbatim — AI-moderated user interviews",
    description: "User interviews at the scale of a survey, in the participant's own words.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${instrument.variable} ${geistMono.variable} h-full`}>
      <body className="grain min-h-full flex flex-col relative">
        <div className="relative z-[1] flex-1 flex flex-col">{children}</div>
      </body>
    </html>
  );
}
