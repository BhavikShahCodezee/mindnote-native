import {
  BUTTON_DANGER,
  BUTTON_GHOST_TEXT,
  BUTTON_PRIMARY,
  BUTTON_PRIMARY_TEXT,
  BUTTON_SECONDARY,
} from '@/auth/constants/theme';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, TouchableOpacityProps, ViewStyle } from 'react-native';

export interface ButtonProps extends Omit<TouchableOpacityProps, 'style'> {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'small' | 'medium' | 'large';
  fullWidth?: boolean;
  style?: ViewStyle | ViewStyle[];
}

export function Button({ title, variant = 'primary', size = 'medium', fullWidth = false, style, disabled, ...props }: ButtonProps) {
  const buttonStyle = [styles.button, styles[variant], styles[`size_${size}`], fullWidth && styles.fullWidth, disabled && styles.disabled, style];
  const textStyle = [styles.text, styles[`text_${variant}`], disabled && styles.textDisabled];
  return (
    <TouchableOpacity style={buttonStyle} disabled={disabled} activeOpacity={0.7} {...props}>
      <Text style={textStyle}>{title}</Text>
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
});
