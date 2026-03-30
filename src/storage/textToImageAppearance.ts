import AsyncStorage from '@react-native-async-storage/async-storage';

/** Colours for text-to-image preview (separate from Settings UI; persisted for the feature). */
export interface TextToImageAppearance {
  textColor: string;
  backgroundColor: string;
}

const STORAGE_KEY = 'mos:textToImage:appearance:v1';

export const DEFAULT_TEXT_TO_IMAGE_APPEARANCE: TextToImageAppearance = {
  textColor: '#1a1a1a',
  backgroundColor: '#ffffff',
};

function isHexColor(s: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(s.trim());
}

export async function loadTextToImageAppearance(): Promise<TextToImageAppearance> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_TEXT_TO_IMAGE_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<TextToImageAppearance>;
    const textColor =
      typeof parsed.textColor === 'string' && isHexColor(parsed.textColor)
        ? parsed.textColor
        : DEFAULT_TEXT_TO_IMAGE_APPEARANCE.textColor;
    const backgroundColor =
      typeof parsed.backgroundColor === 'string' && isHexColor(parsed.backgroundColor)
        ? parsed.backgroundColor
        : DEFAULT_TEXT_TO_IMAGE_APPEARANCE.backgroundColor;
    return { textColor, backgroundColor };
  } catch {
    return DEFAULT_TEXT_TO_IMAGE_APPEARANCE;
  }
}

export async function saveTextToImageAppearance(appearance: TextToImageAppearance): Promise<void> {
  const normalized: TextToImageAppearance = {
    textColor: isHexColor(appearance.textColor) ? appearance.textColor : DEFAULT_TEXT_TO_IMAGE_APPEARANCE.textColor,
    backgroundColor: isHexColor(appearance.backgroundColor)
      ? appearance.backgroundColor
      : DEFAULT_TEXT_TO_IMAGE_APPEARANCE.backgroundColor,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
}
