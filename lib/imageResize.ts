"use client";

/**
 * Shrinks a photo on the phone before upload: longest side to `maxSide`,
 * re-encoded as JPEG. A 12 MP camera photo becomes ~150–300 KB, well under
 * Vercel's 4.5 MB request limit, and plenty for reading a plate of food.
 * Also drops EXIF (location) since the canvas doesn't carry it.
 */
export async function resizeImage(file: File, maxSide = 1280, quality = 0.8): Promise<{ dataUrl: string; base64: string }> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't read the photo.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return { dataUrl, base64: dataUrl.slice(dataUrl.indexOf(",") + 1) };
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap honours EXIF rotation in current Safari and Chrome.
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through to <img> (older Safari, HEIC it can't decode this way).
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}
