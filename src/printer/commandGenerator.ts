/**
 * Printer Command Generator
 * 
 * Generates binary commands for the thermal printer.
 *
 * IMPORTANT: This file mirrors the Python implementation in
 * `Cat-Printer-0.6.3.0/printer_lib/commander.py` + the print lifecycle in
 * `Cat-Printer-0.6.3.0/printer.py`.
 * 
 * The protocol is: 0x51 0x78 <cmd> 0x00 <len> 0x00 <payload...> <crc8(payload)> 0xff
 */

import { Buffer } from 'buffer';
import { BinaryImage } from '../image/dithering';

export const PRINT_WIDTH = 384;

/**
 * CRC8 table from Python `printer_lib/commander.py`
 */
const CRC8_TABLE = new Uint8Array([
  0, 7, 14, 9, 28, 27, 18, 21, 56, 63, 54, 49, 36, 35, 42, 45, 112, 119, 126, 121,
  108, 107, 98, 101, 72, 79, 70, 65, 84, 83, 90, 93, -32, -25, -18, -23, -4, -5,
  -14, -11, -40, -33, -42, -47, -60, -61, -54, -51, -112, -105, -98, -103, -116,
  -117, -126, -123, -88, -81, -90, -95, -76, -77, -70, -67, -57, -64, -55, -50,
  -37, -36, -43, -46, -1, -8, -15, -10, -29, -28, -19, -22, -73, -80, -71, -66,
  -85, -84, -91, -94, -113, -120, -127, -122, -109, -108, -99, -102, 39, 32, 41,
  46, 59, 60, 53, 50, 31, 24, 17, 22, 3, 4, 13, 10, 87, 80, 89, 94, 75, 76, 69, 66,
  111, 104, 97, 102, 115, 116, 125, 122, -119, -114, -121, -128, -107, -110, -101,
  -100, -79, -74, -65, -72, -83, -86, -93, -92, -7, -2, -9, -16, -27, -30, -21, -20,
  -63, -58, -49, -56, -35, -38, -45, -44, 105, 110, 103, 96, 117, 114, 123, 124, 81,
  86, 95, 88, 77, 74, 67, 68, 25, 30, 23, 16, 5, 2, 11, 12, 33, 38, 47, 40, 61, 58,
  51, 52, 78, 73, 64, 71, 82, 85, 92, 91, 118, 113, 120, 127, 106, 109, 100, 99, 62,
  57, 48, 55, 34, 37, 44, 43, 6, 1, 8, 15, 26, 29, 20, 19, -82, -87, -96, -89, -78,
  -75, -68, -69, -106, -111, -104, -97, -118, -115, -124, -125, -34, -39, -48, -41,
  -62, -59, -52, -53, -26, -31, -24, -17, -6, -3, -12, -13,
].map((n) => (n < 0 ? (n & 0xff) : n)));

/**
 * crc8 checksum (Python `crc8`)
 */
function crc8(data: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc = CRC8_TABLE[(crc ^ data[i]) & 0xff]!;
  }
  return crc & 0xff;
}

/**
 * Reverse bits in a byte (Python `reverse_bits`)
 */
function reverseBits(i: number): number {
  return (
    ((i & 0b10000000) >> 7) |
    ((i & 0b01000000) >> 5) |
    ((i & 0b00100000) >> 3) |
    ((i & 0b00010000) >> 1) |
    ((i & 0b00001000) << 1) |
    ((i & 0b00000100) << 3) |
    ((i & 0b00000010) << 5) |
    ((i & 0b00000001) << 7)
  );
}

/**
 * Turn int into little-endian variable-length bytes (Python `int_to_bytes`)
 */
function intToBytes(i: number, bigEndian = false): Uint8Array {
  const bytes: number[] = [];
  let v = Math.max(0, Math.floor(i));
  while (v !== 0) {
    bytes.push(v & 0xff);
    v >>= 8;
  }
  if (bytes.length === 0) bytes.push(0);
  if (bigEndian) bytes.reverse();
  return new Uint8Array(bytes);
}

