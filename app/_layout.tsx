import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAutoConnect } from '@/src/hooks/useAutoConnect';
import { usePrinterStore } from '@/src/store/usePrinterStore';

/** Bootstraps BLE auto-connect and loads persisted dark mode preference. */
function AppInitializer() {
  useAutoConnect();
  const loadDarkMode = usePrinterStore((s) => s.loadDarkMode);
  useEffect(() => {
    loadDarkMode();
  }, [loadDarkMode]);
  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [loaded] = useFonts({
    Excalifont: require('../assets/fonts/Excalifont-Regular.ttf'),
    ShadowsIntoLight: require('../assets/fonts/ShadowsIntoLight-Regular.ttf'),
    QEDaveMergens: require('../assets/fonts/QEDaveMergens.ttf'),
    QETonyFlores: require('../assets/fonts/QETonyFlores.ttf'),
  });

  if (!loaded) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AppInitializer />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="notes" />
        <Stack.Screen name="note-editor" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="printer" />
        <Stack.Screen name="driver" />
        <Stack.Screen name="driver-run" />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
