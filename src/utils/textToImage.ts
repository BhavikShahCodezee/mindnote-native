/**
 * Layout math for “text as image” preview — aligned with Settings live preview
 * (same padding, box width, centre, rotation as app/settings.tsx LabelPreviewCanvas).
 * Ported from mosmos-style ticket preview dimensions (57mm × 63mm canvas).
 */

import {
  SETTINGS_PREVIEW_HEIGHT_PX,
  SETTINGS_PREVIEW_WIDTH_PX,
} from '@/constants/printTicket';
import {
  BASE_PREVIEW_FONT_PX,
  clampPreviewScale,
  type AppSettings,
} from '@/src/storage/appSettings';
import { wrapTextToLines } from '@/src/text/textWrap';

const PREVIEW_PADDING_PX = 12;
const LINE_HEIGHT_MULT = 1.3;

export const TEXT_TO_IMAGE_CANVAS_W = SETTINGS_PREVIEW_WIDTH_PX;
export const TEXT_TO_IMAGE_CANVAS_H = SETTINGS_PREVIEW_HEIGHT_PX;

export function fontFamilyForStyle(fontStyle: AppSettings['fontStyle']): string | undefined {
  if (fontStyle === 'Excalifont') return 'Excalifont';
  if (fontStyle === 'ShadowsIntoLight') return 'ShadowsIntoLight';
  return undefined;
}

export interface TextToImageLabelLayout {
  canvasW: number;
  canvasH: number;
  innerW: number;
  innerH: number;
  fontSize: number;
  lineHeight: number;
  boxWidth: number;
  lines: string[];
  /** Absolute position inside canvas (ticket coordinates). */
  labelLeft: number;
  labelTop: number;
  labelMinHeight: number;
  rotationDeg: number;
}

/**
 * Compute label box position and text lines for the ticket-sized canvas.
 */
export function computeTextToImageLayout(text: string, settings: AppSettings): TextToImageLabelLayout {
  const innerW = Math.max(1, SETTINGS_PREVIEW_WIDTH_PX - 2 * PREVIEW_PADDING_PX);
  const innerH = Math.max(1, SETTINGS_PREVIEW_HEIGHT_PX - 2 * PREVIEW_PADDING_PX);

  const rawFs = Math.round(BASE_PREVIEW_FONT_PX * clampPreviewScale(settings.previewScale));
  const fontSize = Math.max(12, Math.min(60, rawFs));
  const lineHeight = Math.max(1, fontSize * LINE_HEIGHT_MULT);

  // Text wraps using the preview inner width as the max constraint.
  // The final bounding box width becomes the widest produced line (so there is no extra padding).
  const maxWidthForWrappingPx = innerW;

  const trimmed = text.trim();
  const lines = wrapTextToLines(
    trimmed.length ? text : ' ',
    fontSize,
    settings.wrapBySpaces,
    maxWidthForWrappingPx
  );
  const safeLines = lines.length ? lines : [' '];

  // Estimate the actual rendered pixel width using the same approximation as `wrapTextToLines()`.
  const approxCharWidthPx = fontSize * 0.55;
  const widestLineChars = safeLines.reduce((max, l) => Math.max(max, l.length), 0);
  const boxWidth = Math.max(1, Math.min(innerW, widestLineChars * approxCharWidthPx));

  const textBlockHeight = Math.max(lineHeight, safeLines.length * lineHeight);

  const centerPxX = PREVIEW_PADDING_PX + settings.previewCenterX * innerW;
  const centerPxY = PREVIEW_PADDING_PX + settings.previewCenterY * innerH;
  const labelLeft = centerPxX - boxWidth / 2;
  const labelTop = centerPxY - textBlockHeight / 2;

  return {
    canvasW: SETTINGS_PREVIEW_WIDTH_PX,
    canvasH: SETTINGS_PREVIEW_HEIGHT_PX,
    innerW,
    innerH,
    fontSize,
    lineHeight,
    boxWidth,
    lines: safeLines,
    labelLeft,
    labelTop,
    labelMinHeight: textBlockHeight,
    rotationDeg: Number.isFinite(settings.previewRotationDeg) ? settings.previewRotationDeg : 0,
  };
}
