import { webManifest } from "@/lib/web-manifest";

export default function manifest() {
  return webManifest("/", "/");
}
