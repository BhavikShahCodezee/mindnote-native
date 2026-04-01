/**
 * Bluetooth Low Energy Printer Service
 * 
 * Handles BLE communication with the thermal printer.
 * 
 * Ported from Python implementation: catprinter/ble.py
 */

import { BleManager, Device, State } from 'react-native-ble-plx';
import { Buffer } from 'buffer';
import { Platform, PermissionsAndroid } from 'react-native';
import type { Permission, PermissionStatus } from 'react-native';
import type { Subscription } from 'react-native-ble-plx';

/**
 * BLE Service UUIDs
 * The printer advertises different UUIDs on different platforms
 */
export const POSSIBLE_SERVICE_UUIDS = [
  '0000ae30-0000-1000-8000-00805f9b34fb',  // Raspberry Pi
  '0000af30-0000-1000-8000-00805f9b34fb',  // macOS
];

/**
 * BLE Characteristic UUIDs
 */
export const TX_CHARACTERISTIC_UUID = '0000ae01-0000-1000-8000-00805f9b34fb';  // Send data
export const RX_CHARACTERISTIC_UUID = '0000ae02-0000-1000-8000-00805f9b34fb';  // Receive data
const TX_CHARACTERISTIC_UUID_ALT = '0000af01-0000-1000-8000-00805f9b34fb';
const RX_CHARACTERISTIC_UUID_ALT = '0000af02-0000-1000-8000-00805f9b34fb';

/**
 * Printer ready notification signature
 */
const PRINTER_READY_NOTIFICATION = Buffer.from([
  0x51, 0x78, 0xae, 0x01, 0x01, 0x00, 0x00, 0x00, 0xff
]);

/**
 * Printer flow control notifications (from Python `Commander`)
 */
const PRINTER_PAUSE_NOTIFICATION = Buffer.from([
  0x51, 0x78, 0xae, 0x01, 0x01, 0x00, 0x10, 0x70, 0xff,
]);

/**
 * Timing constants
 */
const DEFAULT_SCAN_TIME_MS = 4000;
const SCAN_FOR_ONE_TIMEOUT_MS = 10000;
const WAIT_AFTER_EACH_CHUNK_MS = 20;
const WAIT_FOR_PRINTER_DONE_TIMEOUT_MS = 30000;

/**
 * Printer Service Class
 * 
 * Manages BLE connection and communication with the thermal printer.
 */
export class PrinterService {
  private bleManager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private disconnectMonitor: Subscription | null = null;
  private isPrinterReady = false;
  private isPaused = false;
  private connectionListeners = new Set<(connected: boolean, device: Device | null) => void>();

  /**
   * Subscribe to connection state changes.
   * Returns an unsubscribe function.
   */
  onConnectionChange(listener: (connected: boolean, device: Device | null) => void): () => void {
    this.connectionListeners.add(listener);
    return () => this.connectionListeners.delete(listener);
  }

  private notifyConnectionChange(connected: boolean, device: Device | null): void {
    this.connectionListeners.forEach((l) => l(connected, device));
  }

  private resolveDefaultCharacteristicPair(serviceUuid: string): { tx: string; rx: string } {
    if (serviceUuid.startsWith('0000af30')) {
      return { tx: TX_CHARACTERISTIC_UUID_ALT, rx: RX_CHARACTERISTIC_UUID_ALT };
    }
    return { tx: TX_CHARACTERISTIC_UUID, rx: RX_CHARACTERISTIC_UUID };
  }

