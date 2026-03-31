import {
  FontSizes,
  LockScreenSizes,
  Spacing,
  getHeightPercentage,
  getResponsiveSize,
  getWidthPercentage,
  isLargeScreen,
  isSmallScreen,
  isTablet,
  scaleByHeight,
  scaleByWidth,
} from '@/auth/utils/responsive';
import { useMemo, useSyncExternalStore } from 'react';
import { Dimensions } from 'react-native';

export function useResponsive() {
  const dimensions = useSyncExternalStore(
    (onStoreChange) => {
      const subscription = Dimensions.addEventListener('change', () => onStoreChange());
      return () => subscription?.remove();
    },
    () => Dimensions.get('window'),
    () => Dimensions.get('window')
  );

  return useMemo(
    () => ({
      isSmallScreen,
      isTablet,
      isLargeScreen,
      dimensions: { width: dimensions.width, height: dimensions.height },
      fontSizes: FontSizes,
      spacing: Spacing,
      lockScreenSizes: LockScreenSizes,
      getSize: getResponsiveSize,
      getWidthPercentage,
      getHeightPercentage,
      scaleByWidth,
      scaleByHeight,
    }),
    [dimensions]
  );
}
