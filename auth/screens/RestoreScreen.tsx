import { AuthHeader } from '@/auth/components/AuthHeader';
import { LoadingButton } from '@/auth/components/ui/LoadingButton';
import { BG_PRIMARY, INPUT_BORDER, INPUT_PLACEHOLDER, TEXT_PRIMARY } from '@/auth/constants/theme';
import { useResponsive } from '@/auth/hooks/useResponsive';
import { post } from '@/auth/services/authApi';
import { getDeviceId } from '@/auth/utils/device';
import { AUTH_STORAGE_KEYS, StorageService } from '@/auth/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { onSuccess: (deviceId: string) => void; onCancel: () => void };

export default function RestoreScreen({ onSuccess, onCancel }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { fontSizes, spacing, getSize, isTablet, dimensions } = useResponsive();
  const insets = useSafeAreaInsets();

  const handleRestore = async () => {
    if (!email.trim()) return Alert.alert('Error', 'Please enter your registered email');
    if (!password.trim()) return Alert.alert('Error', 'Please enter your password');

    setBusy(true);
    try {
      const currentDeviceId = await getDeviceId();
      const res = await post('restore_purchase.php', {
        emailId: email.trim(),
        password: password.trim(),
        deviceId: currentDeviceId,
        platform: 'android',
      });

      if (res.status === 'true' && (res.code === 'match' || res.code === 'added')) {
        await StorageService.setItem(AUTH_STORAGE_KEYS.ALLOWED_DEVICE_ID, res.deviceId);
        await StorageService.setItem(AUTH_STORAGE_KEYS.AUTHENTICATION_ID, res.deviceId);
        Alert.alert('✅ Success', res.message || 'Your device has been reactivated!');
        onSuccess(res.deviceId);
        return;
      }
      if (res.code === 'mismatch') {
        Alert.alert('⚠️ Not Allowed', 'This email is already linked to another device. Please contact the administrator.');
        return;
      }
      if (res.code === 'invalid_password') return Alert.alert('❌ Failed', 'Invalid password');
      if (res.code === 'not_verified') return Alert.alert('❌ Failed', 'Account not verified');
      if (res.code === 'platform_mismatch') return Alert.alert('❌ Failed', res.message || 'Platform mismatch');
      Alert.alert('❌ Failed', res.message || 'Email not found or not verified');
    } catch (err) {
      console.error('restore error:', err);
      Alert.alert('Error', 'Something went wrong while restoring your purchase');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={[s.content, { padding: spacing.md, paddingTop: Math.max(insets.top + spacing.xl, spacing.xxl) }]}>
        <View style={[s.formContainer, { maxWidth: isTablet ? 500 : dimensions.width * 0.9 }]}>
          <AuthHeader title="Login" />
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <TextInput placeholder="Enter your registered email" placeholderTextColor={INPUT_PLACEHOLDER} autoCapitalize="none" keyboardType="email-address" onChangeText={setEmail} value={email} style={[s.inputRegular, { fontSize: fontSizes.body, paddingVertical: spacing.sm }]} />
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <View style={s.passwordInputWrapper}>
              <TextInput placeholder="Enter your password" placeholderTextColor={INPUT_PLACEHOLDER} secureTextEntry={!showPassword} onChangeText={setPassword} value={password} style={[s.input, { fontSize: fontSizes.body, paddingVertical: spacing.sm, paddingRight: getSize(35, 40) }]} autoCapitalize="none" />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={[s.eyeButton, { right: spacing.xs }]} activeOpacity={0.7}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={getSize(18, 20)} color={INPUT_PLACEHOLDER} />
              </TouchableOpacity>
            </View>
          </View>
          <LoadingButton title="Restore" onPress={handleRestore} loading={busy} fullWidth style={[s.btn, { marginTop: spacing.lg, paddingVertical: getSize(14, 16) }]} />
          <LoadingButton title="Register" variant="ghost" onPress={onCancel} fullWidth style={[s.cancel, { marginTop: spacing.md }]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_PRIMARY },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%' },
  formContainer: { width: '100%' },
  inputContainer: { width: '100%' },
  input: { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: INPUT_BORDER, borderRadius: 0, paddingHorizontal: 4, color: TEXT_PRIMARY, flex: 1 },
  inputRegular: { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: INPUT_BORDER, borderRadius: 0, paddingHorizontal: 4, color: TEXT_PRIMARY },
  passwordInputWrapper: { flexDirection: 'row', alignItems: 'center', position: 'relative', width: '100%' },
  eyeButton: { position: 'absolute', padding: 4, zIndex: 1 },
  btn: { borderRadius: 8 },
  cancel: { marginTop: 8 },
});
