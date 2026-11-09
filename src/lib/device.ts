/** Browser-only helpers. Every call here is made from an event handler or effect. */

export const isIos = () =>
  /iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isPhone = () => isIos() || /Android/i.test(navigator.userAgent);

export const isInstalled = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Messenger's built-in browser blocks the Clipboard API, hence the older fallback. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    // Inside an open dialog, only the dialog's own content can take focus.
    (document.querySelector("dialog[open]") ?? document.body).appendChild(field);
    field.select();
    field.setSelectionRange(0, text.length);
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      field.remove();
    }
  }
}

/** Null when the browser refuses; an empty string when the clipboard has no text. */
export async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Store apps share "Check this out! https://..." so the link has to be dug out. */
export function linkFromText(text: string) {
  const match = text.match(/https?:\/\/\S+/i);
  if (match) return match[0].replace(/[),.]+$/, "");
  return /\s/.test(text.trim()) ? "" : text.trim();
}

export const canNativeShare = () => typeof navigator.share === "function";

export type ShareResult = "shared" | "dismissed" | "unavailable";

export async function nativeShare(data: ShareData): Promise<ShareResult> {
  if (!canNativeShare()) return "unavailable";
  try {
    await navigator.share(data);
    return "shared";
  } catch (error) {
    return error instanceof DOMException && error.name === "AbortError" ? "dismissed" : "unavailable";
  }
}

/**
 * iPhones file a download under Files, where nobody finds it again. The share sheet
 * offers "Save Image", which puts it in Photos instead.
 */
export async function saveImage(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  if (isIos() && navigator.canShare?.({ files: [file] })) {
    return (await nativeShare({ files: [file] })) === "shared";
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}
