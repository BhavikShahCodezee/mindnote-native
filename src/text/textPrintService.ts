import type { Device } from 'react-native-ble-plx';
import { cmdsPrintImg } from '../printer/commandGenerator';
import { getPrinterService, POSSIBLE_SERVICE_UUIDS } from '../bluetooth/printerService';
import { getQuality } from '../settings';
import { wrapTextToLines } from './textWrap';
import type { FontStyleKey } from '@/src/storage/appSettings';

type BinaryImage = boolean[][];
type GrayscaleImage = number[][];

const PRINTER_WIDTH = 384;

type TextAlign = 'left' | 'center' | 'right';

interface TextPrintOptions {
  text: string;
  fontSize: number;
  fontStyle?: FontStyleKey;
  align: TextAlign;
  wrapBySpaces: boolean;
  energy?: number;
  device?: Device | null;
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

function createGrayscaleTextImage(
  text: string,
  fontSize: number,
  fontStyle: FontStyleKey,
  align: TextAlign,
  wrapBySpaces: boolean
): GrayscaleImage {
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

  const lines = wrapTextToLines(text, fontSize, wrapBySpaces);
  const safeLines = lines.length ? lines : [' '];
  const height = Math.max(1, safeLines.length * lineHeight);
  const image: GrayscaleImage = Array.from({ length: height }, () =>
    Array(PRINTER_WIDTH).fill(255)
  );

  const linePixelWidth = (line: string) => Math.max(0, line.length * charAdvance - letterSpacing);

  const xStart = (line: string): number => {
    const w = linePixelWidth(line);
    if (align === 'center') return Math.max(0, Math.floor((PRINTER_WIDTH - w) / 2));
    if (align === 'right') return Math.max(0, PRINTER_WIDTH - w);
    return 0;
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
              if (py >= 0 && py < image.length && px >= 0 && px < PRINTER_WIDTH) {
                image[py][px] = 0; // black
              }
            }
          }
        }
      }
      x += charAdvance;
      if (x >= PRINTER_WIDTH) break;
    }
  });

  return image;
}

function grayscaleToMonochrome(img: GrayscaleImage, threshold = 127): BinaryImage {
  // true = black pixel in our command generator path
  return img.map((row) => row.map((g) => g < threshold));
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
    align,
    wrapBySpaces,
    energy = 0xffff,
    device,
  } = options;

  try {
    const activeDevice = await ensureWritableConnectedDevice(device);
    console.log(`🖨️ Text print device connected: ${activeDevice.name ?? activeDevice.id}`);
    console.log(`📝 Text input: "${text}"`);
    console.log(`   fontSize=${fontSize} fontStyle=${fontStyle} align=${align} wrapBySpaces=${wrapBySpaces}`);

    const grayscale = createGrayscaleTextImage(text, fontSize, fontStyle, align, wrapBySpaces);
    const mono = grayscaleToMonochrome(grayscale, 127);
    const width = mono[0]?.length ?? 0;
    const height = mono.length;
    console.log(`✅ Text rasterized: ${width}x${height}`);

    const quality = getQuality();
    const commandData = cmdsPrintImg(mono, energy, quality, activeDevice.name ?? undefined);
    console.log(`✅ Text command bytes: ${commandData.length}`);
    console.log(`   Command preview: ${Array.from(commandData.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')} ...`);

    await getPrinterService().sendData(commandData);

    return {
      success: true,
      message: 'Text printed successfully',
      imageSize: { width, height },
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

