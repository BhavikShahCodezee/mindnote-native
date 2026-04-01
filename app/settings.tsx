import {
  SETTINGS_PREVIEW_HEIGHT_PX,
  SETTINGS_PREVIEW_WIDTH_PX,
  TICKET_HEIGHT_MM,
  TICKET_WIDTH_MM,
} from '@/constants/printTicket';
import {
  BASE_PREVIEW_FONT_PX,
  DEFAULT_SETTINGS,
  FontStyleKey,
  clampPreviewScale,
  loadAppSettings,
  saveAppSettings,
} from '@/src/storage/appSettings';
import { usePrinterStore } from '@/src/store/usePrinterStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

const FONT_OPTIONS: FontStyleKey[] = ['Excalifont', 'ShadowsIntoLight', 'QEDaveMergens', 'QETonyFlores'];

const FONT_FAMILY_MAP: Record<FontStyleKey, string> = {
  Excalifont: 'Excalifont',
  ShadowsIntoLight: 'ShadowsIntoLight',
  QEDaveMergens: 'QEDaveMergens',
  QETonyFlores: 'QETonyFlores',
};

const FONT_DISPLAY_NAMES: Record<FontStyleKey, string> = {
  Excalifont: 'Style 1',
  ShadowsIntoLight: 'Style 2',
  QEDaveMergens: 'Style 3',
  QETonyFlores: 'Style 4',
};

const PREVIEW_CANVAS_W = SETTINGS_PREVIEW_WIDTH_PX;
const PREVIEW_CANVAS_H = SETTINGS_PREVIEW_HEIGHT_PX;
const PREVIEW_PADDING = 12;
const LINE_HEIGHT_MULTIPLIER = 1.3;

type HandleKind = 'move' | 'rotate' | 'corner-tl' | 'corner-tr' | 'corner-bl' | 'corner-br' | null;
type CornerKey = 'tl' | 'tr' | 'bl' | 'br';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function clampNormalizedCenter(
  nx: number,
  ny: number,
  boxW: number,
  boxH: number,
  rotationDeg: number,
  innerW: number,
  innerH: number
): { nx: number; ny: number } {
  const w = Math.max(1, boxW);
  const h = Math.max(1, boxH);
  const rad = (rotationDeg * Math.PI) / 180;
  const hx = 0.5 * (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad)));
  const hy = 0.5 * (Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad)));
  const minNx = hx / innerW;
  const maxNx = 1 - hx / innerW;
  const minNy = hy / innerH;
  const maxNy = 1 - hy / innerH;
  if (!(minNx <= maxNx && minNy <= maxNy)) {
    return { nx: clamp01(nx), ny: clamp01(ny) };
  }
  return {
    nx: Math.min(maxNx, Math.max(minNx, nx)),
    ny: Math.min(maxNy, Math.max(minNy, ny)),
  };
}

interface LabelPreviewCanvasProps {
  previewText: string;
  previewFontFamily: string;
  previewScale: number;
  previewCenterX: number;
  previewCenterY: number;
  previewRotationDeg: number;
  onPreviewScale: (v: number) => void;
  onPreviewCenter: (x: number, y: number) => void;
  onPreviewRotationDeg: (deg: number) => void;
}

