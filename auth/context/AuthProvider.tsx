import React, { createContext, useEffect, useMemo, useState } from 'react';
import { DeviceValidationService } from '@/auth/services/deviceValidationService';
import { getDeviceId } from '@/auth/utils/device';
import { AUTH_STORAGE_KEYS, StorageService } from '@/auth/utils/storage';

type AuthContextValue = {
  ready: boolean;
  validating: boolean;
  allowed: boolean | null;
  showRestore: boolean;
  setShowRestore: (value: boolean) => void;
  setAllowed: (value: boolean) => void;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [showRestore, setShowRestore] = useState(false);
  const [validating, setValidating] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setValidating(true);
        const currentId = await getDeviceId();
        if (!currentId) {
          setAllowed(false);
          setReady(true);
          setValidating(false);
          return;
        }
        const isCached = await DeviceValidationService.isDeviceValidated(currentId);
        const serverResponse = await DeviceValidationService.validateDevice(currentId);
        if (isCached) {
          setAllowed(serverResponse.allowed && serverResponse.status === 'true');
        } else {
          setAllowed(serverResponse.allowed && serverResponse.status === 'true');
        }
      } catch (error) {
        console.error('Error during device validation:', error);
        const currentId = await getDeviceId();
        const isCached = await DeviceValidationService.isDeviceValidated(currentId);
        setAllowed(isCached);
      } finally {
        setReady(true);
        setValidating(false);
      }
    })();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      validating,
      allowed,
      showRestore,
      setShowRestore,
      setAllowed,
      logout: async () => {
        await StorageService.removeMultiple([
          AUTH_STORAGE_KEYS.AUTH_TOKEN,
          AUTH_STORAGE_KEYS.USER_DATA,
          AUTH_STORAGE_KEYS.AUTHENTICATION_ID,
          AUTH_STORAGE_KEYS.DEVICE_ID,
          AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID,
        ]);
        setAllowed(false);
        setShowRestore(false);
      },
    }),
    [ready, validating, allowed, showRestore]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
