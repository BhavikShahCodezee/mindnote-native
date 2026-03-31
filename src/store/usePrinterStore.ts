import { create } from 'zustand';
import type { Device } from 'react-native-ble-plx';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DARK_MODE_KEY = 'mos.darkMode.v1';

interface PrinterState {
  isConnected: boolean;
  device: Device | null;
  setConnected: (device: Device) => void;
  setDisconnected: () => void;

  isDarkMode: boolean;
  toggleDarkMode: () => void;
  loadDarkMode: () => Promise<void>;
}

export const usePrinterStore = create<PrinterState>((set, get) => ({
  isConnected: false,
  device: null,
  setConnected: (device) => set({ isConnected: true, device }),
  setDisconnected: () => set({ isConnected: false, device: null }),

  isDarkMode: true,
  toggleDarkMode: () => {
    const next = !get().isDarkMode;
    set({ isDarkMode: next });
    AsyncStorage.setItem(DARK_MODE_KEY, JSON.stringify(next)).catch(() => {});
  },
  loadDarkMode: async () => {
    try {
      const raw = await AsyncStorage.getItem(DARK_MODE_KEY);
      if (raw !== null) set({ isDarkMode: JSON.parse(raw) as boolean });
    } catch {}
  },
}));
