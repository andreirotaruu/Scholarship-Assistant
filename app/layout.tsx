import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ScholarSafe — Scholarship Application Copilot",
  description: "Prepare scholarship applications from verified facts, then review and submit them yourself.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "ScholarSafe — Scholarship Application Copilot",
    description: "Prepare with confidence. Submit it yourself.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ScholarSafe application review workflow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "ScholarSafe — Scholarship Application Copilot",
    description: "Prepare with confidence. Submit it yourself.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
