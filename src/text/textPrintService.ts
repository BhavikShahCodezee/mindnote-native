import type { Device } from 'react-native-ble-plx';
import { cmdsPrintImg, PRINT_WIDTH } from '../printer/commandGenerator';
import { getPrinterService, POSSIBLE_SERVICE_UUIDS } from '../bluetooth/printerService';
import { getQuality } from '../settings';
import { wrapTextToLines } from './textWrap';
import type { FontStyleKey } from '@/src/storage/appSettings';
import { BASE_PREVIEW_FONT_PX } from '@/src/storage/appSettings';
import { SETTINGS_PREVIEW_HEIGHT_PX, SETTINGS_PREVIEW_WIDTH_PX, TICKET_HEIGHT_MM, TICKET_WIDTH_MM } from '@/constants/printTicket';
import { Canvas } from 'react-native-canvas';
import { processJpegBase64ToBitmap } from '@/src/utils/imageProcessor';

type BinaryImage = boolean[][];

const PREVIEW_PADDING_PX = 12;
const BASE_BOX_WIDTH = 140;
const MIN_BOX_WIDTH = 40;

const TICKET_HEIGHT_PX = Math.round((PRINT_WIDTH * TICKET_HEIGHT_MM) / TICKET_WIDTH_MM);
const PREVIEW_INNER_W_PX = SETTINGS_PREVIEW_WIDTH_PX - 2 * PREVIEW_PADDING_PX;
const PREVIEW_INNER_H_PX = SETTINGS_PREVIEW_HEIGHT_PX - 2 * PREVIEW_PADDING_PX;

interface TextPrintOptions {
  text: string;
  fontSize: number;
  fontStyle?: FontStyleKey | 'System';
  wrapBySpaces: boolean;
  energy?: number;
  device?: Device | null;

  // Preview-sync transform (normalized to the preview inner box, where 0..1 maps into the dashed box area)
  previewCenterX?: number;
  previewCenterY?: number;
  previewRotationDeg?: number;
  previewScale?: number;
}

export interface TextPrintResult {
  success: boolean;
  message: string;
  error?: Error;
  imageSize?: { width: number; height: number };
  dataSize?: number;
}

// 5x7 bitmap font (subset). Unknown chars fallback to '?'.
const FONT_5X7: Record<string, number[]> = {
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '?': [0b01110, 0b10001, 0b00010, 0b00100, 0b00100, 0b00000, 0b00100],
  '.': [0, 0, 0, 0, 0, 0b01100, 0b01100],
  ',': [0, 0, 0, 0, 0b00110, 0b00110, 0b01100],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0, 0b00100],
  ':': [0, 0b01100, 0b01100, 0, 0b01100, 0b01100, 0],
  '-': [0, 0, 0b11111, 0, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 0b11111],
  '/': [0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0, 0],
  '0': [0b01110, 0b10011, 0b10101, 0b11001, 0b10001, 0b10001, 0b01110],
  '1': [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  '2': [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  '3': [0b11110, 0b00001, 0b00001, 0b01110, 0b00001, 0b00001, 0b11110],
  '4': [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  '5': [0b11111, 0b10000, 0b10000, 0b11110, 0b00001, 0b00001, 0b11110],
  '6': [0b01110, 0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  '7': [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  '8': [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  '9': [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00001, 0b01110],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01111, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b01111],
  D: [0b11110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b11110],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01111, 0b10000, 0b10000, 0b10011, 0b10001, 0b10001, 0b01110],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00001, 0b00001, 0b00001, 0b00001, 0b10001, 0b10001, 0b01110],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
};

function glyphFor(ch: string): number[] {
  const upper = ch.toUpperCase();
  return FONT_5X7[upper] ?? FONT_5X7[ch] ?? FONT_5X7['?'];
}

function createTextBoxMono(
  text: string,
  fontSize: number,
  fontStyle: FontStyleKey | 'System',
  wrapBySpaces: boolean,
  containerWidthPx: number
): BinaryImage {
  const styleScale =
    fontStyle === 'Excalifont' ? 1.08 : fontStyle === 'ShadowsIntoLight' ? 1.15 : 1;
  const scale = Math.max(1, Math.round((fontSize * styleScale) / 12));
  const glyphWidth = 5 * scale;
  const glyphHeight = 7 * scale;
  const styleLetterSpacing =
    fontStyle === 'Excalifont' ? 2 : fontStyle === 'ShadowsIntoLight' ? 3 : 1;
  const styleLineSpacing =
    fontStyle === 'Excalifont' ? 2 : fontStyle === 'ShadowsIntoLight' ? 3 : 2;
  const letterSpacing = styleLetterSpacing * scale;
  const lineSpacing = styleLineSpacing * scale;
  const charAdvance = glyphWidth + letterSpacing;
  const lineHeight = glyphHeight + lineSpacing;

  const lines = wrapTextToLines(text, fontSize, wrapBySpaces, containerWidthPx);
  const safeLines = lines.length ? lines : [' '];
  const height = Math.max(1, safeLines.length * lineHeight);
  const image: BinaryImage = Array.from({ length: height }, () => Array(containerWidthPx).fill(false));

  const linePixelWidth = (line: string) => Math.max(0, line.length * charAdvance - letterSpacing);

  const xStart = (line: string): number => {
    const w = linePixelWidth(line);
    return Math.max(0, Math.floor((containerWidthPx - w) / 2));
  };

  safeLines.forEach((line, lineIdx) => {
    const y0 = lineIdx * lineHeight;
    let x = xStart(line);
    for (const ch of line) {
      const glyph = glyphFor(ch);
      for (let gy = 0; gy < 7; gy++) {
        const rowBits = glyph[gy] ?? 0;
        const slantOffset =
          fontStyle === 'ShadowsIntoLight'
            ? Math.floor((6 - gy) * 0.6 * scale)
            : fontStyle === 'Excalifont'
              ? Math.floor((6 - gy) * 0.3 * scale)
              : 0;
        for (let gx = 0; gx < 5; gx++) {
          if (((rowBits >> (4 - gx)) & 1) !== 1) continue;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const py = y0 + gy * scale + sy;
              const px = x + gx * scale + sx + slantOffset;
              if (py >= 0 && py < image.length && px >= 0 && px < containerWidthPx) {
                image[py][px] = true; // black
              }
            }
          }
        }
      }
      x += charAdvance;
      if (x >= containerWidthPx) break;
    }
  });

  return image;
}

