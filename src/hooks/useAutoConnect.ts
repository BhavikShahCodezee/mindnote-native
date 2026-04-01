import { useEffect } from 'react';
import { State } from 'react-native-ble-plx';
import { getPrinterService } from '@/src/bluetooth/printerService';
import { getPrintService } from '@/src/services/printService';
import { loadSavedPrinter } from '@/src/storage/savedPrinter';
import { usePrinterStore } from '@/src/store/usePrinterStore';

/**
 * Registers a real-time connection listener on the shared PrinterService
 * singleton, syncs Zustand store, and attempts auto-reconnect to the last
 * saved printer when the app starts.
 *
 * Call this hook once from the root layout.
 */
export function useAutoConnect(): void {
  const setConnected = usePrinterStore((s) => s.setConnected);
  const setDisconnected = usePrinterStore((s) => s.setDisconnected);
  const setConnecting = usePrinterStore((s) => s.setConnecting);
  const setScanning = usePrinterStore((s) => s.setScanning);

  useEffect(() => {
    const printerService = getPrinterService();
    const printService = getPrintService();
    const SCAN_INTERVAL_MS = 4000;
    let savedPrinter: Awaited<ReturnType<typeof loadSavedPrinter>> = null;
    let cancelled = false;
    let inFlight = false;

    // 1. Register real-time connection state listener.
    const unsubscribe = printerService.onConnectionChange((connected, device) => {
      if (connected && device) {
        setConnected(device);
      } else {
        setDisconnected();
      }
    });

    // 2. Sync current state in case the printer was already connected.
    if (printerService.isConnected()) {
      const existing = printerService.getConnectedDevice();
      if (existing) setConnected(existing);
    }

    const tryAutoConnect = async (): Promise<void> => {
      if (cancelled || inFlight) return;
      if (printerService.isConnected()) return;
      if (!savedPrinter?.id) return;

      inFlight = true;
      setScanning(true);
      try {
        const list = await printService.scanForPrinters(2200, true);
        if (cancelled) return;

        const match =
          list.find((d) => d.id === savedPrinter!.id) ??
          (savedPrinter.name ? list.find((d) => d.name === savedPrinter!.name) : undefined);
        if (!match) return;

        setScanning(false);
        setConnecting(true);
        const result = await printService.connectToDevice(match);
        if (!result.success && !cancelled) {
          setDisconnected();
        }
      } catch {
        // Safe failure: Bluetooth off, permission denied, or scan/connect error.
      } finally {
        inFlight = false;
        setScanning(false);
        setConnecting(false);
      }
    };

    const onAdapterState = (state: State) => {
      if (state !== State.PoweredOn) {
        setDisconnected();
        return;
      }
      void tryAutoConnect();
    };
    const unsubscribeAdapter = printerService.onAdapterStateChange(onAdapterState);

    let interval: ReturnType<typeof setInterval> | null = null;
    (async () => {
      savedPrinter = await loadSavedPrinter();
      if (cancelled) return;
      void tryAutoConnect();
      interval = setInterval(() => {
        if (!printerService.isConnected()) {
          void tryAutoConnect();
        }
      }, SCAN_INTERVAL_MS);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      unsubscribe();
      unsubscribeAdapter();
    };
  }, [setConnected, setConnecting, setDisconnected, setScanning]);
}
