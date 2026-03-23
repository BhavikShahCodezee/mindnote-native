import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { loadAppSettings } from '@/src/storage/appSettings';
import { loadNotes, upsertNote } from '@/src/storage/notes';
import { getPrintService } from '@/src/services/printService';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export default function NoteEditorScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const params = useLocalSearchParams<{ id?: string }>();
  const noteId = params.id;
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [fontFamily, setFontFamily] = useState<'System' | 'Excalifont' | 'ShadowsIntoLight'>('System');

  useEffect(() => {
    (async () => {
      const settings = await loadAppSettings();
      setFontFamily(settings.fontStyle);
      if (noteId) {
        const notes = await loadNotes();
        const note = notes.find((n) => n.id === noteId);
        if (note) setValue(note.content);
      }
    })();
  }, [noteId]);

  const resolvedFont = useMemo(() => {
    if (fontFamily === 'Excalifont') return 'Excalifont';
    if (fontFamily === 'ShadowsIntoLight') return 'ShadowsIntoLight';
    return undefined;
  }, [fontFamily]);

  const onSave = async () => {
    const content = value.trim();
    if (!content) {
      Alert.alert('Empty note', 'Please write note text first.');
      return;
    }
    setSaving(true);
    try {
      const now = Date.now();
      const id = typeof noteId === 'string' ? noteId : generateId();
      await upsertNote({ id, content, updatedAt: now });

      const device = await ensureConnectedPrinter();
      const result = await printService.printText(content, device);
      if (!result.success) {
        throw result.error ?? new Error(result.message);
      }
      Alert.alert('Saved & Printed', 'Note saved and sent to printer.', [
        { text: 'OK', onPress: () => router.replace('/notes' as never) },
      ]);
    } catch (e) {
      Alert.alert('Save/Print failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.saveButton, saving && styles.buttonDisabled]} onPress={onSave} disabled={saving}>
          <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>Here Text Note..</Text>
        <TextInput
          multiline
          style={[styles.input, resolvedFont ? { fontFamily: resolvedFont } : undefined]}
          value={value}
          onChangeText={setValue}
          placeholder="Write your note..."
          textAlignVertical="top"
          editable={!saving}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f6f8fc', padding: 16, gap: 14 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backButton: {
    backgroundColor: '#e9edf4',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  backText: { color: '#1f2937', fontWeight: '700', fontSize: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 10,
  },
  label: { fontWeight: '700', color: '#1f2937' },
  input: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 12,
    fontSize: 18,
    color: '#111827',
  },
  saveButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 22,
    alignItems: 'center',
  },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  buttonDisabled: { opacity: 0.6 },
});

