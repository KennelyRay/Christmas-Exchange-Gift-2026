import { api, ClientApiError } from "./client-api";
import type { UploadedPhoto } from "./photos";

type UploadTicket = { key: string; uploadUrl: string; headers: Record<string, string> };

/** XMLHttpRequest rather than fetch, because only it reports upload progress. */
function putWithProgress(ticket: UploadTicket, photo: Blob, onProgress: (fraction: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) request.setRequestHeader(name, value);

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new ClientApiError(request.status, "upload_failed", "The photo didn't finish uploading."));
    };
    // Also how a blocked CORS request shows up: the browser hides the reason.
    request.onerror = () => reject(new ClientApiError(0, "upload_failed", "The photo didn't finish uploading."));

    const abort = () => request.abort();
    request.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    request.send(photo);
  });
}

/** Asks our server for a one-time upload address, uploads straight to storage, then has the server check it. */
export async function uploadPhoto(
  exchangeId: string,
  photo: Blob,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<UploadedPhoto> {
  const ticket = await api<UploadTicket>("/api/photos/upload-url", {
    body: { exchangeId, contentType: photo.type, size: photo.size },
  });
  signal.throwIfAborted();
  await putWithProgress(ticket, photo, onProgress, signal);
  signal.throwIfAborted();
  return api<UploadedPhoto>("/api/photos/confirm", { body: { key: ticket.key } });
}

/** Best effort: anything missed is removed by the daily cleanup. */
export function discardPhoto(key: string) {
  void fetch("/api/photos/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
    keepalive: true,
  }).catch(() => {});
}
