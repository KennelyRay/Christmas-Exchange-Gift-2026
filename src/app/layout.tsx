import type { Metadata, Viewport } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { Snowfall } from "@/components/snowfall";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Santa's Sealed Envelopes",
  description: "A fair, secret family gift exchange. Nobody knows who got whom until they open their own envelope.",
};

export const viewport: Viewport = {
  themeColor: "#0b231c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${jakarta.variable} antialiased`}>
      <body className="min-h-[100dvh]">
        <Snowfall />
        <div className="relative min-h-[100dvh]">{children}</div>
      </body>
    </html>
  );
}
