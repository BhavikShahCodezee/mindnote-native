import AsyncStorage from '@react-native-async-storage/async-storage';

export type FontStyleKey = 'System' | 'Excalifont' | 'ShadowsIntoLight';
export type TextAlignKey = 'left' | 'center' | 'right';
export type VerticalPositionKey = 'top' | 'center' | 'bottom';

/** Base font size (px) used when preview scale is 1. Matches legacy default font size. */
export const BASE_PREVIEW_FONT_PX = 20;

export const PREVIEW_SCALE_MIN = 0.35;
export const PREVIEW_SCALE_MAX = 2.5;

export interface AppSettings {
  fontStyle: FontStyleKey;
  /** Proportional scale of the preview text (1 = BASE_PREVIEW_FONT_PX). */
  previewScale: number;
  /** Normalized horizontal centre of the label in the preview inner area (0–1). */
  previewCenterX: number;
  /** Normalized vertical centre of the label in the preview inner area (0–1). */
  previewCenterY: number;
  /** Rotation in degrees (preview; thermal text print remains unrotated). */
  previewRotationDeg: number;
  /** Kept for printing; no longer exposed in Settings UI (defaults to true). */
  wrapBySpaces: boolean;
}

const SETTINGS_KEY_V3 = 'mos:settings:v3';
const SETTINGS_KEY_V2 = 'mos:settings:v2';
const SETTINGS_KEY_V1 = 'mos:settings:v1';

export const DEFAULT_SETTINGS: AppSettings = {
  fontStyle: 'System',
  previewScale: 1,
  previewCenterX: 0.5,
  previewCenterY: 0.5,
  previewRotationDeg: 0,
  wrapBySpaces: true,
};

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

export function clampPreviewScale(v: number): number {
  return Math.min(PREVIEW_SCALE_MAX, Math.max(PREVIEW_SCALE_MIN, v));
}

function normalizePartial(parsed: Partial<AppSettings>): AppSettings {
  return {
    fontStyle: parsed.fontStyle ?? DEFAULT_SETTINGS.fontStyle,
    previewScale: clampPreviewScale(parsed.previewScale ?? DEFAULT_SETTINGS.previewScale),
    previewCenterX: clamp01(parsed.previewCenterX ?? DEFAULT_SETTINGS.previewCenterX),
    previewCenterY: clamp01(parsed.previewCenterY ?? DEFAULT_SETTINGS.previewCenterY),
    previewRotationDeg: Number.isFinite(parsed.previewRotationDeg)
      ? parsed.previewRotationDeg!
      : DEFAULT_SETTINGS.previewRotationDeg,
    wrapBySpaces: parsed.wrapBySpaces ?? DEFAULT_SETTINGS.wrapBySpaces,
  };
}

interface LegacyV2 {
  fontStyle?: FontStyleKey;
  fontSize?: number;
  horizontalPosition?: TextAlignKey;
  verticalPosition?: VerticalPositionKey;
  wrapBySpaces?: boolean;
}

function mapLegacyAlignToCenterX(align: TextAlignKey | undefined): number {
  if (align === 'left') return 0.28;
  if (align === 'right') return 0.72;
  return 0.5;
}

function mapLegacyVerticalToCenterY(v: VerticalPositionKey | undefined): number {
  if (v === 'top') return 0.28;
  if (v === 'bottom') return 0.72;
  return 0.5;
}

function migrateFromV2(parsed: LegacyV2): AppSettings {
  const fontSize = parsed.fontSize ?? BASE_PREVIEW_FONT_PX;
  return normalizePartial({
    fontStyle: parsed.fontStyle,
    previewScale: clampPreviewScale(fontSize / BASE_PREVIEW_FONT_PX),
    previewCenterX: mapLegacyAlignToCenterX(parsed.horizontalPosition),
    previewCenterY: mapLegacyVerticalToCenterY(parsed.verticalPosition),
    previewRotationDeg: 0,
    wrapBySpaces: parsed.wrapBySpaces,
  });
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const rawV3 = await AsyncStorage.getItem(SETTINGS_KEY_V3);
    if (rawV3) {
      const parsed = JSON.parse(rawV3) as Partial<AppSettings>;
      return normalizePartial(parsed);
    }

    const rawV2 = await AsyncStorage.getItem(SETTINGS_KEY_V2);
    if (rawV2) {
      const migrated = migrateFromV2(JSON.parse(rawV2) as LegacyV2);
      await AsyncStorage.setItem(SETTINGS_KEY_V3, JSON.stringify(migrated));
      return migrated;
    }

    const rawV1 = await AsyncStorage.getItem(SETTINGS_KEY_V1);
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as LegacyV2 & { alignment?: TextAlignKey };
      const withAlign: LegacyV2 = {
        ...parsed,
        horizontalPosition: parsed.horizontalPosition ?? parsed.alignment,
      };
      const migrated = migrateFromV2(withAlign);
      await AsyncStorage.setItem(SETTINGS_KEY_V3, JSON.stringify(migrated));
      return migrated;
    }

    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY_V3, JSON.stringify(normalizePartial(settings)));
}

/** Rasterized text print uses integer font size; derived from preview scale. */
export function fontSizeForPrint(settings: AppSettings): number {
  const raw = Math.round(BASE_PREVIEW_FONT_PX * clampPreviewScale(settings.previewScale));
  return Math.max(12, Math.min(32, raw));
}

/** Map preview horizontal placement to printer line alignment. */
export function horizontalAlignForPrint(settings: AppSettings): TextAlignKey {
  const t = 0.34;
  if (settings.previewCenterX < t) return 'left';
  if (settings.previewCenterX > 1 - t) return 'right';
  return 'center';
}
