import { Dimensions } from 'react-native';

const { width, height } = Dimensions.get('window');

export const isSmallScreen = height < 700;
export const isTablet = width >= 768;
export const isLargeScreen = height >= 900;

export function getResponsiveSize(small: number, large: number): number {
  if (isTablet) return large * 1.2;
  return isSmallScreen ? small : large;
}

export function getWidthPercentage(percentage: number): number {
  return (width * percentage) / 100;
}

export function getHeightPercentage(percentage: number): number {
  return (height * percentage) / 100;
}

export function scaleByWidth(size: number, referenceWidth: number = 375): number {
  return (width / referenceWidth) * size;
}

export function scaleByHeight(size: number, referenceHeight: number = 812): number {
  return (height / referenceHeight) * size;
}

export const FontSizes = {
  title: getResponsiveSize(18, 24),
  body: getResponsiveSize(14, 16),
  small: getResponsiveSize(12, 14),
} as const;

export const Spacing = {
  xs: getResponsiveSize(4, 6),
  sm: getResponsiveSize(8, 12),
  md: getResponsiveSize(12, 16),
  lg: getResponsiveSize(16, 24),
  xl: getResponsiveSize(24, 32),
  xxl: getResponsiveSize(32, 48),
} as const;

export const LockScreenSizes = {} as const;
