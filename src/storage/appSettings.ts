import AsyncStorage from '@react-native-async-storage/async-storage';

export type FontStyleKey = 'System' | 'Excalifont' | 'ShadowsIntoLight';
export type TextAlignKey = 'left' | 'center' | 'right';
export type VerticalPositionKey = 'top' | 'center' | 'bottom';

export interface AppSettings {
  fontStyle: FontStyleKey;
  fontSize: number;
  horizontalPosition: TextAlignKey;
  verticalPosition: VerticalPositionKey;
  wrapBySpaces: boolean;
}

const SETTINGS_KEY = 'mos:settings:v2';

export const DEFAULT_SETTINGS: AppSettings = {
  fontStyle: 'System',
  fontSize: 20,
  horizontalPosition: 'left',
  verticalPosition: 'top',
  wrapBySpaces: true,
};

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const rawV2 = await AsyncStorage.getItem(SETTINGS_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as Partial<AppSettings>;
      return {
        fontStyle: parsed.fontStyle ?? DEFAULT_SETTINGS.fontStyle,
        fontSize: parsed.fontSize ?? DEFAULT_SETTINGS.fontSize,
        horizontalPosition: parsed.horizontalPosition ?? DEFAULT_SETTINGS.horizontalPosition,
        verticalPosition: parsed.verticalPosition ?? DEFAULT_SETTINGS.verticalPosition,
        wrapBySpaces: parsed.wrapBySpaces ?? DEFAULT_SETTINGS.wrapBySpaces,
      };
    }
    const rawV1 = await AsyncStorage.getItem('mos:settings:v1');
    if (rawV1) {
      const parsed = JSON.parse(rawV1) as Partial<AppSettings> & { alignment?: TextAlignKey };
      return {
        fontStyle: parsed.fontStyle ?? DEFAULT_SETTINGS.fontStyle,
        fontSize: parsed.fontSize ?? DEFAULT_SETTINGS.fontSize,
        horizontalPosition: parsed.horizontalPosition ?? parsed.alignment ?? DEFAULT_SETTINGS.horizontalPosition,
        verticalPosition: parsed.verticalPosition ?? DEFAULT_SETTINGS.verticalPosition,
        wrapBySpaces: parsed.wrapBySpaces ?? DEFAULT_SETTINGS.wrapBySpaces,
      };
    }
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

