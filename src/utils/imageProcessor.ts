import { Buffer } from 'buffer';
import jpeg from 'jpeg-js';
import UPNG from 'upng-js';
import type { BinaryImage, GrayscaleImage } from '@/src/image/dithering';

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
  const resized = resizeImage(decoded.rgba, decoded.width, decoded.height, 384);
  const grayscale = toGrayscale(resized.rgba, resized.width, resized.height, true);
  return applyThreshold(grayscale, threshold);
}

