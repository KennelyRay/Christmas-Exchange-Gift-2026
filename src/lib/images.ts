const MAX_DIMENSION = 1200;
const TARGET_BYTES = 900_000;
export const MAX_SOURCE_BYTES = 15_000_000;

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Shrinks a phone photo in the browser so uploads stay small and quick on mobile data. */
export async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't resize photos.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  for (const quality of [0.82, 0.68, 0.5, 0.35]) {
    // Safari silently falls back to PNG for WebP, so JPEG is tried when that happens.
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
    if (blob && blob.size <= TARGET_BYTES) return blob;
  }
  throw new Error("That photo is too detailed to shrink. Please try another one.");
}