function rotateMonoIntoTicket(
  boxMono: BinaryImage,
  ticketMono: BinaryImage,
  ticketCenterX: number,
  ticketCenterY: number,
  rotationDeg: number
): void {
  const boxH = boxMono.length;
  const boxW = boxMono[0]?.length ?? 0;
  if (boxW <= 0 || boxH <= 0) return;

  // With y-axis pointing down (pixel coordinates), a positive angle rotates clockwise.
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const boxCenterX = boxW / 2;
  const boxCenterY = boxH / 2;

  const ticketH = ticketMono.length;

  for (let y = 0; y < boxH; y++) {
    for (let x = 0; x < boxW; x++) {
      if (!boxMono[y]![x]) continue;

      const dx = x - boxCenterX;
      const dy = y - boxCenterY;

      const rx = dx * cos - dy * sin;
      const ry = dx * sin + dy * cos;

      const tx = Math.round(ticketCenterX + rx);
      const ty = Math.round(ticketCenterY + ry);

      if (ty < 0 || ty >= ticketH) continue;
      if (tx < 0 || tx >= PRINT_WIDTH) continue;

      ticketMono[ty]![tx] = true;
    }
  }
}

async function ensureWritableConnectedDevice(device?: Device | null): Promise<Device> {
  const printerService = getPrinterService();
  const connected = printerService.getConnectedDevice();
  if (!connected || !printerService.isConnected()) {
    throw new Error('Printer not connected');
  }
  if (device && connected.id !== device.id) {
    throw new Error('Selected printer is not the active connected printer');
  }
  const services = await connected.services();
  const hasKnownService = services.some((s) =>
    POSSIBLE_SERVICE_UUIDS.includes(s.uuid.toLowerCase())
  );
  if (!hasKnownService) {
    throw new Error('Connected device is not writable as Cat-Printer service');
  }
  return connected;
}

