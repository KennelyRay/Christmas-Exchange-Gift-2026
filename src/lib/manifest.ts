/**
 * The committed record of a draw. No node:crypto here: this file also runs in
 * the browser so family members can check the seal themselves.
 */

export type ManifestLink = { giver: string; recipient: string };

export type Manifest = {
  v: 1;
  exchange: string;
  salt: string;
  assignments: ManifestLink[];
};

export function buildManifest(exchange: string, salt: string, chainNames: readonly string[]) {
  const manifest: Manifest = {
    v: 1,
    exchange,
    salt,
    assignments: chainNames.map((giver, i) => ({
      giver,
      recipient: chainNames[(i + 1) % chainNames.length],
    })),
  };
  return JSON.stringify(manifest);
}

export function parseManifest(text: string): Manifest {
  return JSON.parse(text) as Manifest;
}

export const chainNamesOf = (manifest: Manifest) => manifest.assignments.map((a) => a.giver);

/** True when the links form exactly one loop through everybody with no self-picks. */
export function isSingleLoop(links: readonly ManifestLink[]) {
  if (links.length === 0) return false;
  const next = new Map(links.map((link) => [link.giver, link.recipient]));
  if (next.size !== links.length) return false;

  const start = links[0].giver;
  let current = start;
  for (let hops = 1; hops <= links.length; hops++) {
    const recipient = next.get(current);
    if (recipient === undefined || recipient === current) return false;
    current = recipient;
    if (current === start) return hops === links.length;
  }
  return false;
}

export async function sha256HexInBrowser(text: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
