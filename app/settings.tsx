import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
  ScrollView,
} from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import {
  BASE_PREVIEW_FONT_PX,
  DEFAULT_SETTINGS,
  FontStyleKey,
  clampPreviewScale,
  loadAppSettings,
  saveAppSettings,
} from '@/src/storage/appSettings';
import {
  SETTINGS_PREVIEW_HEIGHT_PX,
  SETTINGS_PREVIEW_WIDTH_PX,
  TICKET_HEIGHT_MM,
  TICKET_WIDTH_MM,
} from '@/constants/printTicket';

const FONT_OPTIONS: FontStyleKey[] = ['System', 'Excalifont', 'ShadowsIntoLight'];

const PREVIEW_CANVAS_W = SETTINGS_PREVIEW_WIDTH_PX;
const PREVIEW_CANVAS_H = SETTINGS_PREVIEW_HEIGHT_PX;
const PREVIEW_PADDING = 12;
const BASE_BOX_WIDTH = 140;
const MIN_BOX_WIDTH = 40;
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
  previewFontFamily: string | undefined;
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
    () => Math.max(1, BASE_PREVIEW_FONT_PX * previewScale * LINE_HEIGHT_MULTIPLIER),
    [previewScale]
  );
  const fontSize = BASE_PREVIEW_FONT_PX * previewScale;
  const boxWidth = useMemo(() => {
    const scaled = BASE_BOX_WIDTH * previewScale;
    return Math.max(MIN_BOX_WIDTH, Math.min(innerSize.w, scaled));
  }, [innerSize.w, previewScale]);

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
      const minScaleByWidth = MIN_BOX_WIDTH / BASE_BOX_WIDTH;
      const minScale = Math.max(minScaleByWidth, 0.2);
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
              width: boxWidth,
              minHeight: Math.max(textLayout.h, lineHeight),
              transform: [{ rotate: `${previewRotationDeg}deg` }],
            },
          ]}
        >
          <View style={styles.dashedBox} pointerEvents="none" />
          <GestureDetector gesture={moveGesture}>
            <View style={styles.moveArea} />
          </GestureDetector>
            <Text
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
                },
              ]}
            >
              {previewText || 'Preview'}
            </Text>
            <Text style={[styles.moveCursorHint, activeHandle === 'move' && styles.moveCursorHintActive]}>
              ✥
            </Text>

            <GestureDetector gesture={scaleGestureTl}>
              <View style={styles.handleCornerTopLeft} accessibilityLabel="Resize top left">
                <View style={styles.handleSquare} />
                {activeHandle === 'corner-tl' ? <Text style={styles.handleCursorDiag}>↖</Text> : null}
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureTr}>
              <View style={styles.handleCornerTopRight} accessibilityLabel="Resize top right">
                <View style={styles.handleSquare} />
                {activeHandle === 'corner-tr' ? <Text style={styles.handleCursorDiag}>↗</Text> : null}
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureBl}>
              <View style={styles.handleCornerBottomLeft} accessibilityLabel="Resize bottom left">
                <View style={styles.handleSquare} />
                {activeHandle === 'corner-bl' ? <Text style={styles.handleCursorDiag}>↙</Text> : null}
              </View>
            </GestureDetector>
            <GestureDetector gesture={scaleGestureBr}>
              <View style={styles.handleCornerBottomRight} accessibilityLabel="Resize bottom right">
                <View style={styles.handleSquare} />
                {activeHandle === 'corner-br' ? <Text style={styles.handleCursorDiag}>↘</Text> : null}
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
  const [fontStyle, setFontStyle] = useState<FontStyleKey>(DEFAULT_SETTINGS.fontStyle);
  const [previewScale, setPreviewScale] = useState<number>(DEFAULT_SETTINGS.previewScale);
  const [previewCenterX, setPreviewCenterX] = useState<number>(DEFAULT_SETTINGS.previewCenterX);
  const [previewCenterY, setPreviewCenterY] = useState<number>(DEFAULT_SETTINGS.previewCenterY);
  const [previewRotationDeg, setPreviewRotationDeg] = useState<number>(DEFAULT_SETTINGS.previewRotationDeg);
  const [wrapBySpaces, setWrapBySpaces] = useState<boolean>(DEFAULT_SETTINGS.wrapBySpaces);
  const [previewText, setPreviewText] = useState('Sample print text');

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

  const onSave = async () => {
    await saveAppSettings({
      fontStyle,
      previewScale,
      previewCenterX,
      previewCenterY,
      previewRotationDeg,
      wrapBySpaces,
    });
    Alert.alert('Saved', 'Settings saved successfully');
  };

  const previewFontFamily =
    fontStyle === 'Excalifont'
      ? 'Excalifont'
      : fontStyle === 'ShadowsIntoLight'
        ? 'ShadowsIntoLight'
        : undefined;

  const onPreviewCenter = useCallback((x: number, y: number) => {
    setPreviewCenterX(x);
    setPreviewCenterY(y);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Font Style</Text>
          <View style={styles.rowWrap}>
            {FONT_OPTIONS.map((font) => (
              <TouchableOpacity
                key={font}
                style={[styles.chip, fontStyle === font && styles.chipActive]}
                onPress={() => setFontStyle(font)}
              >
                <Text style={[styles.chipText, fontStyle === font && styles.chipTextActive]}>{font}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>
            Live Preview ({TICKET_WIDTH_MM}mm x {TICKET_HEIGHT_MM}mm)
          </Text>
          <Text style={styles.previewHint}>
            Drag inside box to move, corners to resize, and top handle to rotate. Values update live.
          </Text>
          <TextInput
            style={styles.previewInput}
            value={previewText}
            onChangeText={setPreviewText}
            placeholder="Type preview text..."
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

        <TouchableOpacity style={styles.saveButton} onPress={onSave}>
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </ScrollView>
    </GestureHandlerRootView>
  );
}

const HANDLE_HIT = 40;
const HANDLE_VIS = 12;

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { padding: 16, gap: 12, backgroundColor: '#f6f8fc', flexGrow: 1 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  previewHint: { fontSize: 12, color: '#6b7280', lineHeight: 16 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#edf1f7' },
  chipActive: { backgroundColor: '#0a7ea4' },
  chipText: { color: '#1f2937', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  previewInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
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
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    width: '100%',
    flexShrink: 1,
    includeFontPadding: false,
  },
  handleSquare: {
    width: HANDLE_VIS,
    height: HANDLE_VIS,
    borderRadius: 2,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a7ea4',
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
  liveStatsText: { fontSize: 12, color: '#374151', fontWeight: '600', textAlign: 'center' },
  saveButton: {
    marginTop: 'auto',
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
