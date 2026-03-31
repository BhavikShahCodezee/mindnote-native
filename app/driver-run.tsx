import { useTextToImage } from '@/hooks/useTextToImage';
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { getPrintService } from '@/src/services/printService';
import { INJECT_ONE_BASE_URL, INJECT_ONE_RESPONSE_KEY } from '@/src/storage/driverSettings';
import {
  computeTextToImageLayout,
  fontFamilyForStyle,
  TEXT_TO_IMAGE_CANVAS_H,
  TEXT_TO_IMAGE_CANVAS_W,
} from '@/src/utils/textToImage';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';

function extractBase64FromDataUri(dataUri: string): string {
  const idx = dataUri.indexOf(',');
  return idx >= 0 ? dataUri.slice(idx + 1) : dataUri;
}

const POLL_INTERVAL_MS = 2000;
/** Subtle overlay — easy for you to read, hard for others to notice */
const SECRET_OVERLAY_OPACITY = 0.5;

export default function DriverRunScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    type: string;
    name: string;
    injectId?: string;
    url?: string;
    responseKey?: string;
  }>();

  const printService = getPrintService();
  const { settings, appearance, ready } = useTextToImage();

  const [currentValue, setCurrentValue] = useState<string>('--');
  const [printCount, setPrintCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRunning, setIsRunning] = useState(true);

  const lastPrintedValueRef = useRef<string | null>(null);
  const isPrintingRef = useRef(false);
  const isRunningRef = useRef(true);
  const captureRefView = useRef<View>(null);

  // Derived from settings — same as note-editor
  const fontFamily = useMemo(() => fontFamilyForStyle(settings.fontStyle), [settings.fontStyle]);
  const layout = useMemo(
    () => computeTextToImageLayout(currentValue === '--' ? ' ' : currentValue, settings),
    [currentValue, settings]
  );

  // Fade-in flash when value changes
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const flashValue = useCallback(() => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0.2, duration: 100, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
    ]).start();
  }, [fadeAnim]);

  const buildUrl = useCallback((): { url: string; key: string } => {
    if (params.type === 'inject-one') {
      const id = params.injectId ?? '2';
      return {
        url: `${INJECT_ONE_BASE_URL}/${id}/selection`,
        key: INJECT_ONE_RESPONSE_KEY,
      };
    }
    return {
      url: params.url ?? '',
      key: params.responseKey ?? 'value',
    };
  }, [params]);

  const poll = useCallback(async () => {
    if (!isRunningRef.current) return;

    const { url, key } = buildUrl();
    if (!url) return;

    try {
      const response = await fetch(url, { method: 'GET' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json() as Record<string, unknown>;
      const newValue = String(json[key] ?? '');

      setCurrentValue(newValue);
      setLastUpdated(new Date());
      setLastError(null);

      if (
        lastPrintedValueRef.current !== null &&
        lastPrintedValueRef.current !== newValue &&
        !isPrintingRef.current
      ) {
        flashValue();
        isPrintingRef.current = true;
        setIsPrinting(true);
        try {
          // Wait two frames so the hidden view re-renders with the new value
          await new Promise<void>((r) =>
            requestAnimationFrame(() => requestAnimationFrame(() => r()))
          );

          if (ready && captureRefView.current) {
            const uri = await captureRef(captureRefView.current, {
              format: 'jpg',
              quality: 1,
              result: 'data-uri',
            });
            const b64 = typeof uri === 'string' ? extractBase64FromDataUri(uri) : '';
            if (b64.length >= 32) {
              const device = await ensureConnectedPrinter();
              const result = await printService.printImage('label.jpg', b64, device);
              if (result.success) {
                setPrintCount((n) => n + 1);
                setLastError(null);
              } else {
                setLastError(`Print failed: ${result.message}`);
              }
            } else {
              setLastError('Capture failed: empty image');
            }
          } else {
            setLastError('Label view not ready');
          }
        } catch (err) {
          setLastError(err instanceof Error ? err.message : 'Print error');
        } finally {
          isPrintingRef.current = false;
          setIsPrinting(false);
        }
      }

      lastPrintedValueRef.current = newValue;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : 'Fetch error');
    }
  }, [buildUrl, flashValue, printService, ready]);

  useEffect(() => {
    isRunningRef.current = true;
    setIsRunning(true);

    poll();
    const timer = setInterval(() => {
      if (isRunningRef.current) poll();
    }, POLL_INTERVAL_MS);

    return () => {
      isRunningRef.current = false;
      clearInterval(timer);
    };
  }, [poll]);

  const onStop = useCallback(() => {
    isRunningRef.current = false;
    setIsRunning(false);
    router.back();
  }, [router]);

  const formattedTime = lastUpdated
    ? lastUpdated.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#000" />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Stop only — full opacity so you can always exit */}
        <TouchableOpacity
          style={[styles.stopFab, { top: Math.max(insets.top, 8) + 4 }]}
          onPress={onStop}
          accessibilityLabel="Stop and go back"
        >
          <MaterialIcons name="stop" size={20} color="#fff" />
        </TouchableOpacity>

        {/* Full-screen black — no big centre UI */}
        <View style={styles.fullBlack} />

        {/* Bottom bar: left · centre · right — ~50% opacity */}
        <View
          style={[
            styles.bottomBar,
            { opacity: SECRET_OVERLAY_OPACITY, bottom: Math.max(insets.bottom, 12) + 8 },
          ]}
          pointerEvents="none"
        >
          {/* Left */}
          <View style={styles.bottomColLeft}>
            <View style={styles.dotRowLeft}>
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: isRunning && !lastError ? '#22c55e' : '#374151' },
                ]}
              />
              <View
                style={[
                  styles.statusDot,
                  { backgroundColor: lastError ? '#ef4444' : '#374151' },
                ]}
              />
            </View>
            <Text style={styles.secretSourceLeft} numberOfLines={2}>
              {params.name ?? 'API'}
            </Text>
          </View>

          {/* Centre — current value */}
          <View style={styles.bottomColCenter}>
            <Animated.Text
              style={[styles.secretValueCenter, { fontFamily, opacity: fadeAnim }]}
              numberOfLines={5}
            >
              {currentValue}
            </Animated.Text>
          </View>

          {/* Right — meta, printing, error */}
          <View style={styles.bottomColRight}>
            <Text style={styles.secretMeta}>
              {formattedTime} · {printCount} prints · {isRunning ? `${POLL_INTERVAL_MS / 1000}s` : 'off'}
            </Text>
            {isPrinting ? (
              <View style={styles.secretPrintingRow}>
                <ActivityIndicator size="small" color="#fbbf24" />
                <Text style={styles.secretPrintingText}>Printing…</Text>
              </View>
            ) : null}
            {lastError ? (
              <Text style={styles.secretError} numberOfLines={3}>
                {lastError}
              </Text>
            ) : null}
          </View>
        </View>

        {/* ── Off-screen ticket canvas — captures label image for printing ── */}
        <View style={styles.hiddenHost} pointerEvents="none" collapsable={false}>
          <View
            ref={captureRefView}
            collapsable={false}
            style={[
              styles.ticketCanvas,
              {
                width: TEXT_TO_IMAGE_CANVAS_W,
                height: TEXT_TO_IMAGE_CANVAS_H,
                backgroundColor: appearance.backgroundColor,
              },
            ]}
          >
            <View
              style={[
                styles.labelBox,
                {
                  left: layout.labelLeft,
                  top: layout.labelTop,
                  width: layout.boxWidth,
                  height: layout.labelMinHeight,
                  transform: [{ rotate: `${layout.rotationDeg}deg` }],
                },
              ]}
            >
              <Text
                style={{
                  fontSize: layout.fontSize,
                  lineHeight: layout.lineHeight,
                  fontFamily,
                  color: appearance.textColor,
                  textAlign: 'center',
                }}
              >
                {layout.lines.join('\n')}
              </Text>
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  safe: { flex: 1 },

  stopFab: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(31,41,55,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullBlack: { flex: 1, backgroundColor: '#000' },

  bottomBar: {
    position: 'absolute',
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 6,
  },
  bottomColLeft: {
    flex: 1,
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
  },
  bottomColCenter: {
    flex: 1.15,
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 0,
    paddingHorizontal: 4,
  },
  bottomColRight: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 4,
    minWidth: 0,
  },
  dotRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  secretSourceLeft: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'left',
    width: '100%',
  },
  secretValueCenter: {
    color: '#f3f4f6',
    fontSize: 14,
    lineHeight: 19,
    textAlign: 'center',
    width: '100%',
  },
  secretMeta: {
    color: '#6b7280',
    fontSize: 10,
    textAlign: 'right',
    width: '100%',
  },
  secretPrintingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 2,
    width: '100%',
  },
  secretPrintingText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
  secretError: {
    color: '#f87171',
    fontSize: 10,
    textAlign: 'right',
    marginTop: 2,
    width: '100%',
  },

  // Hidden off-screen view used for label image capture (same as note-editor)
  hiddenHost: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: TEXT_TO_IMAGE_CANVAS_W,
    height: TEXT_TO_IMAGE_CANVAS_H,
    overflow: 'hidden',
  },
  ticketCanvas: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  labelBox: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