function LabelPreviewCanvas({
  previewText,
  previewFontFamily,
  previewScale,
  previewCenterX,
  previewCenterY,
  previewRotationDeg,
  onPreviewScale,
  onPreviewCenter,
  onPreviewRotationDeg,
}: LabelPreviewCanvasProps) {
  const canvasRef = useRef<View>(null);
  const [textLayout, setTextLayout] = useState({ w: 1, h: 1 });
  const [activeHandle, setActiveHandle] = useState<HandleKind>(null);
  const [innerSize, setInnerSize] = useState({
    w: PREVIEW_CANVAS_W - 2 * PREVIEW_PADDING,
    h: PREVIEW_CANVAS_H - 2 * PREVIEW_PADDING,
  });

  const innerWRef = useRef(PREVIEW_CANVAS_W - 2 * PREVIEW_PADDING);
  const innerHRef = useRef(PREVIEW_CANVAS_H - 2 * PREVIEW_PADDING);
  const canvasWindowRef = useRef({ x: 0, y: 0, width: PREVIEW_CANVAS_W, height: PREVIEW_CANVAS_H });

  const previewCenterXRef = useRef(previewCenterX);
  const previewCenterYRef = useRef(previewCenterY);
  const previewScaleRef = useRef(previewScale);
  const previewRotationDegRef = useRef(previewRotationDeg);
  const textLayoutRef = useRef(textLayout);

  useEffect(() => {
    previewCenterXRef.current = previewCenterX;
  }, [previewCenterX]);
  useEffect(() => {
    previewCenterYRef.current = previewCenterY;
  }, [previewCenterY]);
  useEffect(() => {
    previewScaleRef.current = previewScale;
  }, [previewScale]);
  useEffect(() => {
    previewRotationDegRef.current = previewRotationDeg;
  }, [previewRotationDeg]);
  useEffect(() => {
    textLayoutRef.current = textLayout;
  }, [textLayout]);
  useEffect(() => {
    const constrained = clampNormalizedCenter(
      previewCenterX,
      previewCenterY,
      textLayout.w,
      textLayout.h,
      previewRotationDeg,
      innerSize.w,
      innerSize.h
    );
    if (
      Math.abs(constrained.nx - previewCenterX) > 0.0001 ||
      Math.abs(constrained.ny - previewCenterY) > 0.0001
    ) {
      onPreviewCenter(constrained.nx, constrained.ny);
    }
  }, [innerSize.h, innerSize.w, onPreviewCenter, previewCenterX, previewCenterY, previewRotationDeg, textLayout.h, textLayout.w]);

  const moveStartRef = useRef({ nx: 0.5, ny: 0.5 });
  const scaleStartRef = useRef<{ scale: number; corner: CornerKey }>({ scale: 1, corner: 'br' });
  const rotateStartRef = useRef({ angle: 0, rotation: 0 });

  const lineHeight = useMemo(
    () => {
      const raw = Math.round(BASE_PREVIEW_FONT_PX * clampPreviewScale(previewScale));
      const clamped = Math.max(12, Math.min(60, raw));
      return Math.max(1, clamped * LINE_HEIGHT_MULTIPLIER);
    },
    [previewScale]
  );
  const fontSize = useMemo(() => {
    const raw = Math.round(BASE_PREVIEW_FONT_PX * clampPreviewScale(previewScale));
    return Math.max(12, Math.min(60, raw));
  }, [previewScale]);

  const refreshCanvasWindow = useCallback(() => {
    canvasRef.current?.measureInWindow((x, y, width, height) => {
      canvasWindowRef.current = { x, y, width, height };
    });
  }, []);

  const onMoveStart = useCallback(() => {
    refreshCanvasWindow();
    moveStartRef.current = { nx: previewCenterXRef.current, ny: previewCenterYRef.current };
    setActiveHandle('move');
  }, [refreshCanvasWindow]);

  const onMoveUpdate = useCallback(
    (tx: number, ty: number) => {
      const innerW = innerWRef.current;
      const innerH = innerHRef.current;
      const { w, h } = textLayoutRef.current;
      const rot = previewRotationDegRef.current;
      const nx = moveStartRef.current.nx + tx / innerW;
      const ny = moveStartRef.current.ny + ty / innerH;
      const c = clampNormalizedCenter(nx, ny, w, h, rot, innerW, innerH);
      onPreviewCenter(c.nx, c.ny);
    },
    [onPreviewCenter]
  );

  const onMoveEnd = useCallback(() => {
    setActiveHandle(null);
  }, []);

  const onScaleStart = useCallback((corner: CornerKey) => {
    scaleStartRef.current = { scale: previewScaleRef.current, corner };
    setActiveHandle(`corner-${corner}` as HandleKind);
  }, []);

  const onScaleUpdate = useCallback(
    (tx: number, ty: number) => {
      const innerW = innerWRef.current;
      const innerH = innerHRef.current;
      const { w, h } = textLayoutRef.current;
      const rot = previewRotationDegRef.current;
      const cx = previewCenterXRef.current * innerW;
      const cy = previewCenterYRef.current * innerH;
      const availX = Math.max(1, Math.min(cx, innerW - cx));
      const availY = Math.max(1, Math.min(cy, innerH - cy));
      const rad = (rot * Math.PI) / 180;
      const curHx = Math.max(1, 0.5 * (Math.abs(w * Math.cos(rad)) + Math.abs(h * Math.sin(rad))));
      const curHy = Math.max(1, 0.5 * (Math.abs(w * Math.sin(rad)) + Math.abs(h * Math.cos(rad))));
      const boundaryMaxScale = scaleStartRef.current.scale * Math.max(0.1, Math.min(availX / curHx, availY / curHy));
      // Minimum size floor; bounding box width/height should follow the real measured text.
      const minScale = 0.2;
      const maxScale = Math.max(minScale, Math.min(boundaryMaxScale, 4));
      const { corner } = scaleStartRef.current;
      const sx = corner === 'tl' || corner === 'bl' ? -1 : 1;
      const sy = corner === 'tl' || corner === 'tr' ? -1 : 1;
      const projected = (tx * sx + ty * sy) / Math.SQRT2;
      const next = Math.min(
        maxScale,
        Math.max(minScale, clampPreviewScale(scaleStartRef.current.scale + projected / 120))
      );
      onPreviewScale(next);
    },
    [onPreviewScale]
  );

  const onScaleEnd = useCallback(() => {
    setActiveHandle(null);
  }, []);

  const onRotateStart = useCallback(
    (ax: number, ay: number) => {
      refreshCanvasWindow();
      const cx =
        canvasWindowRef.current.x +
        PREVIEW_PADDING +
        previewCenterXRef.current * innerWRef.current;
      const cy =
        canvasWindowRef.current.y +
        PREVIEW_PADDING +
        previewCenterYRef.current * innerHRef.current;
      rotateStartRef.current = {
        angle: Math.atan2(ay - cy, ax - cx),
        rotation: previewRotationDegRef.current,
      };
      setActiveHandle('rotate');
    },
    [refreshCanvasWindow]
  );

  const onRotateUpdate = useCallback(
    (ax: number, ay: number) => {
      const cx =
        canvasWindowRef.current.x +
        PREVIEW_PADDING +
        previewCenterXRef.current * innerWRef.current;
      const cy =
        canvasWindowRef.current.y +
        PREVIEW_PADDING +
        previewCenterYRef.current * innerHRef.current;
      const a1 = Math.atan2(ay - cy, ax - cx);
      const deltaDeg = ((a1 - rotateStartRef.current.angle) * 180) / Math.PI;
      const nextRotation = rotateStartRef.current.rotation + deltaDeg;
      const { w, h } = textLayoutRef.current;
      const constrained = clampNormalizedCenter(
        previewCenterXRef.current,
        previewCenterYRef.current,
        w,
        h,
        nextRotation,
        innerWRef.current,
        innerHRef.current
      );
      onPreviewCenter(constrained.nx, constrained.ny);
      onPreviewRotationDeg(nextRotation);
    },
    [onPreviewCenter, onPreviewRotationDeg]
  );

  const onRotateEnd = useCallback(() => {
    setActiveHandle(null);
  }, []);

  const moveGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          runOnJS(onMoveStart)();
        })
        .onUpdate((e) => {
          runOnJS(onMoveUpdate)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onMoveEnd)();
        })
        .onFinalize(() => {
          runOnJS(onMoveEnd)();
        }),
    [onMoveStart, onMoveUpdate, onMoveEnd]
  );

  const scaleGestureTl = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          runOnJS(onScaleStart)('tl');
        })
        .onUpdate((e) => {
          runOnJS(onScaleUpdate)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onScaleEnd)();
        })
        .onFinalize(() => {
          runOnJS(onScaleEnd)();
        }),
    [onScaleStart, onScaleUpdate, onScaleEnd]
  );
  const scaleGestureTr = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          runOnJS(onScaleStart)('tr');
        })
        .onUpdate((e) => {
          runOnJS(onScaleUpdate)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onScaleEnd)();
        })
        .onFinalize(() => {
          runOnJS(onScaleEnd)();
        }),
    [onScaleStart, onScaleUpdate, onScaleEnd]
  );
  const scaleGestureBl = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          runOnJS(onScaleStart)('bl');
        })
        .onUpdate((e) => {
          runOnJS(onScaleUpdate)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onScaleEnd)();
        })
        .onFinalize(() => {
          runOnJS(onScaleEnd)();
        }),
    [onScaleStart, onScaleUpdate, onScaleEnd]
  );
  const scaleGestureBr = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          runOnJS(onScaleStart)('br');
        })
        .onUpdate((e) => {
          runOnJS(onScaleUpdate)(e.translationX, e.translationY);
        })
        .onEnd(() => {
          runOnJS(onScaleEnd)();
        })
        .onFinalize(() => {
          runOnJS(onScaleEnd)();
        }),
    [onScaleStart, onScaleUpdate, onScaleEnd]
  );

  const rotateGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          runOnJS(onRotateStart)(e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          runOnJS(onRotateUpdate)(e.absoluteX, e.absoluteY);
        })
        .onEnd(() => {
          runOnJS(onRotateEnd)();
        })
        .onFinalize(() => {
          runOnJS(onRotateEnd)();
        }),
    [onRotateStart, onRotateUpdate, onRotateEnd]
  );

  const centerPxX = PREVIEW_PADDING + previewCenterX * innerSize.w;
  const centerPxY = PREVIEW_PADDING + previewCenterY * innerSize.h;
  const left = centerPxX - textLayout.w / 2;
  const top = centerPxY - textLayout.h / 2;

  const displayRotation = previewRotationDeg % 360;

  return (
    <View style={styles.previewOuter}>
      <View
        ref={canvasRef}
        style={styles.previewPaper}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          const iw = Math.max(1, width - 2 * PREVIEW_PADDING);
          const ih = Math.max(1, height - 2 * PREVIEW_PADDING);
          innerWRef.current = iw;
          innerHRef.current = ih;
          setInnerSize({ w: iw, h: ih });
          requestAnimationFrame(() => refreshCanvasWindow());
        }}
      >
        <View
          style={[
            styles.labelObject,
            {
              left,
              top,
              // Do not manually set width/height. The dashed box must tightly wrap measured text.
              transform: [{ rotate: `${previewRotationDeg}deg` }],
            },
          ]}
        >
          <View style={styles.dashedBox} pointerEvents="none" />
          <GestureDetector gesture={moveGesture}>
            <View style={styles.moveArea} />
          </GestureDetector>
            <Text
              pointerEvents="none"
              onLayout={(ev) => {
                const { width, height } = ev.nativeEvent.layout;
                setTextLayout({ w: width, h: height });
              }}
              style={[
                styles.previewText,
                {
                  fontSize,
                  lineHeight,
                  fontFamily: previewFontFamily,
                  textAlign: 'center',
                  // Wrap naturally within the preview inner width; bounding box width becomes max line width.
                  maxWidth: innerSize.w,
                },
              ]}
            >
              {previewText || 'Preview'}
            </Text>
            {/* Explicit move handle (affordance). Dragging anywhere on the text also works. */}
            <GestureDetector gesture={moveGesture}>
              <View style={styles.moveHandleTouch} accessibilityLabel="Move text">
                <View style={styles.moveHandleCircle} />
              </View>
            </GestureDetector>
            <Text
              pointerEvents="none"
              style={[styles.moveCursorHint, activeHandle === 'move' && styles.moveCursorHintActive]}
            >
              ✥
            </Text>

            <GestureDetector gesture={scaleGestureTl}>
              <View style={styles.handleCornerTopLeft} accessibilityLabel="Resize top left">
                <View style={[styles.handleSquare, activeHandle === 'corner-tl' && styles.handleSquareActive]}>
                  <Text style={[styles.cornerArrowText, activeHandle === 'corner-tl' && styles.cornerArrowTextActive]}>↖</Text>
                </View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureTr}>
              <View style={styles.handleCornerTopRight} accessibilityLabel="Resize top right">
                <View style={[styles.handleSquare, activeHandle === 'corner-tr' && styles.handleSquareActive]}>
                  <Text style={[styles.cornerArrowText, activeHandle === 'corner-tr' && styles.cornerArrowTextActive]}>↗</Text>
                </View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureBl}>
              <View style={styles.handleCornerBottomLeft} accessibilityLabel="Resize bottom left">
                <View style={[styles.handleSquare, activeHandle === 'corner-bl' && styles.handleSquareActive]}>
                  <Text style={[styles.cornerArrowText, activeHandle === 'corner-bl' && styles.cornerArrowTextActive]}>↙</Text>
                </View>
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureBr}>
              <View style={styles.handleCornerBottomRight} accessibilityLabel="Resize bottom right">
                <View style={[styles.handleSquare, activeHandle === 'corner-br' && styles.handleSquareActive]}>
                  <Text style={[styles.cornerArrowText, activeHandle === 'corner-br' && styles.cornerArrowTextActive]}>↘</Text>
                </View>
              </View>
            </GestureDetector>

            <View style={styles.rotateStem} pointerEvents="none" />
            <GestureDetector gesture={rotateGesture}>
              <View style={styles.handleRotateTouch} accessibilityLabel="Rotate label">
                <View style={styles.handleCircle} />
                {activeHandle === 'rotate' ? <Text style={styles.handleCursorRotate}>↻</Text> : null}
              </View>
            </GestureDetector>
        </View>

        <View style={styles.previewMeta} pointerEvents="none">
          <Text style={styles.previewMetaText}>
            {TICKET_WIDTH_MM}mm x {TICKET_HEIGHT_MM}mm
          </Text>
        </View>
      </View>

      <View style={styles.liveStats}>
        <Text style={styles.liveStatsText}>
          Scale {previewScale.toFixed(2)}× · Pos {Math.round(previewCenterX * 100)}%,{' '}
          {Math.round(previewCenterY * 100)}% · Rot {displayRotation.toFixed(0)}°
        </Text>
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const isDarkMode = usePrinterStore((s) => s.isDarkMode);
  const SC = isDarkMode ? SETTINGS_DARK : SETTINGS_LIGHT;

  const [fontStyle, setFontStyle] = useState<FontStyleKey>(DEFAULT_SETTINGS.fontStyle);
  const [previewScale, setPreviewScale] = useState<number>(DEFAULT_SETTINGS.previewScale);
  const [previewCenterX, setPreviewCenterX] = useState<number>(DEFAULT_SETTINGS.previewCenterX);
  const [previewCenterY, setPreviewCenterY] = useState<number>(DEFAULT_SETTINGS.previewCenterY);
  const [previewRotationDeg, setPreviewRotationDeg] = useState<number>(DEFAULT_SETTINGS.previewRotationDeg);
  const [wrapBySpaces, setWrapBySpaces] = useState<boolean>(DEFAULT_SETTINGS.wrapBySpaces);
  const [previewText, setPreviewText] = useState<string>('Prediction');

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadAppSettings();
      setFontStyle(settings.fontStyle);
      setPreviewScale(settings.previewScale);
      setPreviewCenterX(settings.previewCenterX);
      setPreviewCenterY(settings.previewCenterY);
      setPreviewRotationDeg(settings.previewRotationDeg);
      setWrapBySpaces(settings.wrapBySpaces);
    })();
  }, []);

  // Persist settings automatically so Notes printing always matches the preview.
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await saveAppSettings({
        fontStyle,
        previewScale,
        previewCenterX,
        previewCenterY,
        previewRotationDeg,
        wrapBySpaces,
        notesPrintType: 'image',
      });
    }, 500);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [fontStyle, previewScale, previewCenterX, previewCenterY, previewRotationDeg, wrapBySpaces]);

  const onSave = async () => {
    await saveAppSettings({
      fontStyle,
      previewScale,
      previewCenterX,
      previewCenterY,
      previewRotationDeg,
      wrapBySpaces,
      notesPrintType: 'image',
    });
    Alert.alert('Saved', 'Settings saved successfully');
  };

  const previewFontFamily: string = FONT_FAMILY_MAP[fontStyle];

  const onReset = useCallback(async () => {
    setFontStyle(DEFAULT_SETTINGS.fontStyle);
    setPreviewScale(DEFAULT_SETTINGS.previewScale);
    setPreviewCenterX(DEFAULT_SETTINGS.previewCenterX);
    setPreviewCenterY(DEFAULT_SETTINGS.previewCenterY);
    setPreviewRotationDeg(DEFAULT_SETTINGS.previewRotationDeg);
    await saveAppSettings(DEFAULT_SETTINGS);
  }, []);

  const onPreviewCenter = useCallback((x: number, y: number) => {
    setPreviewCenterX(x);
    setPreviewCenterY(y);
  }, []);

  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: SC.bg }]}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header matching notes top bar style */}
        <View style={[styles.topBar, { borderBottomColor: SC.divider }]}>
          <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={24} color={SC.text} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, { color: SC.text }]}>Settings</Text>
        </View>

        <ScrollView
          contentContainerStyle={[styles.container, { backgroundColor: SC.bg }]}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          <View style={[styles.card, { backgroundColor: SC.cardBg, borderColor: SC.border }]}>
            <Text style={[styles.sectionTitle, { color: SC.text }]}>Font Style</Text>
            <View style={styles.rowWrap}>
              {FONT_OPTIONS.map((font) => (
                <TouchableOpacity
                  key={font}
                  style={[styles.chip, { backgroundColor: SC.chipBg }, fontStyle === font && styles.chipActive]}
                  onPress={() => setFontStyle(font)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: SC.chipText, fontFamily: FONT_FAMILY_MAP[font] },
                      fontStyle === font && styles.chipTextActive,
                    ]}
                  >
                    {FONT_DISPLAY_NAMES[font]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: SC.cardBg, borderColor: SC.border }]}>
            <Text style={[styles.sectionTitle, { color: SC.text }]}>
              Live Preview ({TICKET_WIDTH_MM}mm x {TICKET_HEIGHT_MM}mm)
            </Text>
            <Text style={[styles.previewHint, { color: SC.textMuted }]}>
              Drag inside box to move, corners to resize, and top handle to rotate. Values update live.
            </Text>
            <TextInput
              style={[
                styles.previewInput,
                { backgroundColor: SC.inputBg, borderColor: SC.border, color: SC.text },
              ]}
              value={previewText}
              onChangeText={setPreviewText}
              placeholder="Type preview text..."
              placeholderTextColor={SC.textMuted}
              multiline
            />
            <LabelPreviewCanvas
              previewText={previewText}
              previewFontFamily={previewFontFamily}
              previewScale={previewScale}
              previewCenterX={previewCenterX}
              previewCenterY={previewCenterY}
              previewRotationDeg={previewRotationDeg}
              onPreviewScale={setPreviewScale}
              onPreviewCenter={onPreviewCenter}
              onPreviewRotationDeg={setPreviewRotationDeg}
            />
          </View>

          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.resetButton} onPress={onReset}>
              <MaterialIcons name="refresh" size={18} color="#0a7ea4" />
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveButton} onPress={onSave}>
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const SETTINGS_DARK = {
  bg: '#202124',
  cardBg: '#2d2e31',
  border: '#5f6368',
  divider: '#3c4043',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  chipBg: '#3c4043',
  chipText: '#e8eaed',
  inputBg: '#303134',
};

