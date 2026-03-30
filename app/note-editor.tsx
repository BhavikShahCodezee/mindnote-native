import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { loadNotes, upsertNote } from '@/src/storage/notes';
import { getPrintService } from '@/src/services/printService';

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

export default function NoteEditorScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = params.id;
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [editedLabel, setEditedLabel] = useState('');

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
    setSaving(true);
    try {
      const now = Date.now();
      const id = typeof noteId === 'string' ? noteId : generateId();
      await upsertNote({ id, content, updatedAt: now });

      const device = await ensureConnectedPrinter();
      const result = await printService.printNote(content, device);
      if (!result.success) {
        throw result.error ?? new Error(result.message);
      }
      setEditedLabel(formatEditedTime(now));
      router.replace('/notes' as never);
    } catch (e) {
      Alert.alert('Save/Print failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [body, noteId, printService, router, title]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleBack}
            disabled={saving}
            accessibilityLabel="Back and save"
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.text} />
            ) : (
              <MaterialIcons name="arrow-back" size={24} color={COLORS.text} />
            )}
          </TouchableOpacity>
          <View style={styles.topBarRight}>
            <TouchableOpacity style={styles.iconBtn} disabled accessibilityLabel="Pin (coming soon)">
              <MaterialIcons name="push-pin" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconBtn} disabled accessibilityLabel="Reminder (coming soon)">
              <MaterialIcons name="add-alert" size={22} color={COLORS.textMuted} />
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
            editable={!saving}
          />
          <TextInput
            multiline
            style={styles.bodyInput}
            value={body}
            onChangeText={setBody}
            placeholder="Note"
            placeholderTextColor={COLORS.textMuted}
            textAlignVertical="top"
            editable={!saving}
          />
        </ScrollView>

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
});
