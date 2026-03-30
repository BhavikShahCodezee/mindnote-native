import { create } from 'zustand';
import type { Device } from 'react-native-ble-plx';

interface PrinterState {
  isConnected: boolean;
  device: Device | null;
  setConnected: (device: Device) => void;
  setDisconnected: () => void;
}

export const usePrinterStore = create<PrinterState>((set) => ({
  isConnected: false,
  device: null,
  setConnected: (device) => set({ isConnected: true, device }),
  setDisconnected: () => set({ isConnected: false, device: null }),
}));