const SETTINGS_LIGHT = {
  bg: '#f8f9fa',
  cardBg: '#ffffff',
  border: '#e0e0e0',
  divider: '#dadce0',
  text: '#202124',
  textMuted: '#5f6368',
  chipBg: '#edf1f7',
  chipText: '#1f2937',
  inputBg: '#ffffff',
};

const HANDLE_HIT = 40;
const HANDLE_VIS = 12;

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { padding: 10 },
  topBarTitle: { fontSize: 18, fontWeight: '600', marginLeft: 4 },
  container: { padding: 16, gap: 12, flexGrow: 1 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  previewHint: { fontSize: 12, lineHeight: 16 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
  chipActive: { backgroundColor: '#0a7ea4' },
  chipText: {},
  chipTextActive: { color: '#fff' },
  previewInput: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  previewOuter: { alignItems: 'center', gap: 8, paddingTop: 28, overflow: 'visible' },
  previewPaper: {
    width: PREVIEW_CANVAS_W,
    height: PREVIEW_CANVAS_H,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'visible',
  },
  labelObject: {
    position: 'absolute',
    overflow: 'visible',
  },
  moveArea: {
    ...StyleSheet.absoluteFillObject,
  },
  dashedBox: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#7dd3fc',
    borderRadius: 2,
  },
  previewText: {
    color: '#2563eb',
    includeFontPadding: false,
  },
  handleSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#0a7ea4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleSquareActive: {
    backgroundColor: '#e0f2fe',
    borderColor: '#0284c7',
    borderWidth: 2,
  },
  cornerArrowText: {
    fontSize: 11,
    color: '#0a7ea4',
    fontWeight: '700',
    lineHeight: 13,
    includeFontPadding: false,
  },
  cornerArrowTextActive: {
    color: '#0284c7',
    fontSize: 13,
  },
  handleCircle: {
    width: HANDLE_VIS,
    height: HANDLE_VIS,
    borderRadius: HANDLE_VIS / 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  handleCornerTopLeft: {
    position: 'absolute',
    left: -HANDLE_HIT / 2,
    top: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCornerTopRight: {
    position: 'absolute',
    right: -HANDLE_HIT / 2,
    top: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCornerBottomLeft: {
    position: 'absolute',
    left: -HANDLE_HIT / 2,
    bottom: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCornerBottomRight: {
    position: 'absolute',
    right: -HANDLE_HIT / 2,
    bottom: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotateStem: {
    position: 'absolute',
    top: -18,
    left: '50%',
    marginLeft: -0.5,
    width: 1,
    height: 18,
    backgroundColor: '#7dd3fc',
  },
  handleRotateTouch: {
    position: 'absolute',
    top: -18 - HANDLE_HIT / 2 - 6,
    left: '50%',
    marginLeft: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleCursor: {
    position: 'absolute',
    right: -26,
    fontSize: 16,
    color: '#0a7ea4',
    fontWeight: '700',
  },
  handleCursorRotate: {
    position: 'absolute',
    top: -22,
    fontSize: 16,
    color: '#0a7ea4',
    fontWeight: '700',
  },
  handleCursorDiag: {
    position: 'absolute',
    right: -18,
    top: -18,
    fontSize: 14,
    color: '#0a7ea4',
    fontWeight: '700',
  },
  moveHandleTouch: {
    position: 'absolute',
    bottom: -18,
    left: '50%',
    marginLeft: -HANDLE_HIT / 2,
    width: HANDLE_HIT,
    height: HANDLE_HIT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moveHandleCircle: {
    width: HANDLE_VIS,
    height: HANDLE_VIS,
    borderRadius: HANDLE_VIS / 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a7ea4',
  },
  moveCursorHint: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -7,
    marginTop: -9,
    fontSize: 16,
    color: '#0a7ea4',
    opacity: 0.35,
  },
  moveCursorHintActive: {
    opacity: 1,
  },
  previewMeta: {
    position: 'absolute',
    bottom: 8,
    right: 10,
  },
  previewMetaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
  },
  liveStats: { paddingHorizontal: 4 },
  liveStatsText: { fontSize: 12, color: '#9aa0a6', fontWeight: '600', textAlign: 'center' },
  actionRow: {
    marginTop: 'auto',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  resetText: { color: '#0a7ea4', fontWeight: '700', fontSize: 16 },
  saveButton: {
    flex: 1,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