export async function printTextDirect(options: TextPrintOptions): Promise<TextPrintResult> {
  const {
    text,
    fontSize,
    fontStyle = 'System',
    wrapBySpaces,
    energy = 0xffff,
    device,
    previewCenterX = 0.5,
    previewCenterY = 0.5,
    previewRotationDeg = 0,
    previewScale,
  } = options;

  try {
    const activeDevice = await ensureWritableConnectedDevice(device);

    const effectivePreviewScale = previewScale ?? Math.max(0.001, fontSize / BASE_PREVIEW_FONT_PX);

    const boxWidthPreviewPx = Math.max(
      MIN_BOX_WIDTH,
      Math.min(PREVIEW_INNER_W_PX, BASE_BOX_WIDTH * effectivePreviewScale)
    );
    const containerWidthPx = Math.max(1, Math.round((boxWidthPreviewPx * PRINT_WIDTH) / SETTINGS_PREVIEW_WIDTH_PX));

    const boxMono = createTextBoxMono(text, fontSize, fontStyle, wrapBySpaces, containerWidthPx);

    // Fixed printer ticket bitmap height for 57mm x 63mm.
    const ticketMono: BinaryImage = Array.from({ length: TICKET_HEIGHT_PX }, () =>
      Array(PRINT_WIDTH).fill(false)
    );

    // Preview normalized center -> ticket pixel center.
    const previewCenterPxX = PREVIEW_PADDING_PX + previewCenterX * PREVIEW_INNER_W_PX;
    const previewCenterPxY = PREVIEW_PADDING_PX + previewCenterY * PREVIEW_INNER_H_PX;
    const ticketCenterX = (previewCenterPxX * PRINT_WIDTH) / SETTINGS_PREVIEW_WIDTH_PX;
    const ticketCenterY = (previewCenterPxY * TICKET_HEIGHT_PX) / SETTINGS_PREVIEW_HEIGHT_PX;

    rotateMonoIntoTicket(boxMono, ticketMono, ticketCenterX, ticketCenterY, previewRotationDeg);

    const width = PRINT_WIDTH;
    const height = ticketMono.length;

    const quality = getQuality();
    const commandData = cmdsPrintImg(ticketMono, energy, quality, activeDevice.name ?? undefined);
    await getPrinterService().sendData(commandData);

    return { success: true, message: 'Text printed successfully', imageSize: { width, height }, dataSize: commandData.length };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * "Text as Image" mode:
 * We rasterize the text into a grayscale box, then threshold into a mono ticket bitmap.
 * (Same preview-sync translation + rotation as `printTextDirect`.)
 */
export async function printTextAsImageDirect(options: TextPrintOptions): Promise<TextPrintResult> {
  const {
    text,
    fontSize,
    fontStyle = 'System',
    wrapBySpaces,
    energy = 0xffff,
    device,
    previewCenterX = 0.5,
    previewCenterY = 0.5,
    previewRotationDeg = 0,
  } = options;

  try {
    const activeDevice = await ensureWritableConnectedDevice(device);

    const fontFamily =
      fontStyle === 'Excalifont'
        ? 'Excalifont'
        : fontStyle === 'ShadowsIntoLight'
          ? 'ShadowsIntoLight'
          : 'sans-serif';

    const maxWidthTicketPx = Math.max(
      1,
      Math.round((PREVIEW_INNER_W_PX * PRINT_WIDTH) / SETTINGS_PREVIEW_WIDTH_PX)
    );

    // Render ticket canvas using real font glyphs, then print it via the existing image pipeline.
    // This avoids brittle bitmap-font "text" printing and ensures "Print as Image" is truly an image.
    const canvas = new Canvas(PRINT_WIDTH, TICKET_HEIGHT_PX);
    canvas.width = PRINT_WIDTH;
    canvas.height = TICKET_HEIGHT_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2d context not available');

    // Background (white paper).
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PRINT_WIDTH, TICKET_HEIGHT_PX);

    // Configure text rendering.
    ctx.font = `700 ${fontSize}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
    const safeMaxWidth = Math.max(1, maxWidthTicketPx);
    const wrapLongWordByChars = (word: string): string[] => {
      const parts: string[] = [];
      let line = '';
      for (const ch of word) {
        const candidate = line + ch;
        if (!line || ctx.measureText(candidate).width <= safeMaxWidth) {
          line = candidate;
        } else {
          parts.push(line);
          line = ch;
        }
      }
      if (line) parts.push(line);
      return parts;
    };

    const lines: string[] = [];
    for (const para of paragraphs) {
      const trimmed = para;
      if (!trimmed) continue;

      if (wrapBySpaces) {
        const words = trimmed.split(' ').filter((w) => w.length > 0);
        let line = '';

        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          const candidateWidth = ctx.measureText(candidate).width;

          if (candidateWidth <= safeMaxWidth) {
            line = candidate;
            continue;
          }

          if (line) {
            lines.push(line.trim());
            line = '';
          }

          if (ctx.measureText(word).width <= safeMaxWidth) {
            line = word;
          } else {
            const parts = wrapLongWordByChars(word);
            if (!parts.length) continue;
            for (let i = 0; i < parts.length; i++) {
              if (i < parts.length - 1) lines.push(parts[i]!.trim());
              else line = parts[i] ?? '';
            }
          }
        }

        if (line.trim().length) lines.push(line.trim());
      } else {
        let line = '';
        for (const ch of trimmed) {
          const candidate = line + ch;
          const candidateWidth = ctx.measureText(candidate).width;
          if (!line || candidateWidth <= safeMaxWidth) {
            line = candidate;
          } else {
            if (line.trim().length) lines.push(line.trim());
            line = ch;
          }
        }
        if (line.trim().length) lines.push(line.trim());
      }
    }

    const safeLines = lines.length ? lines : [' '];

    const lineHeight = Math.max(1, fontSize * 1.3);
    const textBoxHeight = Math.max(lineHeight, safeLines.length * lineHeight);

    // Position relative to preview normalized center.
    const previewCenterPxX = PREVIEW_PADDING_PX + previewCenterX * PREVIEW_INNER_W_PX;
    const previewCenterPxY = PREVIEW_PADDING_PX + previewCenterY * PREVIEW_INNER_H_PX;
    const ticketCenterX = (previewCenterPxX * PRINT_WIDTH) / SETTINGS_PREVIEW_WIDTH_PX;
    const ticketCenterY = (previewCenterPxY * TICKET_HEIGHT_PX) / SETTINGS_PREVIEW_HEIGHT_PX;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.95)';
    const rad = (previewRotationDeg * Math.PI) / 180;

    const canTransform = typeof ctx.translate === 'function' && typeof ctx.rotate === 'function';
    if (canTransform) {
      ctx.save();
      ctx.translate(ticketCenterX, ticketCenterY);
      ctx.rotate(rad);

      const startY = -textBoxHeight / 2 + lineHeight / 2;
      for (let i = 0; i < safeLines.length; i++) {
        const y = startY + i * lineHeight;
        ctx.fillText(safeLines[i]!, 0, y);
      }
      ctx.restore();
    } else {
      // Extremely limited canvas implementations: draw without rotation.
      const startY = ticketCenterY - textBoxHeight / 2 + lineHeight / 2;
      for (let i = 0; i < safeLines.length; i++) {
        const y = startY + i * lineHeight;
        ctx.fillText(safeLines[i]!, ticketCenterX, y);
      }
    }

    const extractBase64FromDataUrl = (dataUrl: string): string => {
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx >= 0) return dataUrl.slice(commaIdx + 1);
      return dataUrl;
    };

    // Convert canvas to base64 image (try multiple types for compatibility).
    const tryTypes: { mime: string; quality?: number }[] = [
      { mime: 'image/png' },
      { mime: 'image/jpeg', quality: 0.92 },
      { mime: '' },
    ];

    let lastErr: unknown = undefined;
    let base64: string | null = null;
    for (const t of tryTypes) {
      try {
        const dataUrl =
          t.mime === '' ? await canvas.toDataURL() : await canvas.toDataURL(t.mime, t.quality);
        const b64 = extractBase64FromDataUrl(dataUrl);
        if (b64 && b64.length > 50) {
          base64 = b64;
          break;
        }
        throw new Error(`Empty/invalid base64 from canvas (${t.mime || 'default'})`);
      } catch (e) {
        lastErr = e;
      }
    }

    if (!base64) {
      throw new Error(
        `Failed to rasterize text ticket to image: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
      );
    }

    const binaryImage = processJpegBase64ToBitmap(base64);
    const binaryForPrinter = [...binaryImage]
      .reverse()
      .map((row) => row.slice().reverse().map((p) => !p));

    const quality = getQuality();
    const commandData = cmdsPrintImg(binaryForPrinter, energy, quality, activeDevice.name ?? undefined);
    await getPrinterService().sendData(commandData);

    return {
      success: true,
      message: 'Text (as image) printed successfully',
      imageSize: { width: PRINT_WIDTH, height: binaryForPrinter.length },
      dataSize: commandData.length,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

