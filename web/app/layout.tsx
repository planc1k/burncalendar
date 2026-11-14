import type { Metadata } from "next";
import { Geist, Geist_Mono, Fraunces } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Fraunces({ variable: "--font-display", subsets: ["latin"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: "BurnCalendar · one fire record from MODIS and VIIRS",
  description: "A harmonized MODIS + VIIRS burning activity calendar and early warning for South Asia, Indonesia and Australia, built on NASA FIRMS.",
  // The Space Apps guide asks for AI-written code to be acknowledged in metadata as well as in text.
  other: { "ai-assistance": "Code and documentation written with Claude (Anthropic) as an AI coding assistant; reviewed by the team." },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
