import React, { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, FONTS } from '../theme';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../App';
import { useNavigation } from '@react-navigation/native';

export default function SignUpScreen() {
  const { signUp } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    if (!email.trim() || !password || !confirmPassword) {
      Alert.alert('Missing fields', 'Please fill in all fields.');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Passwords do not match', 'Please make sure your passwords match.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Password too short', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { error } = await signUp(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) {
      Alert.alert('Sign up failed', error.message);
    }
    // On success, session is created immediately (email confirmation OFF per locked decision)
    // onAuthStateChange fires -> session updates -> App.tsx re-renders to onboarding/Home
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.title}>BolusBrain</Text>
        <Text style={styles.subtitle}>Create your account</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={COLORS.textMuted}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="At least 6 characters"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
        />

        <Text style={styles.label}>Confirm password</Text>
        <TextInput
          style={styles.input}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="Re-enter your password"
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry
          textContentType="newPassword"
          autoComplete="new-password"
        />

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignUp}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Creating account...' : 'Create account'}
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={styles.linkRow}>
          <Text style={styles.linkText}>Already have an account? </Text>
          <Text style={[styles.linkText, { color: COLORS.green }]}>Sign in</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 32,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  label: {
    fontSize: 13,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    marginBottom: 6,
    marginLeft: 4,
  },
  input: {
    fontSize: 17,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#000',
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  linkText: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
  },
});
