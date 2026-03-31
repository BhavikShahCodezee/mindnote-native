import AsyncStorage from '@react-native-async-storage/async-storage';

export const AUTH_STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER_DATA: 'userData',
  AUTHENTICATION_ID: 'authenticationId',
  DEVICE_ID: 'deviceId',
  ALLOWED_DEVICE_ID: 'allowedDeviceId',
} as const;

export class StorageService {
  static async getItem<T = string>(key: string): Promise<T | null> {
    try {
      const value = await AsyncStorage.getItem(key);
      if (value === null) return null;
      return value as T;
    } catch (error) {
      console.error(`Error getting item ${key}:`, error);
      return null;
    }
  }

  static async setItem(key: string, value: string): Promise<boolean> {
    try {
      await AsyncStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.error(`Error setting item ${key}:`, error);
      return false;
    }
  }

  static async removeMultiple(keys: string[]): Promise<boolean> {
    try {
      await AsyncStorage.multiRemove(keys);
      return true;
    } catch (error) {
      console.error('Error removing multiple items:', error);
      return false;
    }
  }
}
