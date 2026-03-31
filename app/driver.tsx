import {
  CustomApiConfig,
  DEFAULT_INJECT_ID,
  INJECT_ONE_BASE_URL,
  INJECT_ONE_RESPONSE_KEY,
  addCustomApi,
  createCustomApi,
  loadDriverSettings,
  removeCustomApi,
  saveInjectId,
} from '@/src/storage/driverSettings';
import { usePrinterStore } from '@/src/store/usePrinterStore';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DARK = {
  bg: '#202124',
  cardBg: '#2d2e31',
  border: '#5f6368',
  divider: '#3c4043',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  inputBg: '#303134',
  injectCardBg: '#1a2e3a',
  injectCardBorder: '#0a7ea4',
  customCardBg: '#2a2d32',
  customCardBorder: '#5f6368',
  addBtnBg: '#2d3748',
};

const LIGHT = {
  bg: '#f8f9fa',
  cardBg: '#ffffff',
  border: '#e0e0e0',
  divider: '#dadce0',
  text: '#202124',
  textMuted: '#5f6368',
  inputBg: '#f1f3f4',
  injectCardBg: '#e8f4fb',
  injectCardBorder: '#0a7ea4',
  customCardBg: '#ffffff',
  customCardBorder: '#e0e0e0',
  addBtnBg: '#edf1f7',
};

