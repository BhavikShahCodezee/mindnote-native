import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  DEFAULT_SETTINGS,
  FontStyleKey,
  TextAlignKey,
  VerticalPositionKey,
  loadAppSettings,
  saveAppSettings,
} from '@/src/storage/appSettings';

const FONT_OPTIONS: FontStyleKey[] = ['System', 'Excalifont', 'ShadowsIntoLight'];
const SIZE_OPTIONS = [12, 16, 20, 24, 28, 32];
const ALIGN_OPTIONS: TextAlignKey[] = ['left', 'center', 'right'];
const VERTICAL_OPTIONS: VerticalPositionKey[] = ['top', 'center', 'bottom'];

function labelAlign(v: TextAlignKey): string {
  if (v === 'left') return 'Left';
  if (v === 'center') return 'Center';
  return 'Right';
}

export default function SettingsScreen() {
  const [fontStyle, setFontStyle] = useState<FontStyleKey>(DEFAULT_SETTINGS.fontStyle);
  const [fontSize, setFontSize] = useState<number>(DEFAULT_SETTINGS.fontSize);
  const [horizontalPosition, setHorizontalPosition] = useState<TextAlignKey>(DEFAULT_SETTINGS.horizontalPosition);
  const [verticalPosition, setVerticalPosition] = useState<VerticalPositionKey>(DEFAULT_SETTINGS.verticalPosition);
  const [wrapBySpaces, setWrapBySpaces] = useState<boolean>(DEFAULT_SETTINGS.wrapBySpaces);
  const [previewText, setPreviewText] = useState('Sample print text');

  useEffect(() => {
    (async () => {
      const settings = await loadAppSettings();
      setFontStyle(settings.fontStyle);
      setFontSize(settings.fontSize);
      setHorizontalPosition(settings.horizontalPosition);
      setVerticalPosition(settings.verticalPosition);
      setWrapBySpaces(settings.wrapBySpaces);
    })();
  }, []);

  const onSave = async () => {
    await saveAppSettings({
      fontStyle,
      fontSize,
      horizontalPosition,
      verticalPosition,
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

  const verticalJustify =
    verticalPosition === 'top'
      ? 'flex-start'
      : verticalPosition === 'center'
        ? 'center'
        : 'flex-end';

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
        <Text style={styles.sectionTitle}>Font Size</Text>
        <View style={styles.rowWrap}>
          {SIZE_OPTIONS.map((size) => (
            <TouchableOpacity
              key={size}
              style={[styles.chip, fontSize === size && styles.chipActive]}
              onPress={() => setFontSize(size)}
            >
              <Text style={[styles.chipText, fontSize === size && styles.chipTextActive]}>{size}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Horizontal Position</Text>
        <View style={styles.rowWrap}>
          {ALIGN_OPTIONS.map((align) => (
            <TouchableOpacity
              key={`h-${align}`}
              style={[styles.chip, horizontalPosition === align && styles.chipActive]}
              onPress={() => setHorizontalPosition(align)}
            >
              <Text style={[styles.chipText, horizontalPosition === align && styles.chipTextActive]}>{labelAlign(align)}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Vertical Position</Text>
        <View style={styles.rowWrap}>
          {VERTICAL_OPTIONS.map((v) => (
            <TouchableOpacity
              key={`v-${v}`}
              style={[styles.chip, verticalPosition === v && styles.chipActive]}
              onPress={() => setVerticalPosition(v)}
            >
              <Text style={[styles.chipText, verticalPosition === v && styles.chipTextActive]}>{v[0]!.toUpperCase() + v.slice(1)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Wrap by spaces</Text>
          <Switch value={wrapBySpaces} onValueChange={setWrapBySpaces} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Live Preview (57mm)</Text>
        <TextInput
          style={styles.previewInput}
          value={previewText}
          onChangeText={setPreviewText}
          placeholder="Type preview text..."
          multiline
        />
        <View style={styles.previewOuter}>
          <View style={[styles.previewPaper, { justifyContent: verticalJustify }]}>
            <Text
              style={[
                styles.previewText,
                {
                  textAlign: horizontalPosition,
                  fontSize,
                  fontFamily: previewFontFamily,
                },
              ]}
            >
              {previewText || 'Preview'}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={onSave}>
        <Text style={styles.saveText}>Save</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#edf1f7' },
  chipActive: { backgroundColor: '#0a7ea4' },
  chipText: { color: '#1f2937', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  switchLabel: { color: '#1f2937', fontWeight: '600' },
  hint: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  previewInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    minHeight: 72,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: '#111827',
  },
  previewOuter: { alignItems: 'center' },
  previewPaper: {
    width: 228,
    height: 320,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    padding: 12,
  },
  previewText: { color: '#111827' },
  saveButton: { marginTop: 'auto', backgroundColor: '#0a7ea4', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

