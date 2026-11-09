import { webManifest } from "@/lib/web-manifest";

/** A static file that varies by URL: it reads no data and works for any slug. */
export async function GET(_request: Request, { params }: RouteContext<"/x/[slug]/manifest.webmanifest">) {
  const { slug } = await params;
  const home = `/x/${encodeURIComponent(slug)}`;
  return new Response(JSON.stringify(webManifest(home, home)), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
