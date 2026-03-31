import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import type { Device } from 'react-native-ble-plx';
import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { getPrintService } from '@/src/services/printService';
import { clearSavedPrinter, loadSavedPrinter, savePrinter } from '@/src/storage/savedPrinter';
import { usePrinterStore } from '@/src/store/usePrinterStore';

const DARK = {
  bg: '#202124',
  card: '#2d2e31',
  border: '#5f6368',
  text: '#e8eaed',
  textMuted: '#9aa0a6',
  divider: '#3c4043',
  connectedBg: '#1a3a2a',
  connectedText: '#4ade80',
  disconnectedBg: '#3a1a1a',
  disconnectedText: '#f87171',
  btnPrimary: '#0a7ea4',
  btnSecondary: '#3c4043',
  btnDanger: '#7f1d1d',
  btnDangerText: '#fca5a5',
  itemBorder: '#3c4043',
};

const LIGHT = {
  bg: '#f8f9fa',
  card: '#ffffff',
  border: '#e0e0e0',
  text: '#202124',
  textMuted: '#5f6368',
  divider: '#dadce0',
  connectedBg: '#d1f7df',
  connectedText: '#166534',
  disconnectedBg: '#ffdcdc',
  disconnectedText: '#991b1b',
  btnPrimary: '#0a7ea4',
  btnSecondary: '#e9edf4',
  btnDanger: '#fee2e2',
  btnDangerText: '#991b1b',
  itemBorder: '#e5e7eb',
};

