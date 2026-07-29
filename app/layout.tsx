import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = new URL("/og.png", `${protocol}://${host}`).toString();
  return {
    title: "ScholarSafe — Scholarship Application Copilot",
    description: "Prepare scholarship applications from verified facts, then review and submit them yourself.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "ScholarSafe — Scholarship Application Copilot",
      description: "Prepare with confidence. Submit it yourself.",
      images: [{ url: socialImage, width: 1200, height: 630, alt: "ScholarSafe application review workflow" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "ScholarSafe — Scholarship Application Copilot",
      description: "Prepare with confidence. Submit it yourself.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
