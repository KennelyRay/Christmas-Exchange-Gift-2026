/** Gets a phone photo ready to upload, entirely on the device. */

export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;

const LONGEST_SIDE = 1600;
const SMALLEST_LONGEST_SIDE = 800;
const TARGET_BYTES = 500_000;
const HARD_LIMIT_BYTES = 5 * 1024 * 1024;
const QUALITIES = [0.8, 0.7, 0.6, 0.5];

export type PhotoProblemKind = "notPhoto" | "tooBig" | "unreadable";

export class PhotoProblem extends Error {
  constructor(readonly kind: PhotoProblemKind) {
    super(kind);
  }
}

type Format = "jpeg" | "png" | "webp" | "gif" | "bmp" | "heic" | "avif";

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Reads the file's first bytes: a PDF renamed to .jpg is still a PDF. */
async function detectFormat(file: Blob): Promise<Format | null> {
  const b = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const text = (start: number, end: number) => String.fromCharCode(...b.slice(start, end));

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && text(1, 4) === "PNG") return "png";
  if (text(0, 4) === "RIFF" && text(8, 12) === "WEBP") return "webp";
  if (text(0, 4) === "GIF8") return "gif";
  if (text(0, 2) === "BM") return "bmp";
  if (text(4, 8) === "ftyp") {
    const brand = text(8, 12);
    if (brand === "avif" || brand === "avis") return "avif";
    if (HEIC_BRANDS.has(brand)) return "heic";
  }
  return null;
}

type Decoded = { width: number; height: number; source: CanvasImageSource; close: () => void };

/** Applies the EXIF rotation, so a sideways phone photo comes out upright. */
async function decode(blob: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() };
  } catch {
    // Older browsers without createImageBitmap options. Images there honour EXIF rotation too.
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return { width: image.naturalWidth, height: image.naturalHeight, source: image, close: () => URL.revokeObjectURL(url) };
  }
}

/** Most browsers can't read iPhone HEIC photos, so the converter loads only when one turns up. */
async function heicToJpeg(file: Blob) {
  const { heicTo } = await import("heic-to/next");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.92 });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Drawing onto a canvas and saving again drops all EXIF data, including the
 * GPS location phones attach to photos.
 */
async function encode(image: Decoded) {
  let smallest: Blob | null = null;
  for (let longest = LONGEST_SIDE; longest >= SMALLEST_LONGEST_SIDE; longest = Math.round(longest * 0.75)) {
    const scale = Math.min(1, longest / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoProblem("unreadable");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image.source, 0, 0, canvas.width, canvas.height);

    for (const quality of QUALITIES) {
      // Older Safari quietly saves PNG when asked for WebP, so JPEG is used then.
      let blob = await canvasToBlob(canvas, "image/webp", quality);
      if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
      if (!blob) continue;
      if (blob.size <= TARGET_BYTES) return blob;
      if (!smallest || blob.size < smallest.size) smallest = blob;
    }
  }
  if (smallest && smallest.size <= HARD_LIMIT_BYTES) return smallest;
  throw new PhotoProblem("unreadable");
}

export async function preparePhoto(file: File): Promise<Blob> {
  if (file.size > MAX_SOURCE_BYTES) throw new PhotoProblem("tooBig");

  const format = await detectFormat(file);
  if (!format) throw new PhotoProblem("notPhoto");

  let image: Decoded;
  try {
    image = await decode(file);
  } catch {
    if (format !== "heic") throw new PhotoProblem("unreadable");
    try {
      image = await decode(await heicToJpeg(file));
    } catch {
      throw new PhotoProblem("unreadable");
    }
  }

  try {
    return await encode(image);
  } finally {
    image.close();
  }
}
