import { useCallback, useEffect, useState } from 'react';
import { getDeviceId } from '@/auth/utils/device';
import { AUTH_STORAGE_KEYS, StorageService } from '@/auth/utils/storage';

export function useDeviceAuth() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    try {
      const currentId = await getDeviceId();
      const cachedId = await StorageService.getItem<string>(AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID);
      setDeviceId(currentId);
      const ok = currentId !== null && cachedId !== null && currentId === cachedId;
      setIsAuthorized(ok);
      return ok;
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsAuthorized(false);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const authorizeDevice = useCallback(async (id: string) => {
    try {
      const success = await StorageService.setItem(AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID, id);
      if (success) {
        setDeviceId(id);
        setIsAuthorized(true);
      }
      return success;
    } catch (error) {
      console.error('Error authorizing device:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return { deviceId, isAuthorized, loading, checkAuth, authorizeDevice };
}