/**
 * Make a printer command frame (Python `make_command`)
 */
export function makeCommand(commandBit: number, payload: Uint8Array = new Uint8Array()): Uint8Array {
  if (payload.length > 0xff) {
    throw new Error(`Command payload too big (${payload.length} > 255)`);
  }
  const out = new Uint8Array(6 + payload.length + 2);
  out[0] = 0x51;
  out[1] = 0x78;
  out[2] = commandBit & 0xff;
  out[3] = 0x00;
  out[4] = payload.length & 0xff;
  out[5] = 0x00;
  out.set(payload, 6);
  out[out.length - 2] = crc8(payload);
  out[out.length - 1] = 0xff;
  return out;
}

export const CMD_START_PRINTING = new Uint8Array([0x51, 0x78, 0xa3, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff]);
export const CMD_START_PRINTING_NEW = new Uint8Array([0x12, 0x51, 0x78, 0xa3, 0x00, 0x01, 0x00, 0x00, 0x00, 0xff]);
export const CMD_SET_DPI_AS_200 = makeCommand(0xa4, intToBytes(50));
export const CMD_LATTICE_START = makeCommand(0xa6, new Uint8Array([0xaa, 0x55, 0x17, 0x38, 0x44, 0x5f, 0x5f, 0x5f, 0x44, 0x38, 0x2c]));
export const CMD_LATTICE_END = makeCommand(0xa6, new Uint8Array([0xaa, 0x55, 0x17, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x17]));
export const CMD_GET_DEVICE_STATE = makeCommand(0xa3, intToBytes(0x00));
export const CMD_GET_DEVICE_INFO = makeCommand(0xa8, intToBytes(0x00));
export const CMD_UPDATE_DEVICE = makeCommand(0xa9, intToBytes(0x00));

/**
 * Apply previously set energy (Python `apply_energy`)
 */
export function cmdApplyEnergy(): Uint8Array {
  return makeCommand(0xbe, intToBytes(0x01));
}

/**
 * Set paper feed speed (quality). Lower = faster feed; slower = better heating.
 */
export function cmdSetSpeed(value: number): Uint8Array {
  const v = Math.max(0, Math.min(0xffff, Math.floor(value)));
  return makeCommand(0xbd, intToBytes(v));
}

/**
 * Set thermal energy.
 * Range: 0x0000 .. 0xffff
 */
export function cmdSetEnergy(amount: number): Uint8Array {
  const v = Math.max(0, Math.min(0xffff, Math.floor(amount)));
  return makeCommand(0xaf, intToBytes(v));
}

/**
 * Feed paper by pixels (Python `feed_paper`)
 */
export function cmdFeedPaper(pixels: number): Uint8Array {
  const v = Math.max(0, Math.min(0xffff, Math.floor(pixels)));
  return makeCommand(0xa1, intToBytes(v));
}

/**
 * Draw a bitmap row. Input is raw bitmap bytes (width/8 bytes) where bits are MSB->LSB.
 * The device expects bits reversed per byte (Python `draw_bitmap`).
 */
export function cmdDrawBitmap(rowBytes: Uint8Array): Uint8Array {
  const reversed = new Uint8Array(rowBytes.length);
  for (let i = 0; i < rowBytes.length; i++) reversed[i] = reverseBits(rowBytes[i]!);
  return makeCommand(0xa2, reversed);
}

export interface PrinterModel {
  paperWidth: number;
  isNewKind: boolean;
  problemFeeding: boolean;
}

export const MODELS: Record<string, PrinterModel> = (() => {
  const base: PrinterModel = { paperWidth: PRINT_WIDTH, isNewKind: false, problemFeeding: false };
  const models: Record<string, PrinterModel> = {};
  for (const name of ['_ZZ00', 'GB01', 'GB02', 'GB03', 'GT01', 'MX05', 'MX06', 'MX08', 'YT01']) {
    models[name] = { ...base };
  }
  // compressed-capable / new kind
  for (const name of ['GB03']) models[name] = { ...models[name], isNewKind: true };
  // problematic feeding
  for (const name of ['MX05', 'MX06', 'MX08']) models[name] = { ...models[name], problemFeeding: true };
  return models;
})();

