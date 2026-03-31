import AsyncStorage from '@react-native-async-storage/async-storage';

export const INJECT_ONE_BASE_URL = 'https://11z.co/_w';
export const INJECT_ONE_RESPONSE_KEY = 'value';
export const DEFAULT_INJECT_ID = '2';

const DRIVER_SETTINGS_KEY = 'mos:driver:v1';

export interface CustomApiConfig {
  id: string;
  name: string;
  url: string;
  /** JSON key to extract from the response, e.g. "value" */
  responseKey: string;
}

export interface DriverSettings {
  injectId: string;
  customApis: CustomApiConfig[];
}

export const DEFAULT_DRIVER_SETTINGS: DriverSettings = {
  injectId: DEFAULT_INJECT_ID,
  customApis: [],
};

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function createCustomApi(name: string, url: string, responseKey: string): CustomApiConfig {
  return { id: makeId(), name, url, responseKey };
}

export async function loadDriverSettings(): Promise<DriverSettings> {
  try {
    const raw = await AsyncStorage.getItem(DRIVER_SETTINGS_KEY);
    if (!raw) return DEFAULT_DRIVER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DriverSettings>;
    return {
      injectId: parsed.injectId ?? DEFAULT_DRIVER_SETTINGS.injectId,
      customApis: Array.isArray(parsed.customApis) ? parsed.customApis : [],
    };
  } catch {
    return DEFAULT_DRIVER_SETTINGS;
  }
}

export async function saveDriverSettings(settings: DriverSettings): Promise<void> {
  await AsyncStorage.setItem(DRIVER_SETTINGS_KEY, JSON.stringify(settings));
}

export async function addCustomApi(api: CustomApiConfig): Promise<DriverSettings> {
  const settings = await loadDriverSettings();
  const next = { ...settings, customApis: [...settings.customApis, api] };
  await saveDriverSettings(next);
  return next;
}

export async function removeCustomApi(id: string): Promise<DriverSettings> {
  const settings = await loadDriverSettings();
  const next = { ...settings, customApis: settings.customApis.filter((a) => a.id !== id) };
  await saveDriverSettings(next);
  return next;
}

export async function saveInjectId(injectId: string): Promise<void> {
  const settings = await loadDriverSettings();
  await saveDriverSettings({ ...settings, injectId });
}
