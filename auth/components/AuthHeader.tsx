import { PRIMARY_COLOR, TEXT_PRIMARY } from '@/auth/constants/theme';
import { useResponsive } from '@/auth/hooks/useResponsive';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

type Props = { title: string };

export function AuthHeader({ title }: Props) {
  const { fontSizes, spacing, getSize } = useResponsive();
  return (
    <>
      <View style={[styles.logoContainer, { marginTop: spacing.xxl, marginBottom: spacing.xl }]}>
        <Text style={[styles.logo, { fontSize: getSize(36, 48), letterSpacing: getSize(1.5, 2) }]}>Mind-Note</Text>
      </View>
      <Text style={[styles.title, { fontSize: fontSizes.title, marginBottom: spacing.lg }]}>{title}</Text>
    </>
  );
}

const styles = StyleSheet.create({
  logoContainer: { alignItems: 'center' },
  logo: { color: TEXT_PRIMARY, fontWeight: '700', fontFamily: 'sans-serif' },
  title: { color: PRIMARY_COLOR, fontWeight: '600', textAlign: 'center' },
});
