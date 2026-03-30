import { useEffect } from 'react';
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

  useEffect(() => {
    const printerService = getPrinterService();

    // 1. Register real-time connection state listener.
    const unsubscribe = printerService.onConnectionChange((connected, device) => {
      if (connected && device) {
        setConnected(device);
      } else {
        setDisconnected();
      }
    });

    // 2. Sync current state in case the printer was already connected before
    //    this hook mounted (e.g. re-render of root layout).
    if (printerService.isConnected()) {
      const existing = printerService.getConnectedDevice();
      if (existing) setConnected(existing);
    }

    // 3. Auto-connect saved device (best-effort, fails silently).
    let cancelled = false;
    (async () => {
      if (printerService.isConnected()) return;

      const saved = await loadSavedPrinter();
      if (!saved || cancelled) return;

      const printService = getPrintService();
      let attempts = 0;

      while (attempts < 2 && !cancelled) {
        attempts++;
        try {
          const list = await printService.scanForPrinters(2500, true);
          if (cancelled) return;

          const match =
            list.find((d) => d.id === saved.id) ??
            (saved.name ? list.find((d) => d.name === saved.name) : undefined);

          if (!match) return;

          const result = await printService.connectToDevice(match);
          if (result.success) return;
        } catch {
          // fail silently — do not crash or show error UI
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
