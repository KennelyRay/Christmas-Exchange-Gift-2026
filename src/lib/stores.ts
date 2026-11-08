const KNOWN_STORES: ReadonlyArray<{ name: string; hosts: readonly string[] }> = [
  { name: "Shopee", hosts: ["shopee.ph", "shopee.com", "shope.ee"] },
  { name: "Lazada", hosts: ["lazada.com.ph", "lazada.com", "lzd.co"] },
  { name: "TikTok Shop", hosts: ["tiktok.com"] },
  { name: "Zalora", hosts: ["zalora.com.ph", "zalora.com"] },
  { name: "Amazon", hosts: ["amazon.com", "amzn.to", "amzn.asia"] },
  { name: "Temu", hosts: ["temu.com"] },
  { name: "Shein", hosts: ["shein.com", "shein.ph"] },
  { name: "Carousell", hosts: ["carousell.ph", "carousell.com"] },
  { name: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { name: "Uniqlo", hosts: ["uniqlo.com"] },
  { name: "Nike", hosts: ["nike.com"] },
  { name: "Adidas", hosts: ["adidas.com", "adidas.com.ph"] },
  { name: "National Book Store", hosts: ["nationalbookstore.com"] },
  { name: "Fully Booked", hosts: ["fullybookedonline.com"] },
  { name: "SM Store", hosts: ["smstore.com.ph", "sm-store.com"] },
];

export function isWebUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Accepts a link pasted without its https:// prefix. */
export function normalizeWebUrl(value: string) {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Decided from the hostname alone: the server never fetches family-supplied URLs. */
export function storeNameFor(value: string): string | null {
  if (!isWebUrl(value)) return null;
  const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  const store = KNOWN_STORES.find(({ hosts }) =>
    hosts.some((known) => host === known || host.endsWith(`.${known}`)),
  );
  return store?.name ?? host;
}
