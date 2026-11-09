import type { Metadata } from "next";

export async function generateMetadata({ params }: LayoutProps<"/x/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { manifest: `/x/${encodeURIComponent(slug)}/manifest.webmanifest` };
}

export default function ExchangeLayout({ children }: LayoutProps<"/x/[slug]">) {
  return children;
}
