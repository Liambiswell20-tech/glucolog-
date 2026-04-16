import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_ENABLED_KEY = 'bb_biometric_enabled';

/**
 * Check if user has opted in to biometric unlock.
 * Stored in expo-secure-store (not AsyncStorage) because it gates access to health data.
 */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(BIOMETRIC_ENABLED_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

/**
 * Set biometric enabled flag. Called after first successful email+password login
 * if the device has biometric hardware and the user has enrolled.
 */
export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(BIOMETRIC_ENABLED_KEY, 'true');
  } else {
    await SecureStore.deleteItemAsync(BIOMETRIC_ENABLED_KEY);
  }
}

/**
 * Check if the device supports biometric auth AND the user has enrolled
 * (i.e., has set up Face ID / fingerprint / Touch ID).
 */
export async function canUseBiometric(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return false;
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    return isEnrolled;
  } catch {
    return false;
  }
}

/**
 * Prompt the user for biometric authentication.
 * Returns true if authentication succeeded, false otherwise.
 * Handles all edge cases: no hardware, not enrolled, user cancel, system error.
 */
export async function promptBiometric(reason: string = 'Unlock BolusBrain'): Promise<boolean> {
  try {
    const available = await canUseBiometric();
    if (!available) return false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Use password',
      disableDeviceFallback: false, // allow device PIN/passcode fallback
    });

    return result.success;
  } catch {
    // Any exception = treat as failed, fall back to password
    return false;
  }
}

/**
 * Hook-style convenience: after first login, auto-enable biometric
 * if the device supports it. Returns utilities for the auth flow.
 */
export function useBiometric() {
  return {
    promptBiometric,
    canUseBiometric,
    isBiometricEnabled,
    setBiometricEnabled,
  };
}
