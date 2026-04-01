import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import type { BinaryImage, GrayscaleImage } from '@/src/image/dithering';
import { PRINT_WIDTH } from '@/src/printer/commandGenerator';
import { TICKET_HEIGHT_MM, TICKET_WIDTH_MM } from '@/constants/printTicket';

interface JpegPixels {
  width: number;
  height: number;
  rgba: Uint8Array;
}

function decodeBase64Jpeg(base64: string): JpegPixels {
  const bytes = Buffer.from(base64, 'base64');
  const decoded = jpeg.decode(bytes, { useTArray: true });
  if (!decoded?.data || !decoded.width || !decoded.height) {
    throw new Error('Invalid image payload (expected JPEG base64).');
  }
  return {
    width: decoded.width,
    height: decoded.height,
    rgba: decoded.data,
  };
}

function decodeBase64Png(base64: string): JpegPixels {
  const bytes = Buffer.from(base64, 'base64');
  const arr = new Uint8Array(bytes);
  const png = UPNG.decode(arr);
  const rgba = UPNG.toRGBA8(png); // Uint8Array RGBA
  if (!png?.width || !png?.height || !rgba?.length) {
    throw new Error('Invalid image payload (expected PNG base64).');
  }
  return {
    width: png.width,
    height: png.height,
    rgba,
  };
}

export function convertToGrayscale(
  rgba: Uint8Array,
  width: number,
  height: number,
  transparentAsWhite = true
): GrayscaleImage {
  const grayscale: GrayscaleImage = [];
  for (let y = 0; y < height; y++) {
    const row: number[] = [];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = rgba[i] ?? 0;
      let g = rgba[i + 1] ?? 0;
      let b = rgba[i + 2] ?? 0;
      const a = (rgba[i + 3] ?? 255) / 255;
      if (a < 1 && transparentAsWhite) {
        r = r * a + (1 - a) * 255;
        g = g * a + (1 - a) * 255;
        b = b * a + (1 - a) * 255;
      } else if (a < 1) {
        r *= a;
        g *= a;
        b *= a;
      }
      row.push(Math.round(Math.min(255, Math.max(0, r * 0.2125 + g * 0.7154 + b * 0.0721))));
    }
    grayscale.push(row);
  }
  return grayscale;
}

// Alias matching your required API naming.
export const toGrayscale = convertToGrayscale;

export function resizeImage(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number
): { width: number; height: number; rgba: Uint8Array } {
  const scale = targetWidth / Math.max(1, sourceWidth);
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale));
  const out = new Uint8Array(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(sourceHeight - 1, Math.floor(y / scale));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(sourceWidth - 1, Math.floor(x / scale));
      const si = (sy * sourceWidth + sx) * 4;
      const di = (y * targetWidth + x) * 4;
      out[di] = rgba[si] ?? 0;
      out[di + 1] = rgba[si + 1] ?? 0;
      out[di + 2] = rgba[si + 2] ?? 0;
      out[di + 3] = rgba[si + 3] ?? 255;
    }
  }
  return { width: targetWidth, height: targetHeight, rgba: out };
}

/**
 * Nearest-neighbor resize that targets an exact output width/height.
 * We use it for the final printer bitmap so we can guarantee:
 * - fixed printer width
 * - fixed printer height
 * - no cropping ("contain")
 */
