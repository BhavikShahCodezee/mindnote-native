import { ensureConnectedPrinter } from '@/src/bluetooth/ensureConnectedPrinter';
import { getPrinterService } from '@/src/bluetooth/printerService';
import { getPrintService } from '@/src/services/printService';
import { clearSavedPrinter, loadSavedPrinter, savePrinter } from '@/src/storage/savedPrinter';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { Device } from 'react-native-ble-plx';

export default function HomeScreen() {
  const router = useRouter();
  const printService = getPrintService();
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [showScanDialog, setShowScanDialog] = useState(false);
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const connected = printService.isConnected();
  const connectedDeviceName = connected ? getPrinterService().getConnectedDevice()?.name ?? 'Printer' : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadSavedPrinter();
      if (!cancelled && saved) setSavedDeviceId(saved.id);
    })();
    return () => {
      cancelled = true;
    };
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
    if (!connected) {
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
      if (result.canceled || !result.assets?.[0]) {
        return;
      }
      const uri = result.assets[0].uri;
      const base64 = result.assets[0].base64;
      if (!base64) {
        throw new Error('Selected image has no base64 payload');
      }
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
  }, [connected, printService]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MosMos -JM</Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connection Status</Text>
        <View style={[styles.statusBadge, connected ? styles.statusConnected : styles.statusDisconnected]}>
          <Text style={styles.statusText}>
            {connected ? `Connected: ${connectedDeviceName}` : 'Disconnected'}
          </Text>
        </View>
        <TouchableOpacity style={styles.primaryButton} onPress={onScan} disabled={scanning || connecting}>
          {scanning ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Bluetooth Scan</Text>}
        </TouchableOpacity>
        {connected ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onDisconnect} disabled={connecting}>
            <Text style={styles.secondaryText}>Disconnect</Text>
          </TouchableOpacity>
        ) : null}
        {savedDeviceId ? (
          <TouchableOpacity style={styles.linkButton} onPress={onForget}>
            <Text style={styles.linkText}>Forget saved device ({savedDeviceId})</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/notes' as never)}>
          <Text style={styles.primaryText}>Notes</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={onImagePrint}
          disabled={!connected || printing}
        >
          {printing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryText}>Image</Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/settings' as never)}>
          <Text style={styles.secondaryText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={showScanDialog}
        transparent
        animationType="fade"
        onRequestClose={() => setShowScanDialog(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.cardTitle}>Available Devices</Text>
              <TouchableOpacity style={styles.closeButton} onPress={() => setShowScanDialog(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.fixedListBox}>
              <ScrollView
                showsVerticalScrollIndicator
                contentContainerStyle={styles.deviceListContent}
              >
                {devices.length ? (
                  devices.map((d) => (
                    <TouchableOpacity key={d.id} style={styles.deviceItem} onPress={() => onConnect(d)} disabled={connecting}>
                      <Text style={styles.deviceName}>{d.name ?? 'Unknown'}</Text>
                      <Text style={styles.deviceId}>{d.id}{savedDeviceId === d.id ? ' (saved)' : ''}</Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={styles.emptyDevicesText}>
                    {scanning ? 'Scanning for devices...' : 'No devices found'}
                  </Text>
                )}
              </ScrollView>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f6f8fc', padding: 20, gap: 14 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    gap: 10,
  },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  statusBadge: { borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  statusConnected: { backgroundColor: '#d1f7df' },
  statusDisconnected: { backgroundColor: '#ffdcdc' },
  statusText: { fontWeight: '600', color: '#1b1b1b' },
  primaryButton: { backgroundColor: '#0a7ea4', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryButton: { backgroundColor: '#e9edf4', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: '#1f2937', fontWeight: '700', fontSize: 16 },
  linkButton: { paddingVertical: 6, alignItems: 'center' },
  linkText: { color: '#4b5563', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: '#374151', fontWeight: '700', fontSize: 16 },
  fixedListBox: {
    height: 260,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 8,
    backgroundColor: '#fff',
  },
  deviceListContent: { gap: 8, paddingBottom: 8 },
  deviceItem: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, gap: 2 },
  deviceName: { fontWeight: '600', fontSize: 15 },
  deviceId: { color: '#6b7280', fontSize: 12 },
  emptyDevicesText: { color: '#6b7280', textAlign: 'center', marginTop: 8 },
  actionsRow: { marginTop: 'auto', gap: 10, paddingBottom: 20 },
});

