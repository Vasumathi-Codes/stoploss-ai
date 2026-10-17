"use client"

/** Longest side sent for reading. Screenshot text stays legible well below this. */
const MAX_SIDE = 1600
const JPEG_QUALITY = 0.85

export const READABLE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"]

export const canReadScreenshot = (file: File) => READABLE_IMAGE_TYPES.includes(file.type)

/**
 * Re-encodes an image as a downscaled JPEG in the browser. This also strips
 * metadata such as GPS location before anything leaves the device.
 */
export async function prepareScreenshot(file: File): Promise<{ mimeType: "image/jpeg"; base64: string }> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("This browser can't prepare images")
    // JPEG has no transparency; paint a white background first.
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY)
    return { mimeType: "image/jpeg", base64: dataUrl.slice(dataUrl.indexOf(",") + 1) }
  } finally {
    bitmap.close()
  }
}
