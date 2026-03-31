import {
  BUTTON_DANGER,
  BUTTON_GHOST_TEXT,
  BUTTON_PRIMARY,
  BUTTON_PRIMARY_TEXT,
  BUTTON_SECONDARY,
} from '@/auth/constants/theme';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ButtonProps } from './Button';

interface LoadingButtonProps extends Omit<ButtonProps, 'title'> {
  title: string;
  loading?: boolean;
  loadingText?: string;
}

export function LoadingButton({ title, loading = false, loadingText, disabled, variant = 'primary', size = 'medium', fullWidth = false, style, ...props }: LoadingButtonProps) {
  const buttonStyle = [styles.button, styles[variant], styles[`size_${size}`], fullWidth && styles.fullWidth, (disabled || loading) && styles.disabled, style];
  const textStyle = [styles.text, styles[`text_${variant}`], (disabled || loading) && styles.textDisabled];
  return (
    <TouchableOpacity style={buttonStyle} disabled={disabled || loading} activeOpacity={0.7} {...props}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={BUTTON_PRIMARY_TEXT} size="small" style={styles.loader} />
          <Text style={textStyle}>{loadingText || title}</Text>
        </View>
      ) : (
        <Text style={textStyle}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: { borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: BUTTON_PRIMARY },
  secondary: { backgroundColor: BUTTON_SECONDARY },
  danger: { backgroundColor: BUTTON_DANGER },
  ghost: { backgroundColor: 'transparent' },
  size_small: { paddingVertical: 8, paddingHorizontal: 16 },
  size_medium: { paddingVertical: 14, paddingHorizontal: 24 },
  size_large: { paddingVertical: 18, paddingHorizontal: 32 },
  fullWidth: { width: '100%' },
  disabled: { opacity: 0.5 },
  text: { fontWeight: '600', color: BUTTON_PRIMARY_TEXT },
  text_primary: { color: BUTTON_PRIMARY_TEXT },
  text_secondary: { color: BUTTON_PRIMARY_TEXT },
  text_danger: { color: BUTTON_PRIMARY_TEXT },
  text_ghost: { color: BUTTON_GHOST_TEXT },
  textDisabled: { opacity: 0.7 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  loader: { marginRight: 8 },
});