export default function DriverScreen() {
  const router = useRouter();
  const isDarkMode = usePrinterStore((s) => s.isDarkMode);
  const C = isDarkMode ? DARK : LIGHT;

  const [injectId, setInjectId] = useState(DEFAULT_INJECT_ID);
  const [customApis, setCustomApis] = useState<CustomApiConfig[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const settings = await loadDriverSettings();
      setInjectId(settings.injectId);
      setCustomApis(settings.customApis);
    })();
  }, []);

  const onInjectIdChange = useCallback((val: string) => {
    setInjectId(val);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveInjectId(val), 600);
  }, []);

  const onAddCustomApi = useCallback(async () => {
    const trimUrl = newUrl.trim();
    const trimKey = newKey.trim();
    const trimName = newName.trim();
    if (!trimUrl) {
      Alert.alert('Missing URL', 'Please enter an API URL.');
      return;
    }
    if (!trimKey) {
      Alert.alert('Missing Key', 'Please enter the JSON key to extract.');
      return;
    }
    const name = trimName || `Custom ${customApis.length + 1}`;
    const api = createCustomApi(name, trimUrl, trimKey);
    const next = await addCustomApi(api);
    setCustomApis(next.customApis);
    setNewUrl('');
    setNewKey('');
    setNewName('');
    setShowAddForm(false);
  }, [newUrl, newKey, newName, customApis.length]);

  const onDeleteCustomApi = useCallback((id: string, name: string) => {
    Alert.alert('Remove API', `Remove "${name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const next = await removeCustomApi(id);
          setCustomApis(next.customApis);
        },
      },
    ]);
  }, []);

  const onStartInjectOne = useCallback(() => {
    const id = injectId.trim() || DEFAULT_INJECT_ID;
    router.push({
      pathname: '/driver-run' as never,
      params: {
        type: 'inject-one',
        injectId: id,
        name: 'Inject One',
      },
    });
  }, [injectId, router]);

  const onStartCustomApi = useCallback((api: CustomApiConfig) => {
    router.push({
      pathname: '/driver-run' as never,
      params: {
        type: 'custom',
        url: api.url,
        responseKey: api.responseKey,
        name: api.name,
      },
    });
  }, [router]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: C.bg }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.topBar, { borderBottomColor: C.divider }]}>
        <TouchableOpacity style={styles.topBarBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <MaterialIcons name="local-printshop" size={22} color="#0a7ea4" style={styles.topBarIcon} />
        <Text style={[styles.topBarTitle, { color: C.text }]}>api Intigration</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Inject ID ── */}
        <View style={[styles.card, { backgroundColor: C.cardBg, borderColor: C.border }]}>
          <Text style={[styles.sectionTitle, { color: C.text }]}>Inject ID</Text>
          <Text style={[styles.hint, { color: C.textMuted }]}>
            Your unique inject ID. Used to fetch print data from the server.
          </Text>
          <TextInput
            style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
            value={injectId}
            onChangeText={onInjectIdChange}
            placeholder="e.g. xxxxx"
            placeholderTextColor={C.textMuted}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <View style={[styles.urlPreview, { backgroundColor: C.inputBg, borderColor: C.border }]}>
            <MaterialIcons name="link" size={14} color={C.textMuted} />
            <Text style={[styles.urlPreviewText, { color: C.textMuted }]} numberOfLines={1}>
              {INJECT_ONE_BASE_URL}/{injectId.trim() || DEFAULT_INJECT_ID}/selection
            </Text>
          </View>
        </View>

        {/* ── API Sources ── */}
        <Text style={[styles.sourcesLabel, { color: C.textMuted }]}>API SOURCES</Text>

        {/* Inject One — built-in card */}
        <TouchableOpacity
          style={[styles.apiCard, { backgroundColor: C.injectCardBg, borderColor: C.injectCardBorder }]}
          onPress={onStartInjectOne}
          activeOpacity={0.8}
        >
          <View style={styles.apiCardLeft}>
            <View style={styles.apiCardIcon}>
              <MaterialIcons name="bolt" size={22} color="#0a7ea4" />
            </View>
            <View style={styles.apiCardInfo}>
              <Text style={[styles.apiCardName, { color: C.text }]}>Inject One</Text>
              <Text style={[styles.apiCardSub, { color: C.textMuted }]} numberOfLines={1}>
                Key: <Text style={{ color: '#0a7ea4' }}>{INJECT_ONE_RESPONSE_KEY}</Text>
              </Text>
              <Text style={[styles.apiCardSub, { color: C.textMuted }]} numberOfLines={1}>
                ID: {injectId.trim() || DEFAULT_INJECT_ID}
              </Text>
            </View>
          </View>
          <View style={styles.apiCardStart}>
            <MaterialIcons name="play-circle-filled" size={38} color="#0a7ea4" />
          </View>
        </TouchableOpacity>

        {/* Custom API cards */}
        {customApis.map((api) => (
          <View
            key={api.id}
            style={[styles.apiCard, { backgroundColor: C.customCardBg, borderColor: C.customCardBorder }]}
          >
            <View style={styles.apiCardLeft}>
              <View style={styles.apiCardIcon}>
                <MaterialIcons name="api" size={20} color="#7c3aed" />
              </View>
              <View style={styles.apiCardInfo}>
                <Text style={[styles.apiCardName, { color: C.text }]}>{api.name}</Text>
                <Text style={[styles.apiCardSub, { color: C.textMuted }]} numberOfLines={1}>
                  Key: <Text style={{ color: '#7c3aed' }}>{api.responseKey}</Text>
                </Text>
                <Text style={[styles.apiCardUrl, { color: C.textMuted }]} numberOfLines={1}>
                  {api.url}
                </Text>
              </View>
            </View>
            <View style={styles.apiCardActions}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={() => onDeleteCustomApi(api.id, api.name)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons name="delete-outline" size={20} color="#ef4444" />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onStartCustomApi(api)}>
                <MaterialIcons name="play-circle-filled" size={38} color="#7c3aed" />
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Add Custom API */}
        {!showAddForm ? (
          <TouchableOpacity
            style={[styles.addBtn, { backgroundColor: C.addBtnBg, borderColor: C.border }]}
            onPress={() => setShowAddForm(true)}
          >
            <MaterialIcons name="add" size={20} color="#0a7ea4" />
            <Text style={styles.addBtnText}>Add Custom API</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { backgroundColor: C.cardBg, borderColor: C.border }]}>
            <Text style={[styles.sectionTitle, { color: C.text }]}>New Custom API</Text>

            <Text style={[styles.fieldLabel, { color: C.textMuted }]}>Name (optional)</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={newName}
              onChangeText={setNewName}
              placeholder={`Custom ${customApis.length + 1}`}
              placeholderTextColor={C.textMuted}
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: C.textMuted }]}>API URL</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={newUrl}
              onChangeText={setNewUrl}
              placeholder="https://example.com/api/data"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              keyboardType="url"
              returnKeyType="next"
            />

            <Text style={[styles.fieldLabel, { color: C.textMuted }]}>Response Key</Text>
            <TextInput
              style={[styles.input, { backgroundColor: C.inputBg, borderColor: C.border, color: C.text }]}
              value={newKey}
              onChangeText={setNewKey}
              placeholder="e.g.  value"
              placeholderTextColor={C.textMuted}
              autoCapitalize="none"
              returnKeyType="done"
            />
            <Text style={[styles.keyHint, { color: C.textMuted }]}>
              The JSON field name to extract from the response (e.g. <Text style={{ color: '#0a7ea4' }}>value</Text>)
            </Text>

            <View style={styles.formActions}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: C.border }]}
                onPress={() => {
                  setShowAddForm(false);
                  setNewUrl('');
                  setNewKey('');
                  setNewName('');
                }}
              >
                <Text style={[styles.cancelBtnText, { color: C.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={onAddCustomApi}>
                <Text style={styles.saveBtnText}>Add API</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarBtn: { padding: 10 },
  topBarIcon: { marginLeft: 4 },
  topBarTitle: { fontSize: 18, fontWeight: '600', marginLeft: 6 },
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '500', marginBottom: -4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  urlPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  urlPreviewText: { fontSize: 12, flex: 1 },
  sourcesLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginLeft: 4,
    marginTop: 4,
  },
  apiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  apiCardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  apiCardIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(10,126,164,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apiCardInfo: { flex: 1, gap: 3 },
  apiCardName: { fontSize: 15, fontWeight: '700' },
  apiCardSub: { fontSize: 12 },
  apiCardUrl: { fontSize: 11, marginTop: 2 },
  apiCardStart: { paddingLeft: 8 },
  apiCardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 8 },
  deleteBtn: { padding: 4 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 16,
  },
  addBtnText: { color: '#0a7ea4', fontWeight: '600', fontSize: 15 },
  keyHint: { fontSize: 12, lineHeight: 17, marginTop: -4 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelBtnText: { fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 2,
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
