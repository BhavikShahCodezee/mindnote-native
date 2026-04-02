import AsyncStorage from '@react-native-async-storage/async-storage';

export type PrinterDeviceType = 'A' | 'B' | 'C';

const KEY = 'mos.printerDeviceType.v1';
const DEFAULT_TYPE: PrinterDeviceType = 'A';

export async function loadPrinterDeviceType(): Promise<PrinterDeviceType> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw === 'A' || raw === 'B' || raw === 'C') return raw;
    return DEFAULT_TYPE;
  } catch {
    return DEFAULT_TYPE;
  }
}

export async function savePrinterDeviceType(type: PrinterDeviceType): Promise<void> {
  await AsyncStorage.setItem(KEY, type);
}

