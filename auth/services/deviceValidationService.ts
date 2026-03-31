import { validateDevice as validateDeviceAPI, ValidateDeviceResponse } from '@/auth/services/authApi';
import { AUTH_STORAGE_KEYS, StorageService } from '@/auth/utils/storage';

export class DeviceValidationService {
  static async validateDevice(deviceId: string): Promise<ValidateDeviceResponse> {
    try {
      const response = await validateDeviceAPI(deviceId);
      if (response.allowed && response.status === 'true') {
        await StorageService.setItem(AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID, deviceId);
      }
      return response;
    } catch (error) {
      console.error('Device validation error:', error);
      return {
        status: 'false',
        code: 'validation_error',
        message: 'Failed to validate device. Please try again.',
        allowed: false,
      };
    }
  }

  static async isDeviceValidated(deviceId: string | null): Promise<boolean> {
    if (!deviceId) return false;
    try {
      const cachedId = await StorageService.getItem<string>(AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID);
      return cachedId === deviceId;
    } catch (error) {
      console.error('Error checking device validation:', error);
      return false;
    }
  }
}