/**
 * Generate complete command sequence to print an image
 *
 * @param img - Binary image (2D array of booleans)
 * @param energy - Thermal energy (0x0000-0xFFFF)
 * @param quality - Paper feed speed 28-40 (lower = faster; slower = better heating)
 */
export function cmdsPrintImg(
  img: BinaryImage,
  energy: number = 0xffff,
  quality: number = 36,
  modelName?: string
): Uint8Array {
  const model = (modelName && MODELS[modelName]) ? MODELS[modelName] : MODELS['_ZZ00']!;
  const paperWidth = model.paperWidth;
  const bytesPerRow = paperWidth / 8;

  const parts: Uint8Array[] = [];
  // prepare() sequence, matching Python
  parts.push(CMD_GET_DEVICE_STATE);
  parts.push(model.isNewKind ? CMD_START_PRINTING_NEW : CMD_START_PRINTING);
  parts.push(CMD_SET_DPI_AS_200);
  if (quality) parts.push(cmdSetSpeed(quality));
  parts.push(cmdSetEnergy(energy));
  parts.push(cmdApplyEnergy());
  parts.push(CMD_UPDATE_DEVICE);
  parts.push(CMD_LATTICE_START);

  // bitmap body: one makeCommand(0xa2, rowBytesReversed) per row
  for (const row of img) {
    const rowBytes = new Uint8Array(bytesPerRow);
    for (let x = 0; x < paperWidth; x++) {
      if (row[x]) {
        const byteIndex = (x / 8) | 0;
        const bitIndex = 7 - (x % 8);
        rowBytes[byteIndex] |= (1 << bitIndex);
      }
    }
    parts.push(cmdDrawBitmap(rowBytes));
  }

  // finish() sequence, matching Python
  parts.push(CMD_LATTICE_END);
  parts.push(cmdSetSpeed(8));
  if (model.problemFeeding) {
    const empty = new Uint8Array(bytesPerRow); // all white
    for (let i = 0; i < 128; i++) parts.push(cmdDrawBitmap(empty));
  } else {
    parts.push(cmdFeedPaper(128));
  }
  parts.push(CMD_GET_DEVICE_STATE);
  
  // Concatenate all parts
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  
  return result;
}

/**
 * PeriPage-style bitmap print command stream (ESC/POS-like).
 * Mirrors the Print2BLE preGraphics/scanLine/postGraphics structure.
 */
export function cmdsPrintImgPeriPage(img: BinaryImage): Uint8Array {
  const paperWidth = PRINT_WIDTH;
  const bytesPerRow = paperWidth / 8;
  const height = Math.max(0, img.length);
  const parts: Uint8Array[] = [];

  // preGraphics() for PeriPage
  parts.push(new Uint8Array([0x10, 0xff, 0xfe, 0x01]));
  parts.push(new Uint8Array(12)); // 12 zero bytes
  parts.push(
    new Uint8Array([
      0x1d,
      0x76,
      0x30,
      0x00,
      bytesPerRow & 0xff,
      0x00,
      height & 0xff,
      (height >> 8) & 0xff,
    ])
  );

  // scanLine(): raw row bytes, no Cat framing
  for (const row of img) {
    const rowBytes = new Uint8Array(bytesPerRow);
    for (let x = 0; x < paperWidth; x++) {
      if (row[x]) {
        const byteIndex = (x / 8) | 0;
        const bitIndex = 7 - (x % 8);
        rowBytes[byteIndex] |= 1 << bitIndex;
      }
    }
    parts.push(rowBytes);
  }

  // postGraphics() for PeriPage
  parts.push(new Uint8Array([0x1b, 0x4a, 0x40, 0x10, 0xff, 0xfe, 0x45]));

  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

/**
 * Convert Uint8Array to Buffer for BLE transmission
 */
export function toBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data);
}
