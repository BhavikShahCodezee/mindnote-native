/**
 * Print Service
 * 
 * Main orchestrator for the printing workflow.
 * Coordinates image processing, command generation, and BLE communication.
 * 
 * Ported from Python implementation: print.py
 */

import { DitheringAlgorithm } from '../image/dithering';
import { cmdsPrintImg, cmdsPrintImgPeriPage } from '../printer/commandGenerator';
import { getPrinterService } from '../bluetooth/printerService';
import { getDryRun, getQuality } from '../settings';
import type { Device } from 'react-native-ble-plx';
import { processJpegBase64ToBitmap } from '@/src/utils/imageProcessor';
import type { AppSettings } from '@/src/storage/appSettings';
import {
  fontSizeForPrint,
  loadAppSettings,
} from '@/src/storage/appSettings';
import { printTextAsImageDirect } from '@/src/text/textPrintService';
import { loadPrinterDeviceType } from '@/src/storage/printerDeviceType';

/**
 * Print configuration options (Cat-Printer–style)
 */
export interface PrintOptions {
  imageUri: string;
  imageBase64?: string;
  algorithm?: DitheringAlgorithm;
  energy?: number;
  deviceName?: string;
  /** Use this device if already connected. */
  device?: Device | null;
  showPreview?: boolean;
}

/**
 * Print result information
 */
export interface PrintResult {
  success: boolean;
  message: string;
  error?: Error;
  imageSize?: { width: number; height: number };
  dataSize?: number;
}

/**
 * Main Print Service Class
 * 
 * Handles the complete printing workflow from image to printed output.
 */
export class PrintService {
  private forceWhiteBorderAtPrinterStage(img: boolean[][], borderPx = 2): boolean[][] {
    if (!img.length || !img[0]?.length) return img;
    const h = img.length;
    const w = img[0].length;
    const b = Math.max(1, Math.min(borderPx, Math.floor(Math.min(w, h) / 2)));
    return img.map((row, y) =>
      row.map((px, x) => (x < b || y < b || x >= w - b || y >= h - b ? false : px))
    );
  }

  private async getCurrentPrintConfig(): Promise<{
    settings: AppSettings;
    energy: number;
  }> {
    const settings = await loadAppSettings();
    // Force MAX density (no fading).
    const energy = 0xffff;
    return { settings, energy };
  }

