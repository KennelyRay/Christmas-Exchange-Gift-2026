/** Reads the exchange out of a full link, a link to any of its pages, or the bare name. */
export function slugFromLink(value: string) {
  const text = value.trim();
  const fromPath = text.match(/\/x\/([^/?#\s]+)/);
  if (fromPath) return fromPath[1];
  return text.split(/[?#]/)[0].replace(/\/+$/, "").split("/").pop() ?? "";
}
