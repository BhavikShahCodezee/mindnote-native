import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, loadAppSettings, type AppSettings } from '@/src/storage/appSettings';
import {
  DEFAULT_TEXT_TO_IMAGE_APPEARANCE,
  loadTextToImageAppearance,
  type TextToImageAppearance,
} from '@/src/storage/textToImageAppearance';

export interface UseTextToImageResult {
  settings: AppSettings;
  appearance: TextToImageAppearance;
  reload: () => Promise<void>;
  ready: boolean;
}

/**
 * Loads print preview settings + text-to-image appearance from AsyncStorage.
 */
export function useTextToImage(): UseTextToImageResult {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [appearance, setAppearance] = useState<TextToImageAppearance>(DEFAULT_TEXT_TO_IMAGE_APPEARANCE);
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    const [s, a] = await Promise.all([loadAppSettings(), loadTextToImageAppearance()]);
    setSettings(s);
    setAppearance(a);
    setReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [s, a] = await Promise.all([loadAppSettings(), loadTextToImageAppearance()]);
        if (!cancelled) {
          setSettings(s);
          setAppearance(a);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { settings, appearance, reload, ready };
}
