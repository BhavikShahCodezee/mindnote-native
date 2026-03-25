/**
 * Print Service
 * 
 * Main orchestrator for the printing workflow.
 * Coordinates image processing, command generation, and BLE communication.
 * 
 * Ported from Python implementation: print.py
 */

import { DitheringAlgorithm } from '../image/dithering';
import { cmdsPrintImg } from '../printer/commandGenerator';
import { getPrinterService } from '../bluetooth/printerService';
import { getDryRun, getQuality } from '../settings';
import type { Device } from 'react-native-ble-plx';
import { processJpegBase64ToBitmap } from '@/src/utils/imageProcessor';
import type { AppSettings } from '@/src/storage/appSettings';
import {
  fontSizeForPrint,
  horizontalAlignForPrint,
  loadAppSettings,
} from '@/src/storage/appSettings';
import { printTextDirect } from '@/src/text/textPrintService';
import { logDebug } from '@/src/debug/logDebug';

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
      console.log('Font Config:', {
        fontStyle: settings.fontStyle,
        fontSize: fontSizeForPrint(settings),
        align: horizontalAlignForPrint(settings),
        wrapBySpaces: settings.wrapBySpaces,
      });
      const result = await printTextDirect({
        text,
        fontSize: fontSizeForPrint(settings),
        fontStyle: settings.fontStyle,
        align: horizontalAlignForPrint(settings),
        wrapBySpaces: settings.wrapBySpaces,
        energy,
        device,
      });
      return result;
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
      imageUri,
      imageBase64,
      algorithm = 'floyd-steinberg',
      deviceName,
      device,
      showPreview = false,
    } = options;

    try {
      console.log('🖨️ Starting print job...');
      console.log(`   Image: ${imageUri}`);
      console.log(`   Algorithm: ${algorithm}`);
      const forcedEnergy = 0xffff;
      console.log(`   Energy: 0x${forcedEnergy.toString(16)}`);
      const { settings } = await this.getCurrentPrintConfig();
      console.log('Font Config:', {
        fontStyle: settings.fontStyle,
        fontSize: fontSizeForPrint(settings),
        align: horizontalAlignForPrint(settings),
        wrapBySpaces: settings.wrapBySpaces,
      });
      console.log('⏳ Processing image...');
      if (!imageBase64) throw new Error('Missing image base64 payload for processing');

      logDebug('Print started: image');
      logDebug(`Image processing started uri=${imageUri}`);

      const binaryImage = processJpegBase64ToBitmap(imageBase64);
      logDebug(`Image processed. rows=${binaryImage.length}`);

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
      const blackPixels = binaryForPrinter.reduce(
        (sum, row) => sum + row.reduce((s, p) => s + (p ? 1 : 0), 0),
        0
      );
      logDebug(`Bitmap generated (flipped+complemented). rows=${binaryForPrinter.length} blackPixels=${blackPixels}`);
      if (binaryForPrinter.length === 0) throw new Error('Image bitmap is empty');
      
      const imageSize = {
        height: binaryForPrinter.length,
        width: binaryForPrinter[0]?.length || 0,
      };
      
      console.log(`✅ Image processed: ${imageSize.height}x${imageSize.width} pixels`);
      
      // Step 2: Show preview if requested
      if (showPreview) {
        // TODO: Implement preview functionality
        console.log('ℹ️  Preview requested (not yet implemented)');
      }
      
      console.log('⏳ Generating printer commands...');
      const quality = getQuality();
      const modelName = device?.name ?? deviceName;
      const commandData = cmdsPrintImg(binaryForPrinter, forcedEnergy, quality, modelName);
      console.log(`✅ Generated ${commandData.length} bytes of commands`);
      console.log(`   Command preview: ${Array.from(commandData.slice(0, 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')} ...`);
      
      const printerService = getPrinterService();
      if (getDryRun()) {
        console.log(' Dry run: skipping BLE send');
      } else {
        console.log('⏳ Sending to printer...');
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
      
      console.log('✅ Print job completed successfully!');
      
      return {
        success: true,
        message: 'Print completed successfully',
        imageSize,
        dataSize: commandData.length,
      };
      
    } catch (error) {
      console.error('🛑 Print job failed:', error);
      
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