  private async resolveCharacteristicPair(serviceUuid: string): Promise<{ tx: string; rx: string }> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    const defaults = this.resolveDefaultCharacteristicPair(serviceUuid.toLowerCase());
    try {
      const chars = await this.connectedDevice.characteristicsForService(serviceUuid);
      const uuids = new Set(chars.map((c) => c.uuid.toLowerCase()));
      const txCandidates = [defaults.tx, TX_CHARACTERISTIC_UUID, TX_CHARACTERISTIC_UUID_ALT]
        .map((u) => u.toLowerCase());
      const rxCandidates = [defaults.rx, RX_CHARACTERISTIC_UUID, RX_CHARACTERISTIC_UUID_ALT]
        .map((u) => u.toLowerCase());
      const tx = txCandidates.find((u) => uuids.has(u)) ?? defaults.tx.toLowerCase();
      const rx = rxCandidates.find((u) => uuids.has(u)) ?? defaults.rx.toLowerCase();
      return { tx, rx };
    } catch {
      return { tx: defaults.tx.toLowerCase(), rx: defaults.rx.toLowerCase() };
    }
  }
  
  constructor() {
    try {
      this.bleManager = new BleManager();
    } catch {
      console.warn(
        '⚠️ BLE Manager not available. ' +
        'This is expected in Expo Go. ' +
        'Please use a development build or production build to test Bluetooth.'
      );
      this.bleManager = null;
    }
  }
  
  /**
   * Check if BLE is available
   */
  private checkBleAvailable(): void {
    if (!this.bleManager) {
      throw new Error(
        'Bluetooth is not available. ' +
        'You are likely running in Expo Go, which does not support react-native-ble-plx. ' +
        'Please create a development build using: eas build --profile development --platform android'
      );
    }
  }

  onAdapterStateChange(listener: (state: State) => void): (() => void) {
    if (!this.bleManager) return () => {};
    const sub = this.bleManager.onStateChange(listener, true);
    return () => sub.remove();
  }
  
  /**
   * Initialize BLE manager and check permissions
   */
  async initialize(): Promise<void> {
    this.checkBleAvailable();

    if (Platform.OS === 'android') {
      await this.requestAndroidBlePermissions();
    }
    
    const state = await this.bleManager!.state();
    
    if (state !== State.PoweredOn) {
      throw new Error(
        `Bluetooth is not powered on. Current state: ${state}. ` +
        'Please enable Bluetooth and try again.'
      );
    }
    
  }

  private async requestAndroidBlePermissions(): Promise<void> {
    // Android 12+ needs BLUETOOTH_SCAN/CONNECT. Android <12 typically needs location for scanning.
    const api = Platform.Version as number;

    const needed: Permission[] = [];
    if (api >= 31) {
      needed.push(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
      );
    } else {
      needed.push(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    }

    const results = (await PermissionsAndroid.requestMultiple(needed)) as Record<Permission, PermissionStatus>;
    const denied = needed.filter((p) => results[p] !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied.length) {
      throw new Error('Device is not authorized to use BluetoothLE. Please grant Bluetooth permissions in Settings.');
    }
  }
  
  /**
   * Scan for printer devices (known models or all BLE devices).
   *
   * @param options - scanTimeMs: duration in ms; listAll: if true, return all BLE devices
   * @returns List of found devices
   */
  async scanForDevices(options?: {
    scanTimeMs?: number;
    listAll?: boolean;
  }): Promise<Device[]> {
    this.checkBleAvailable();
    await this.initialize();

    const scanTimeMs = options?.scanTimeMs ?? DEFAULT_SCAN_TIME_MS;
    const listAll = options?.listAll ?? false;
    const seen = new Map<string, Device>();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager!.stopDeviceScan();
        resolve(Array.from(seen.values()));
      }, scanTimeMs);

      this.bleManager!.startDeviceScan(
        null,
        { allowDuplicates: true },
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.bleManager!.stopDeviceScan();
            reject(error);
            return;
          }
          if (!device?.id) return;

          const isPrinter = listAll || device.serviceUUIDs?.some(uuid =>
            POSSIBLE_SERVICE_UUIDS.includes(uuid.toLowerCase())
          ) || /^(GT01|GB0[23]|YT01)/i.test(device.name || '');
          if (isPrinter && !seen.has(device.id)) {
            seen.set(device.id, device);
          }
        }
      );
    });
  }

  /**
   * Scan for a single printer (by name or first available).
   *
   * @param deviceName - Optional device name (e.g. "GT01", "GB02")
   * @param scanTimeMs - How long to scan
   * @returns Found device
   */
  async scanForPrinter(deviceName?: string, scanTimeMs: number = SCAN_FOR_ONE_TIMEOUT_MS): Promise<Device> {
    this.checkBleAvailable();
    await this.initialize();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.bleManager!.stopDeviceScan();
        reject(new Error(
          'Unable to find printer. Make sure it is turned on and in range.'
        ));
      }, scanTimeMs);

      this.bleManager!.startDeviceScan(
        null,
        null,
        (error, device) => {
          if (error) {
            clearTimeout(timeout);
            this.bleManager!.stopDeviceScan();
            reject(error);
            return;
          }
          if (!device) return;

          const isMatch = deviceName
            ? device.name === deviceName
            : device.serviceUUIDs?.some(uuid =>
                POSSIBLE_SERVICE_UUIDS.includes(uuid.toLowerCase())
              ) || /^(GT01|GB0[23]|YT01)/i.test(device.name || '');

          if (isMatch) {
            clearTimeout(timeout);
            this.bleManager!.stopDeviceScan();
            resolve(device);
          }
        }
      );
    });
  }
  
  /**
   * Connect to a printer device
   * 
   * @param device - Device to connect to
   */
  async connect(device: Device): Promise<void> {
    if (this.disconnectMonitor) {
      this.disconnectMonitor.remove();
      this.disconnectMonitor = null;
    }
    this.connectedDevice = await device.connect();
    await this.connectedDevice.discoverAllServicesAndCharacteristics();
    await this.connectedDevice.requestMTU(512);
    this.disconnectMonitor = this.bleManager?.onDeviceDisconnected(this.connectedDevice.id, () => {
      this.connectedDevice = null;
      this.notifyConnectionChange(false, null);
    }) ?? null;
    this.notifyConnectionChange(true, this.connectedDevice);
  }
  
  /**
   * Whether a device is currently connected.
   */
  isConnected(): boolean {
    return this.connectedDevice != null;
  }

  /**
   * Currently connected device (if any).
   */
  getConnectedDevice(): Device | null {
    return this.connectedDevice;
  }

  /**
   * Disconnect from the printer
   */
  async disconnect(): Promise<void> {
    if (this.disconnectMonitor) {
      this.disconnectMonitor.remove();
      this.disconnectMonitor = null;
    }
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
      this.connectedDevice = null;
      this.notifyConnectionChange(false, null);
    }
  }
  
  /**
   * Set up notification listener for printer ready signal
   */
  private async setupNotifications(): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    
    this.isPrinterReady = false;
    this.isPaused = false;
    
    // Find the service that contains our characteristic
    const services = await this.connectedDevice.services();
    let targetService = null;
    
    for (const service of services) {
      const serviceUuid = service.uuid.toLowerCase();
      if (POSSIBLE_SERVICE_UUIDS.includes(serviceUuid)) {
        targetService = service;
        break;
      }
    }
    
    if (!targetService) {
      throw new Error('Printer service not found');
    }
    
    const { rx } = await this.resolveCharacteristicPair(targetService.uuid);
    // Monitor notifications
    this.connectedDevice.monitorCharacteristicForService(
      targetService.uuid,
      rx,
      (error, characteristic) => {
        if (error) {
          console.error('Notification error:', error);
          return;
        }
        
        if (characteristic?.value) {
          const data = Buffer.from(characteristic.value, 'base64');
          // Flow control: pause/resume
          if (data.equals(PRINTER_PAUSE_NOTIFICATION)) {
            this.isPaused = true;
            return;
          }
          if (data.equals(PRINTER_READY_NOTIFICATION)) {
            this.isPaused = false;
            this.isPrinterReady = true;
            return;
          }
        }
      }
    );
  }
  
  private async waitWhilePaused(): Promise<void> {
    if (!this.isPaused) return;
    const start = Date.now();
    // Same spirit as Python: sleep(0.2) loop until resumed.
    while (this.isPaused) {
      // safeguard against hard-deadlock
      if (Date.now() - start > WAIT_FOR_PRINTER_DONE_TIMEOUT_MS) {
        throw new Error('Timed out waiting for printer flow-control resume');
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  /**
   * Wait for printer to be ready
   */
  private async waitForPrinterReady(): Promise<void> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.isPrinterReady) {
          clearInterval(checkInterval);
          resolve();
        } else if (Date.now() - startTime > WAIT_FOR_PRINTER_DONE_TIMEOUT_MS) {
          clearInterval(checkInterval);
          reject(new Error('Timed out waiting for printer done event'));
        }
      }, 100);
    });
  }
  
  /**
   * Send data to printer in chunks
   * 
   * @param data - Data to send (Uint8Array or Buffer)
   */
  async sendData(data: Uint8Array | Buffer): Promise<void> {
    if (!this.connectedDevice) {
      throw new Error('No device connected');
    }
    
    // Find the service that contains our characteristic
    const services = await this.connectedDevice.services();
    let targetService = null;
    
    for (const service of services) {
      const serviceUuid = service.uuid.toLowerCase();
      if (POSSIBLE_SERVICE_UUIDS.includes(serviceUuid)) {
        targetService = service;
        break;
      }
    }
    
    if (!targetService) {
      throw new Error('Printer service not found');
    }
    
    // Resolve characteristics for this service (aeXX/afXX variants)
    const { tx } = await this.resolveCharacteristicPair(targetService.uuid);

    // Set up notifications
    await this.setupNotifications();
    
    const updatedDevice = await this.connectedDevice.requestMTU(512);
    const mtu = updatedDevice.mtu ?? 512;
    const chunkSize = mtu - 3;
    
    // Convert to Buffer if needed
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    
    // Send data in chunks
    for (let i = 0; i < buffer.length; i += chunkSize) {
      await this.waitWhilePaused();
      const chunk = buffer.slice(i, Math.min(i + chunkSize, buffer.length));
      const base64Chunk = chunk.toString('base64');
      
      try {
        await this.connectedDevice.writeCharacteristicWithResponseForService(
          targetService.uuid,
          tx,
          base64Chunk
        );
      } catch {
        // Some devices reject "with response"; fallback keeps compatibility with Cat-printer clones.
        await this.connectedDevice.writeCharacteristicWithoutResponseForService(
          targetService.uuid,
          tx,
          base64Chunk
        );
      }
      
      // Wait between chunks
      await new Promise(resolve => 
        setTimeout(resolve, WAIT_AFTER_EACH_CHUNK_MS)
      );
    }
    
    // Wait for printer to finish
    await this.waitForPrinterReady();
  }
  
  /**
   * Send print data. Uses existing connection if connected; otherwise scans and connects.
   * Keeps connection open after printing (like Cat-Printer).
   *
   * @param data - Print data
   * @param deviceName - Optional device name to use if not already connected
   */
  async print(data: Uint8Array | Buffer, deviceName?: string): Promise<void> {
    await this.initialize();

    const useExisting =
      this.connectedDevice &&
      (!deviceName || this.connectedDevice.name === deviceName);
    if (!useExisting) {
      if (this.connectedDevice) await this.disconnect();
      const device = await this.scanForPrinter(deviceName);
      await this.connect(device);
    }

    try {
      await this.sendData(data);
    } catch (error) {
      console.error('🛑 Print error:', error);
      throw error;
    }
  }
  
  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.disconnectMonitor) {
      this.disconnectMonitor.remove();
      this.disconnectMonitor = null;
    }
    if (this.bleManager) {
      this.bleManager.destroy();
    }
  }
}

/**
 * Singleton instance for easy access
 */
let printerServiceInstance: PrinterService | null = null;

export function getPrinterService(): PrinterService {
  if (!printerServiceInstance) {
    printerServiceInstance = new PrinterService();
  }
  return printerServiceInstance;
}
