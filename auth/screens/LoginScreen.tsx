import { AuthHeader } from '@/auth/components/AuthHeader';
import { AppFooter } from '@/components/AppFooter';
import { LoadingButton } from '@/auth/components/ui/LoadingButton';
import {
  BG_PRIMARY,
  ERROR_COLOR,
  INPUT_BORDER,
  INPUT_ERROR,
  INPUT_PLACEHOLDER,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '@/auth/constants/theme';
import { useDeviceAuth } from '@/auth/hooks/useDeviceAuth';
import { useResponsive } from '@/auth/hooks/useResponsive';
import { post } from '@/auth/services/authApi';
import { AUTH_STORAGE_KEYS, StorageService } from '@/auth/utils/storage';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = { onSuccess: () => void; onRestore: () => void };

export default function LoginScreen({ onSuccess, onRestore }: Props) {
  const [email, setEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [licenseKey, setLicenseKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { deviceId, authorizeDevice } = useDeviceAuth();
  const { fontSizes, spacing, getSize, isTablet, dimensions } = useResponsive();
  const insets = useSafeAreaInsets();

  const validateForm = () => {
    let isValid = true;
    setEmailError('');
    setPasswordError('');
    if (email !== confirmEmail) {
      setEmailError('Emails do not match');
      isValid = false;
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords do not match');
      isValid = false;
    }
    if (password.length > 0 && password.length < 6) {
      setPasswordError('Password must be at least 6 characters long');
      isValid = false;
    }
    return isValid;
  };

  const handleRegister = async () => {
    if (!deviceId) return Alert.alert('Error', 'No device ID');
    if (!email || !confirmEmail || !contactNo || !password || !confirmPassword || !licenseKey) {
      return Alert.alert('Error', 'Please fill all fields');
    }
    if (!validateForm()) return;

    setBusy(true);
    try {
      const res = await post('register.php', {
        emailId: email,
        confirmEmail,
        contactNo,
        password,
        confirmPassword,
        licenseKey,
        deviceId,
        platform: 'android',
      });

      if (res.status === 'true') {
        await authorizeDevice(deviceId);
        await StorageService.setItem(AUTH_STORAGE_KEYS.AUTHENTICATION_ID, deviceId);
        Alert.alert('✅ Success', res.message || 'Device registered');
        onSuccess();
      } else {
        Alert.alert('❌ Failed', res.message || 'Try again');
      }
    } catch (err) {
      console.error('Register error:', err);
      Alert.alert('Error', 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={[s.content, { padding: spacing.md, paddingTop: Math.max(insets.top + spacing.xl, spacing.xxl) }]}>
        <View style={[s.formContainer, { maxWidth: isTablet ? 500 : dimensions.width * 0.9 }]}>
          <AuthHeader title="Register" />
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <TextInput
              placeholder="Enter your email"
              placeholderTextColor={INPUT_PLACEHOLDER}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(text) => {
                setEmail(text);
                if (emailError) setEmailError('');
              }}
              value={email}
              style={[s.inputRegular, emailError && s.inputError, { fontSize: fontSizes.body, paddingVertical: spacing.sm }]}
            />
            {emailError ? <Text style={[s.errorText, { fontSize: fontSizes.small, marginTop: spacing.xs }]}>{emailError}</Text> : null}
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <TextInput
              placeholder="Confirm your email"
              placeholderTextColor={INPUT_PLACEHOLDER}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(text) => {
                setConfirmEmail(text);
                if (emailError) setEmailError('');
              }}
              value={confirmEmail}
              style={[s.inputRegular, emailError && s.inputError, { fontSize: fontSizes.body, paddingVertical: spacing.sm }]}
            />
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <TextInput placeholder="Mobile Number" placeholderTextColor={INPUT_PLACEHOLDER} keyboardType="phone-pad" onChangeText={setContactNo} value={contactNo} style={[s.inputRegular, { fontSize: fontSizes.body, paddingVertical: spacing.sm }]} />
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <View style={s.passwordInputWrapper}>
              <TextInput
                placeholder="Enter your password"
                placeholderTextColor={INPUT_PLACEHOLDER}
                secureTextEntry={!showPassword}
                onChangeText={(text) => {
                  setPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                value={password}
                style={[s.input, passwordError && s.inputError, { fontSize: fontSizes.body, paddingVertical: spacing.sm, paddingRight: getSize(35, 40) }]}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={[s.eyeButton, { right: spacing.xs }]} activeOpacity={0.7}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={getSize(18, 20)} color={INPUT_PLACEHOLDER} />
              </TouchableOpacity>
            </View>
            {passwordError ? <Text style={[s.errorText, { fontSize: fontSizes.small, marginTop: spacing.xs }]}>{passwordError}</Text> : null}
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <View style={s.passwordInputWrapper}>
              <TextInput
                placeholder="Confirm your password"
                placeholderTextColor={INPUT_PLACEHOLDER}
                secureTextEntry={!showConfirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (passwordError) setPasswordError('');
                }}
                value={confirmPassword}
                style={[s.input, passwordError && s.inputError, { fontSize: fontSizes.body, paddingVertical: spacing.sm, paddingRight: getSize(35, 40) }]}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={[s.eyeButton, { right: spacing.xs }]} activeOpacity={0.7}>
                <Ionicons name={showConfirmPassword ? 'eye-off' : 'eye'} size={getSize(18, 20)} color={INPUT_PLACEHOLDER} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={[s.inputContainer, { marginBottom: spacing.md }]}>
            <TextInput placeholder="Enter license code" placeholderTextColor={INPUT_PLACEHOLDER} onChangeText={setLicenseKey} value={licenseKey} style={[s.inputRegular, { fontSize: fontSizes.body, paddingVertical: spacing.sm }]} />
          </View>
          <LoadingButton title="Register" onPress={handleRegister} loading={busy} fullWidth style={[s.btn, { marginTop: spacing.lg, paddingVertical: getSize(14, 16) }]} />
          <TouchableOpacity onPress={onRestore} style={[s.restoreLink, { marginTop: spacing.md }]}>
            <Text style={[s.restoreLinkText, { fontSize: fontSizes.body }]}>Restore</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ paddingBottom: insets.bottom, paddingTop: spacing.md }}>
        <AppFooter />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG_PRIMARY },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', width: '100%', paddingBottom: 20 },
  formContainer: { width: '100%' },
  inputContainer: { width: '100%' },
  input: { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: INPUT_BORDER, borderRadius: 0, paddingHorizontal: 4, color: TEXT_PRIMARY, flex: 1 },
  inputRegular: { backgroundColor: 'transparent', borderBottomWidth: 1, borderBottomColor: INPUT_BORDER, borderRadius: 0, paddingHorizontal: 4, color: TEXT_PRIMARY },
  passwordInputWrapper: { flexDirection: 'row', alignItems: 'center', position: 'relative', width: '100%' },
  eyeButton: { position: 'absolute', padding: 4, zIndex: 1 },
  inputError: { borderBottomColor: INPUT_ERROR },
  errorText: { color: ERROR_COLOR, marginLeft: 4 },
  btn: { borderRadius: 8 },
  purchaseLink: { alignItems: 'center' },
  purchaseLinkText: { color: TEXT_PRIMARY, textDecorationLine: 'underline' },
  restoreLink: { alignItems: 'center' },
  restoreLinkText: { color: TEXT_SECONDARY },
});
