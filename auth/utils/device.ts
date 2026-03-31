import * as Application from 'expo-application';
import { AUTH_STORAGE_KEYS, StorageService } from './storage';

export const getDeviceId = async () => {
  if (Application.getAndroidId) {
    const id = await Application.getAndroidId();
    if (id) await StorageService.setItem(AUTH_STORAGE_KEYS.DEVICE_ID, id);
    return id;
  }
  return null;
};