function resizeImageNearest(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { width: number; height: number; rgba: Uint8Array } {
  const out = new Uint8Array(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const sy =
      targetHeight <= 1
        ? 0
        : Math.min(sourceHeight - 1, Math.floor((y * (sourceHeight - 1)) / (targetHeight - 1)));
    for (let x = 0; x < targetWidth; x++) {
      const sx =
        targetWidth <= 1 ? 0 : Math.min(sourceWidth - 1, Math.floor((x * (sourceWidth - 1)) / (targetWidth - 1)));
      const si = (sy * sourceWidth + sx) * 4;
      const di = (y * targetWidth + x) * 4;
      out[di] = rgba[si] ?? 0;
      out[di + 1] = rgba[si + 1] ?? 0;
      out[di + 2] = rgba[si + 2] ?? 0;
      out[di + 3] = rgba[si + 3] ?? 255;
    }
  }
  return { width: targetWidth, height: targetHeight, rgba: out };
}

/**
 * Resize with "contain" strategy:
 * - keep aspect ratio
 * - fit inside (targetWidth, targetHeight) without cropping
 * - pad with white
 */
function resizeImageContain(
  rgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): { width: number; height: number; rgba: Uint8Array } {
  const scale = Math.min(targetWidth / Math.max(1, sourceWidth), targetHeight / Math.max(1, sourceHeight));
  const fittedWidth = Math.max(1, Math.floor(sourceWidth * scale));
  const fittedHeight = Math.max(1, Math.floor(sourceHeight * scale));

  const resized = resizeImageNearest(rgba, sourceWidth, sourceHeight, fittedWidth, fittedHeight);

  const out = new Uint8Array(targetWidth * targetHeight * 4);
  // White padding (alpha=255) so thermal output is blank after polarity handling.
  out.fill(255);

  const offsetX = Math.floor((targetWidth - fittedWidth) / 2);
  const offsetY = Math.floor((targetHeight - fittedHeight) / 2);

  for (let y = 0; y < fittedHeight; y++) {
    for (let x = 0; x < fittedWidth; x++) {
      const si = (y * fittedWidth + x) * 4;
      const di = ((y + offsetY) * targetWidth + (x + offsetX)) * 4;
      out[di] = resized.rgba[si] ?? 255;
      out[di + 1] = resized.rgba[si + 1] ?? 255;
      out[di + 2] = resized.rgba[si + 2] ?? 255;
      out[di + 3] = resized.rgba[si + 3] ?? 255;
    }
  }

  return { width: targetWidth, height: targetHeight, rgba: out };
}

/**
 * Convert grayscale → pure 1-bit bitmap.
 * Printer rule: thermal printers only print BLACK dots.
 *
 * In our `BinaryImage`, `true` means "this pixel position should be a BLACK dot"
 * *before* the additional polarity handling done in `printService`.
 */
export function applyThreshold(imageData: GrayscaleImage, threshold = 128): BinaryImage {
  // Printer output is polarity-sensitive (thermal dots are inverted in firmware pipeline).
  // So we intentionally map: darker pixels => "WHITE" (false), lighter pixels => "BLACK" (true)
  // and let the existing polarity handling in `printService` produce the correct final dots.
  return imageData.map((row) => row.map((px) => px < threshold ? false : true));
}

/**
 * Force a white safety border around the final bitmap to avoid edge artifacts
 * (corner dots / stray border pixels) on thermal printers.
 *
 * NOTE: In this pipeline, `true` is the white-side value before polarity handling.
 */
function forceWhiteBorder(binary: BinaryImage, borderPx = 2): BinaryImage {
  if (!binary.length || !binary[0]?.length) return binary;
  const h = binary.length;
  const w = binary[0].length;
  const out = binary.map((row) => row.slice());
  const b = Math.max(1, Math.min(borderPx, Math.floor(Math.min(w, h) / 2)));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < b || y < b || x >= w - b || y >= h - b) {
        out[y][x] = true;
      }
    }
  }
  return out;
}

export function toBitmapBytes(binaryImage: BinaryImage, width = 384): Uint8Array[] {
  const bytesPerRow = width / 8;
  return binaryImage.map((row) => {
    const rowBytes = new Uint8Array(bytesPerRow);
    for (let x = 0; x < width; x++) {
      const bit = row[x] ? 1 : 0;
      if (!bit) continue;
      const byteIndex = (x / 8) | 0;
      const bitIndex = 7 - (x % 8); // MSB -> LSB (matches command generator input expectations)
      rowBytes[byteIndex] |= 1 << bitIndex;
    }
    return rowBytes;
  });
}

export function processJpegBase64ToBitmap(
  base64: string,
  threshold = 128
): BinaryImage {
  // Expo picker might return JPEG base64 even if user picked a PNG.
  // To guarantee PNG/JPG support, we decode as JPEG first, then fallback to PNG.
  let decoded: JpegPixels;
  try {
    decoded = decodeBase64Jpeg(base64);
  } catch {
    decoded = decodeBase64Png(base64);
  }

  // Enforce the fixed printer ticket size (57mm x 63mm) before dithering.
  // We derive an effective DPI from the existing printer bitmap width mapping:
  // - current firmware bitmap width is `PRINT_WIDTH` (384px) for 57mm.
  // - use the same dpi for height so our bitmap is always fully printable.
  const printerEffectiveDpi = (PRINT_WIDTH * 25.4) / TICKET_WIDTH_MM;
  // Thermal protocol packs 8 pixels per byte; width MUST stay 8-aligned.
  const targetWidth = Math.ceil(PRINT_WIDTH / 8) * 8;
  const targetHeight = Math.round((TICKET_HEIGHT_MM * printerEffectiveDpi) / 25.4); // == PRINT_WIDTH * TICKET_HEIGHT_MM / TICKET_WIDTH_MM

  const contained = resizeImageContain(decoded.rgba, decoded.width, decoded.height, targetWidth, targetHeight);
  const grayscale = toGrayscale(contained.rgba, contained.width, contained.height, true);
  const binary = applyThreshold(grayscale, threshold);
  return forceWhiteBorder(binary, 2);
}

