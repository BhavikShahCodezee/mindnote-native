import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { captureRef } from 'react-native-view-shot';
import { useTextToImage } from '@/hooks/useTextToImage';
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { getPrintService } from '@/src/services/printService';
import {
  computeTextToImageLayout,
  fontFamilyForStyle,
  TEXT_TO_IMAGE_CANVAS_H,
  TEXT_TO_IMAGE_CANVAS_W,
} from '@/src/utils/textToImage';

function extractBase64FromDataUri(dataUri: string): string {
  // Expected shape: data:image/png;base64,AAAA...
  const commaIdx = dataUri.indexOf(',');
  if (commaIdx >= 0) return dataUri.slice(commaIdx + 1);
  return dataUri;
}

export default function TextToImageScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const captureRefView = useRef<View>(null);
  const { settings, appearance, reload, ready } = useTextToImage();
  const [inputText, setInputText] = useState('');
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewBase64, setPreviewBase64] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [printing, setPrinting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const layout = useMemo(
    () => computeTextToImageLayout(inputText, settings),
    [inputText, settings]
  );

  const fontFamily = useMemo(() => fontFamilyForStyle(settings.fontStyle), [settings.fontStyle]);

  const onGenerate = useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed) {
      Alert.alert('Empty text', 'Please enter some text to generate an image.');
      return;
    }

    const ref = captureRefView.current;
    if (!ref) {
      Alert.alert('Not ready', 'Please try again in a moment.');
      return;
    }

    setGenerating(true);
    try {
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      const uri = await captureRef(ref, {
        // Match gallery flow as closely as possible: expo-image-picker typically provides JPEG base64.
        // This avoids any edge-cases in PNG decoding during printing.
        format: 'jpg',
        quality: 1,
        result: 'data-uri',
      });
      if (typeof uri === 'string' && uri.length > 32) {
        setPreviewUri(uri);
        setPreviewBase64(extractBase64FromDataUri(uri));
      } else {
        throw new Error('Capture returned empty image');
      }
    } catch (e) {
      Alert.alert('Generate failed', e instanceof Error ? e.message : 'Could not create image');
    } finally {
      setGenerating(false);
    }
  }, [inputText]);

  const onPrintPreview = useCallback(async () => {
    if (!previewBase64) {
      Alert.alert('Nothing to print', 'Generate an image first.');
      return;
    }
    if (printing) return;

    setPrinting(true);
    try {
      const device = await ensureConnectedPrinter();
      const imageData = previewBase64;
      console.log('PRINT INPUT:', imageData);
      console.log('PRINT INPUT meta:', {
        imageBase64Length: imageData.length,
      });
      // Reuse the exact existing image-print pipeline.
      const printResult = await printService.printImage('text-to-image.jpg', imageData, device);
      if (!printResult.success) throw new Error(printResult.message);
      Alert.alert('Done', 'Text image printed successfully.');
    } catch (e) {
      Alert.alert('Print failed', e instanceof Error ? e.message : 'Unable to print image');
    } finally {
      setPrinting(false);
    }
  }, [printService, previewBase64, printing]);

  if (!ready) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.loadingRoot}>
          <ActivityIndicator size="large" color="#0a7ea4" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <TouchableOpacity style={styles.backRow} onPress={() => router.back()} accessibilityLabel="Go back">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>Print Text convert into Image</Text>
        <Text style={styles.subtitle}>
          Uses your saved Settings (font, size, position, rotation). Colours use app defaults until customised in
          storage.
        </Text>

        <Text style={styles.label}>Text</Text>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type text to render…"
          placeholderTextColor="#9ca3af"
          multiline
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.generateBtn, generating && styles.generateBtnDisabled]}
          onPress={() => void onGenerate()}
          disabled={generating}
          accessibilityLabel="Generate image from text"
        >
          {generating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.generateBtnText}>Generate Image</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.previewTitle}>Preview</Text>
        <View style={styles.previewCard}>
          {previewUri ? (
            <Image
              source={{ uri: previewUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel="Generated text image preview"
            />
          ) : (
            <Text style={styles.previewPlaceholder}>
              Generated image will appear here after you tap &quot;Generate Image&quot;.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[styles.printBtn, printing && styles.printBtnDisabled]}
          onPress={() => void onPrintPreview()}
          disabled={!previewBase64 || printing}
          accessibilityLabel="Print the generated preview image"
        >
          {printing ? <ActivityIndicator color="#fff" /> : <Text style={styles.printBtnText}>Print Preview Image</Text>}
        </TouchableOpacity>

        {/* Off-screen ticket (same size as Settings preview) — captured for raster preview */}
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fef9f3' },
  loadingRoot: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, paddingBottom: 40 },
  backRow: { marginBottom: 8, alignSelf: 'flex-start' },
  backText: { fontSize: 16, color: '#0a7ea4', fontWeight: '600' },
  title: { fontSize: 20, fontWeight: '700', color: '#2c2416', marginBottom: 6 },
  subtitle: { fontSize: 13, color: '#6b6355', lineHeight: 18, marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#2c2416', marginBottom: 6 },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#e5ddd1',
    borderRadius: 12,
    padding: 12,
    fontSize: 16,
    color: '#2c2416',
    backgroundColor: '#fffbf5',
    marginBottom: 14,
  },
  generateBtn: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  generateBtnDisabled: { opacity: 0.7 },
  generateBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  previewTitle: { fontSize: 16, fontWeight: '700', color: '#2c2416', marginBottom: 8 },
  previewCard: {
    minHeight: 200,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5ddd1',
    backgroundColor: '#fffbf5',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlaceholder: { color: '#6b6355', fontSize: 14, textAlign: 'center', padding: 16 },
  previewImage: {
    width: '100%',
    maxWidth: TEXT_TO_IMAGE_CANVAS_W * 1.5,
    aspectRatio: TEXT_TO_IMAGE_CANVAS_W / TEXT_TO_IMAGE_CANVAS_H,
    alignSelf: 'center',
  },
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
  printBtn: {
    marginTop: 16,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  printBtnDisabled: { opacity: 0.7 },
  printBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
