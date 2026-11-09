import type { MetadataRoute } from "next";

/** Added to a Home Screen from an exchange's page, the icon has to reopen that exchange. */
export function webManifest(startUrl: string, scope: string): MetadataRoute.Manifest {
  return {
    name: "Family Gift Exchange",
    short_name: "Gift Exchange",
    description: "Our family's Christmas gift exchange.",
    start_url: startUrl,
    scope,
    display: "standalone",
    background_color: "#0b231c",
    theme_color: "#0b231c",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
