import React from 'react';
import {
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import type { DataConsent } from '../types/equipment';
import type { RootStackParamList } from '../../App';

const CURRENT_CONSENT_VERSION = '1.0';

const SHARED_DATA_POINTS = [
  'Meal and glucose patterns (anonymised)',
  'Equipment usage trends',
  'Time-in-range statistics',
];

export default function DataSharingOnboardingScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'DataSharingOnboarding'>>();

  async function handleAccept() {
    const consent: DataConsent = {
      consented: true,
      consented_at: new Date().toISOString(),
      version: CURRENT_CONSENT_VERSION,
    };
    await AsyncStorage.setItem('data_consent', JSON.stringify(consent));
    await AsyncStorage.setItem('data_sharing_onboarding_completed', 'true');
    navigation.replace('AboutMeOnboarding');
  }

  async function handleDecline() {
    const consent: DataConsent = {
      consented: false,
      version: CURRENT_CONSENT_VERSION,
    };
    await AsyncStorage.setItem('data_consent', JSON.stringify(consent));
    await AsyncStorage.setItem('data_sharing_onboarding_completed', 'true');
    navigation.replace('AboutMeOnboarding');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text style={styles.title}>Help improve diabetes care</Text>

        {/* Body text */}
        <Text style={styles.body}>
          BolusBrain can share your fully anonymised usage data to help improve
          diabetes management tools and contribute to T1D research. No personal
          information is shared.
        </Text>

        {/* Bullet points */}
        <View style={styles.bulletList}>
          {SHARED_DATA_POINTS.map((point) => (
            <View key={point} style={styles.bulletRow}>
              <View style={styles.bulletDot} />
              <Text style={styles.bulletText}>{point}</Text>
            </View>
          ))}
        </View>

        {/* Settings note */}
        <Text style={styles.note}>
          You can change this at any time in Settings.
        </Text>

        {/* Spacer to push buttons towards bottom */}
        <View style={styles.spacer} />

        {/* Accept button */}
        <Pressable style={styles.acceptBtn} onPress={handleAccept}>
          <Text style={styles.acceptBtnText}>Accept</Text>
        </Pressable>

        {/* Decline button */}
        <Pressable style={styles.declineBtn} onPress={handleDecline}>
          <Text style={styles.declineBtnText}>Decline</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  container: {
    padding: 24,
    paddingBottom: 48,
    flexGrow: 1,
  },
  title: {
    fontSize: 28,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginTop: 40,
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 24,
  },
  bulletList: {
    marginBottom: 24,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green,
    marginRight: 12,
  },
  bulletText: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.text,
    flex: 1,
  },
  note: {
    fontSize: 14,
    fontFamily: FONTS.regular,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  spacer: {
    flex: 1,
    minHeight: 40,
  },
  acceptBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginBottom: 12,
  },
  acceptBtnText: {
    color: '#000',
    fontSize: 17,
    fontFamily: FONTS.semiBold,
  },
  declineBtn: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  declineBtnText: {
    color: COLORS.textSecondary,
    fontSize: 15,
    fontFamily: FONTS.regular,
  },
});