export default function PrinterScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const isConnected = usePrinterStore((s) => s.isConnected);
  const connectedDevice = usePrinterStore((s) => s.device);
  const isDarkMode = usePrinterStore((s) => s.isDarkMode);
  const C = isDarkMode ? DARK : LIGHT;

  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSavedPrinter();
      if (!cancelled && saved) setSavedDeviceId(saved.id);
    })();
    return () => { cancelled = true; };
  }, []);

  const onScan = useCallback(async () => {
    setShowScanDialog(true);
    setScanning(true);
    try {
      const list = await printService.scanForPrinters(3500, true);
      setDevices(list);
      if (!list.length) Alert.alert('No devices', 'Turn on printer and scan again.');
    } catch (e) {
      Alert.alert('Scan error', e instanceof Error ? e.message : 'Unable to scan');
    } finally {
      setScanning(false);
    }
  }, [printService]);

  const onConnect = useCallback(async (device: Device) => {
    setConnecting(true);
    try {
      const result = await printService.connectToDevice(device);
      if (!result.success) throw new Error(result.message);
      await savePrinter({ id: device.id, name: device.name });
      setSavedDeviceId(device.id);
      setShowScanDialog(false);
      Alert.alert('Connected', `Connected to ${device.name ?? device.id}`);
    } catch (e) {
      Alert.alert('Connection failed', e instanceof Error ? e.message : 'Unable to connect');
    } finally {
      setConnecting(false);
    }
  }, [printService]);

  const onDisconnect = useCallback(async () => {
    await printService.disconnect();
    Alert.alert('Disconnected', 'Printer disconnected');
  }, [printService]);

  const onForget = useCallback(async () => {
    await clearSavedPrinter();
    setSavedDeviceId(null);
    Alert.alert('Done', 'Saved printer removed');
  }, []);

  const onImagePrint = useCallback(async () => {
    if (!isConnected) {
      Alert.alert('Printer not connected', 'Please connect to a printer first.');
      return;
    }
    setPrinting(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Gallery access is required to select an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        base64: true,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const uri = result.assets[0].uri;
      const base64 = result.assets[0].base64;
      if (!base64) throw new Error('Selected image has no base64 payload');
      const device = await ensureConnectedPrinter();
      const printResult = await printService.printImage(uri, base64, device);
      if (printResult.success) {
        Alert.alert('Done', 'Image printed successfully.');
      } else {
        throw new Error(printResult.message);
      }
    } catch (e) {
      Alert.alert('Print failed', e instanceof Error ? e.message : 'Unable to print image');
    } finally {
      setPrinting(false);
    }
  }, [isConnected, printService]);

  const s = makeStyles(C);

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* Header */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.topBarBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <MaterialIcons name="arrow-back" size={24} color={C.text} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Printer</Text>
      </View>

      <ScrollView contentContainerStyle={s.container} showsVerticalScrollIndicator={false}>
        {/* Connection status */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Connection Status</Text>
          <View style={[s.statusBadge, { backgroundColor: isConnected ? C.connectedBg : C.disconnectedBg }]}>
            <MaterialIcons
              name={isConnected ? 'bluetooth-connected' : 'bluetooth-disabled'}
              size={18}
              color={isConnected ? C.connectedText : C.disconnectedText}
            />
            <Text style={[s.statusText, { color: isConnected ? C.connectedText : C.disconnectedText }]}>
              {isConnected ? `Connected: ${connectedDevice?.name ?? 'Printer'}` : 'Disconnected'}
            </Text>
          </View>

          <TouchableOpacity style={s.btnPrimary} onPress={onScan} disabled={scanning || connecting}>
            {scanning
              ? <ActivityIndicator color="#fff" />
              : <><MaterialIcons name="bluetooth-searching" size={18} color="#fff" /><Text style={s.btnPrimaryText}>  Scan for Printers</Text></>}
          </TouchableOpacity>

          {isConnected && (
            <TouchableOpacity style={s.btnSecondary} onPress={onDisconnect} disabled={connecting}>
              <MaterialIcons name="bluetooth-disabled" size={18} color={C.text} />
              <Text style={[s.btnSecondaryText, { color: C.text }]}>  Disconnect</Text>
            </TouchableOpacity>
          )}

          {savedDeviceId && (
            <TouchableOpacity style={s.btnDanger} onPress={onForget}>
              <MaterialIcons name="delete-outline" size={16} color={C.btnDangerText} />
              <Text style={[s.btnDangerText, { color: C.btnDangerText }]}>  Forget saved device</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Image print */}
        <View style={s.card}>
          <Text style={s.sectionTitle}>Print Image</Text>
          <Text style={s.hint}>Select an image from your gallery to print.</Text>
          <TouchableOpacity
            style={[s.btnPrimary, (!isConnected || printing) && s.btnDisabled]}
            onPress={onImagePrint}
            disabled={!isConnected || printing}
          >
            {printing
              ? <ActivityIndicator color="#fff" />
              : <><MaterialIcons name="image" size={18} color="#fff" /><Text style={s.btnPrimaryText}>  Print Image</Text></>}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Scan dialog */}
      <Modal
        visible={showScanDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScanDialog(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={[s.modalCard, { backgroundColor: C.card, borderColor: C.border }]}>
            <View style={s.modalHeader}>
              <Text style={[s.sectionTitle, { color: C.text }]}>Available Devices</Text>
              <TouchableOpacity style={s.closeBtn} onPress={() => setShowScanDialog(false)}>
                <MaterialIcons name="close" size={20} color={C.text} />
              </TouchableOpacity>
            </View>
            <View style={[s.deviceList, { borderColor: C.border }]}>
              <ScrollView showsVerticalScrollIndicator contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {devices.length ? (
                  devices.map((d) => (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.deviceItem, { borderColor: C.itemBorder }]}
                      onPress={() => onConnect(d)}
                      disabled={connecting}
                    >
                      <MaterialIcons name="print" size={20} color={C.btnPrimary} />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[s.deviceName, { color: C.text }]}>{d.name ?? 'Unknown'}</Text>
                        <Text style={[s.deviceId, { color: C.textMuted }]}>
                          {d.id}{savedDeviceId === d.id ? ' · saved' : ''}
                        </Text>
                      </View>
                      {connecting && <ActivityIndicator size="small" color={C.btnPrimary} />}
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={[s.emptyText, { color: C.textMuted }]}>
                    {scanning ? 'Scanning for devices…' : 'No devices found'}
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: typeof DARK) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 4,
      paddingVertical: 4,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: C.divider,
    },
    topBarBtn: { padding: 10 },
    topBarTitle: { fontSize: 18, fontWeight: '600', color: C.text, marginLeft: 4 },
    container: { padding: 16, gap: 14 },
    card: {
      backgroundColor: C.card,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.border,
      padding: 16,
      gap: 10,
    },
    sectionTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    hint: { fontSize: 13, color: C.textMuted, lineHeight: 18 },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      gap: 8,
    },
    statusText: { fontWeight: '600', fontSize: 14 },
    btnPrimary: {
      backgroundColor: C.btnPrimary,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    btnSecondary: {
      backgroundColor: C.btnSecondary,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnSecondaryText: { fontWeight: '700', fontSize: 15 },
    btnDanger: {
      backgroundColor: C.btnDanger,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnDangerText: { fontWeight: '600', fontSize: 13 },
    btnDisabled: { opacity: 0.45 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 16,
      gap: 10,
    },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deviceList: {
      height: 260,
      borderWidth: 1,
      borderRadius: 12,
      padding: 8,
    },
    deviceItem: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderRadius: 12,
      padding: 12,
    },
    deviceName: { fontWeight: '600', fontSize: 15 },
    deviceId: { fontSize: 12, marginTop: 2 },
    emptyText: { textAlign: 'center', marginTop: 12, fontSize: 14 },
  });
}
