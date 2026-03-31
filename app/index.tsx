import { useAuth } from '@/auth/hooks/useAuth';
import LoginScreen from '@/auth/screens/LoginScreen';
import RestoreScreen from '@/auth/screens/RestoreScreen';
import { DeviceValidationService } from '@/auth/services/deviceValidationService';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function Index() {
  const { ready, validating, allowed, showRestore, setShowRestore, setAllowed } = useAuth();

  if (!ready || validating) {
    return (
      <View style={styles.splashContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  if (!allowed && !showRestore) {
    return <LoginScreen onSuccess={() => setAllowed(true)} onRestore={() => setShowRestore(true)} />;
  }

  if (showRestore && !allowed) {
    return (
      <RestoreScreen
        onSuccess={async (deviceId: string) => {
          const response = await DeviceValidationService.validateDevice(deviceId);
          if (response.allowed) setAllowed(true);
        }}
        onCancel={() => setShowRestore(false)}
      />
    );
  }

  return <Redirect href="/notes" />;
}

const styles = StyleSheet.create({
  splashContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
