import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { captureRef } from 'react-native-view-shot';
import { useTextToImage } from '@/hooks/useTextToImage';
import {
  computeTextToImageLayout,
  fontFamilyForStyle,
  TEXT_TO_IMAGE_CANVAS_H,
  TEXT_TO_IMAGE_CANVAS_W,
} from '@/src/utils/textToImage';
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { loadNotes, upsertNote } from '@/src/storage/notes';
import { getPrintService } from '@/src/services/printService';
import { usePrinterStore } from '@/src/store/usePrinterStore';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function splitContentForDisplay(content: string): { title: string; body: string } {
  const idx = content.indexOf('\n');
  if (idx === -1) return { title: '', body: content };
  return { title: content.slice(0, idx), body: content.slice(idx + 1) };
}

function mergeContentForSave(title: string, body: string): string {
  const t = title.trim();
  const b = body;
  if (!t) return b;
  return `${t}\n${b}`;
}

function extractBase64FromDataUri(dataUri: string): string {
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx >= 0) return dataUri.slice(commaIdx + 1);
  return dataUri;
}

export default function NoteEditorScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = params.id;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [editedLabel, setEditedLabel] = useState('');

  const captureRefView = useRef<View>(null);
  const { settings, appearance, ready } = useTextToImage();
  const isConnected = usePrinterStore((s) => s.isConnected);

  const contentForConversion = useMemo(() => mergeContentForSave(title, body).trim(), [title, body]);
  const layout = useMemo(() => computeTextToImageLayout(contentForConversion || ' ', settings), [contentForConversion, settings]);
  const fontFamily = useMemo(() => fontFamilyForStyle(settings.fontStyle), [settings.fontStyle]);

  useEffect(() => {
    (async () => {
      if (!noteId) {
        setEditedLabel(formatEditedTime(Date.now()));
        return;
      }
      const notes = await loadNotes();
      const note = notes.find((n) => n.id === noteId);
      if (note) {
        const { title: t, body: b } = splitContentForDisplay(note.content);
        setTitle(t);
        setBody(b);
        setEditedLabel(formatEditedTime(note.updatedAt));
      }
    })();
  }, [noteId]);

  const handleBack = useCallback(async () => {
    const content = mergeContentForSave(title, body).trim();
    if (!content) {
      router.back();
      return;
    }

    const now = Date.now();
    const id = typeof noteId === 'string' ? noteId : generateId();

    // Save note first.
    await upsertNote({ id, content, updatedAt: now });

    // Capture image while component is still mounted (before navigation).
    let capturedBase64: string | null = null;
    try {
      if (ready && captureRefView.current) {
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const uri = await captureRef(captureRefView.current, {
          format: 'jpg',
          quality: 1,
          result: 'data-uri',
        });
        const b64 = typeof uri === 'string' ? extractBase64FromDataUri(uri) : '';
        if (b64.length >= 32) capturedBase64 = b64;
      }
    } catch {
      // capture failed — navigate anyway, skip print
    }

    // Navigate immediately — note is already saved.
    setEditedLabel(formatEditedTime(now));
    router.replace('/notes' as never);

    // Print silently in the background — no UI feedback, no alerts.
    if (capturedBase64) {
      (async () => {
        try {
          const device = await ensureConnectedPrinter();
          await printService.printImage('note.jpg', capturedBase64!, device);
        } catch {
          // silent background print
        }
      })();
    }
  }, [body, noteId, printService, ready, router, title]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleBack}
            accessibilityLabel="Back and save"
          >
            <MaterialIcons name="arrow-back" size={24} color={COLORS.text} />
          </TouchableOpacity>
          <View style={styles.topBarRight}>
            <TouchableOpacity style={styles.iconBtn} disabled accessibilityLabel="Pin (coming soon)">
              <MaterialIcons name="push-pin" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} disabled accessibilityLabel="Reminder (coming soon)">
              <MaterialIcons
                name={isConnected ? 'add-alert' : 'notification-important'}
                size={22}
                color={COLORS.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} disabled accessibilityLabel="Archive (coming soon)">
              <MaterialIcons name="archive" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <TextInput
            style={styles.titleInput}
            value={title}
            onChangeText={setTitle}
            placeholder="Title"
            placeholderTextColor={COLORS.textMuted}
          />
          <TextInput
            multiline
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Note"
            placeholderTextColor={COLORS.textMuted}
            textAlignVertical="top"
          />
        </ScrollView>

        {/* Off-screen ticket used to convert note text into an image for printing. */}
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

        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Add (coming soon)">
            <MaterialIcons name="add-box" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Background (coming soon)">
            <MaterialIcons name="palette" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="Format (coming soon)">
            <MaterialIcons name="text-fields" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
          <Text style={styles.editedText}>{editedLabel}</Text>
          <View style={styles.bottomSpacer} />
          <TouchableOpacity style={styles.bottomIcon} disabled accessibilityLabel="More (coming soon)">
            <MaterialIcons name="more-vert" size={24} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatEditedTime(ts: number): string {
  const d = new Date(ts);
  return `Edited ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

const COLORS = {
  bg: '#202124',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  topBarRight: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { padding: 10 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 100,
  },
  titleInput: {
    fontSize: 22,
    fontWeight: '500',
    color: COLORS.text,
    paddingVertical: 8,
    marginBottom: 4,
  },
  bodyInput: {
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.text,
    minHeight: 320,
    paddingTop: 4,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 12,
    paddingBottom: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3c4043',
    backgroundColor: COLORS.bg,
  },
  bottomIcon: { padding: 8 },
  editedText: {
    flex: 1,
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 12,
  },
  bottomSpacer: { width: 0 },
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