  async printText(text: string, device?: Device | null): Promise<PrintResult> {
    try {
      const { settings, energy } = await this.getCurrentPrintConfig();
      return await printTextAsImageDirect({
        text,
        fontSize: fontSizeForPrint(settings),
        fontStyle: settings.fontStyle,
        wrapBySpaces: settings.wrapBySpaces,
        energy,
        device,
        previewCenterX: settings.previewCenterX,
        previewCenterY: settings.previewCenterY,
        previewRotationDeg: settings.previewRotationDeg,
        previewScale: settings.previewScale,
      });
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async printNote(text: string, device?: Device | null): Promise<PrintResult> {
    try {
      const { settings, energy } = await this.getCurrentPrintConfig();

      const opts = {
        text,
        fontSize: fontSizeForPrint(settings),
        fontStyle: settings.fontStyle,
        wrapBySpaces: settings.wrapBySpaces,
        energy,
        device,
        previewCenterX: settings.previewCenterX,
        previewCenterY: settings.previewCenterY,
        previewRotationDeg: settings.previewRotationDeg,
        previewScale: settings.previewScale,
      };
      // System-wide rule: always print notes as images.
      return await printTextAsImageDirect(opts);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  async printImage(imageUri: string, imageBase64: string, device?: Device | null): Promise<PrintResult> {
    const { energy } = await this.getCurrentPrintConfig();
    return this.print({
      imageUri,
      imageBase64,
      energy,
      device,
    });
  }

  /**
   * Process and print an image
   * 
   * @param options - Print configuration
   * @returns Print result
   */
  async print(options: PrintOptions): Promise<PrintResult> {
    const {
      imageBase64,
      deviceName,
      device,
      showPreview = false,
    } = options;

    try {
      const forcedEnergy = 0xffff;
      if (!imageBase64) throw new Error('Missing image base64 payload for processing');

      const binaryImage = processJpegBase64ToBitmap(imageBase64);

      // Cat-Printer firmware expects bitmap bits in a specific polarity.
      // The wasm `monoToPbm` step XORs packed bits (equivalent to complementing the mono bitmap),
      // while our `cmdsPrintImg()` only reverse-bits per byte.
      // So we replicate both:
      //  - vertical flip (Python: `flip(..., vertically=True)` in `_print_bitmap`)
      //  - bit polarity complement (Python/wasm PBM XOR behaviour)
      const binaryForPrinter = [...binaryImage]
        .reverse()
        // Fix horizontal mirroring: mirror each row before packing bytes.
        .map((row) => row.slice().reverse().map((p) => !p));
      const guardedBinary = this.forceWhiteBorderAtPrinterStage(binaryForPrinter, 3);
      if (binaryForPrinter.length === 0) throw new Error('Image bitmap is empty');
      
      const imageSize = {
        height: binaryForPrinter.length,
        width: binaryForPrinter[0]?.length || 0,
      };
      
      // Step 2: Show preview if requested
      if (showPreview) {
        // TODO: Implement preview functionality
      }
      const quality = getQuality();
      const deviceType = await loadPrinterDeviceType();
      const modelName = device?.name ?? deviceName;
      const commandData =
        deviceType === 'C'
          ? cmdsPrintImgPeriPage(guardedBinary)
          : cmdsPrintImg(guardedBinary, forcedEnergy, quality, modelName);
      
      const printerService = getPrinterService();
      if (getDryRun()) {
      } else {
        if (device) {
          if (!printerService.isConnected() || printerService.getConnectedDevice()?.id !== device.id) {
            await printerService.disconnect();
            await printerService.connect(device);
          }
          await printerService.sendData(commandData);
        } else {
          await printerService.print(commandData, deviceName);
        }
      }
      return {
        success: true,
        message: 'Print completed successfully',
        imageSize,
        dataSize: commandData.length,
      };
      
    } catch (error) {
      
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
  
  /**
   * Scan for printers (like Cat-Printer /devices).
   *
   * @param scanTimeMs - How long to scan in ms
   * @param listAll - If true, return all BLE devices (test unknown device)
   * @returns List of BLE devices (pass one to connectToDevice or print options.device)
   */
  async scanForPrinters(scanTimeMs?: number, listAll?: boolean): Promise<Device[]> {
    const printerService = getPrinterService();
    return printerService.scanForDevices({
      scanTimeMs: scanTimeMs ?? 4000,
      listAll,
    });
  }

  /**
   * Connect to a specific device (by Device object from scan).
   */
  async connectToDevice(device: Device): Promise<PrintResult> {
    try {
      const printerService = getPrinterService();
      await printerService.initialize();
      await printerService.connect(device);
      return { success: true, message: 'Connected' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Disconnect from current printer.
   */
  async disconnect(): Promise<void> {
    await getPrinterService().disconnect();
  }

  /** Whether a printer is currently connected. */
  isConnected(): boolean {
    return getPrinterService().isConnected();
  }

  /**
   * Test printer connection without printing.
   */
  async testConnection(deviceName?: string): Promise<PrintResult> {
    try {
      const printerService = getPrinterService();
      await printerService.initialize();
      const device = await printerService.scanForPrinter(deviceName);
      await printerService.connect(device);
      await printerService.disconnect();
      return { success: true, message: 'Printer connection successful' };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
  
  /**
   * Get list of available dithering algorithms
   */
  getAvailableAlgorithms(): DitheringAlgorithm[] {
    return [
      'floyd-steinberg',
      'atkinson',
      'halftone',
      'mean-threshold',
      'none',
    ];
  }
  
  /**
   * Get algorithm description
   */
  getAlgorithmDescription(algorithm: DitheringAlgorithm): string {
    const descriptions: Record<DitheringAlgorithm, string> = {
      'floyd-steinberg': 
        'High-quality error diffusion dithering. Best for photos and detailed images.',
      'atkinson': 
        'Lighter error diffusion with artistic effect. Good for illustrations.',
      'halftone': 
        'Classic newspaper-style halftone pattern. Creates a vintage look.',
      'mean-threshold': 
        'Simple threshold based on image mean. Fast but lower quality.',
      'none': 
        'No dithering, simple black/white conversion. Requires 384px width.',
    };
    
    return descriptions[algorithm];
  }
}

/**
 * Singleton instance for easy access
 */
let printServiceInstance: PrintService | null = null;

export function getPrintService(): PrintService {
  if (!printServiceInstance) {
    printServiceInstance = new PrintService();
  }
  return printServiceInstance;
}
