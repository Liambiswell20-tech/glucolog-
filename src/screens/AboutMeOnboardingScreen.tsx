import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import { saveUserProfile } from '../services/storage';
import type { UserProfile } from '../types/equipment';
import type { RootStackParamList } from '../../App';

// ─── Picker options ──────────────────────────────────────────────────────────

const AGE_RANGES = ['0-18', '18-25', '26-35', '36-45', '46-55', '56-65', '65+'];
const GENDERS = ['Male', 'Female', 'Non-binary', 'Prefer not to say'];
const T1D_DURATIONS = ['<1 year', '1-5 years', '5-10 years', '10-20 years', '20+'];

// ─── Types ───────────────────────────────────────────────────────────────────

type ActivePicker = 'age' | 'gender' | 't1d' | null;

// ─── Sub-components ──────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  placeholder,
  onPress,
  optional,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
  optional?: boolean;
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optionalTag}> (Optional)</Text> : null}
      </Text>
      <Pressable style={styles.fieldRow} onPress={onPress}>
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>
          {value ?? placeholder}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function AboutMeOnboardingScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList, 'AboutMeOnboarding'>>();

  const [ageRange, setAgeRange] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [t1dDuration, setT1dDuration] = useState<string | null>(null);
  const [hba1c, setHba1c] = useState('');
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [saving, setSaving] = useState(false);

  const canContinue = ageRange !== null && gender !== null;

  function getOptionsForPicker(): string[] {
    switch (activePicker) {
      case 'age': return AGE_RANGES;
      case 'gender': return GENDERS;
      case 't1d': return T1D_DURATIONS;
      default: return [];
    }
  }

  function handlePickerSelect(option: string) {
    switch (activePicker) {
      case 'age':
        setAgeRange(option);
        break;
      case 'gender':
        setGender(option);
        break;
      case 't1d':
        setT1dDuration(option);
        break;
    }
    setActivePicker(null);
  }

  async function handleContinue() {
    if (!ageRange || !gender) return;
    setSaving(true);
    try {
      const profile: UserProfile = {
        age_range: ageRange,
        gender: gender,
        ...(t1dDuration ? { t1d_duration: t1dDuration } : {}),
        ...(hba1c.trim() ? { hba1c_mmol_mol: parseFloat(hba1c) } : {}),
        completed_at: new Date().toISOString(),
      };
      await saveUserProfile(profile);
      await AsyncStorage.setItem('about_me_completed', 'true');
      navigation.replace('EquipmentOnboarding');
    } catch {
      // Non-fatal — allow retry
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <Text style={styles.title}>About you</Text>
        <Text style={styles.subtitle}>
          This helps us understand how different people manage their diabetes.
        </Text>

        {/* Age range — mandatory */}
        <FieldRow
          label="Age range"
          value={ageRange}
          placeholder="Select your age range"
          onPress={() => setActivePicker('age')}
        />

        {/* Gender — mandatory */}
        <FieldRow
          label="Gender"
          value={gender}
          placeholder="Select your gender"
          onPress={() => setActivePicker('gender')}
        />

        {/* T1D duration — optional */}
        <FieldRow
          label="T1D duration"
          value={t1dDuration}
          placeholder="Select how long you've had T1D"
          onPress={() => setActivePicker('t1d')}
          optional
        />

        {/* HbA1c — optional free input */}
        <View style={styles.fieldWrapper}>
          <Text style={styles.fieldLabel}>
            HbA1c (mmol/mol)
            <Text style={styles.optionalTag}> (Optional)</Text>
          </Text>
          <TextInput
            style={styles.textInput}
            value={hba1c}
            onChangeText={setHba1c}
            keyboardType="decimal-pad"
            placeholder="e.g. 53"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>

        {/* Continue button */}
        <Pressable
          style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
          onPress={handleContinue}
          disabled={!canContinue || saving}
        >
          {saving ? (
            <ActivityIndicator color="#000" />
          ) : (
            <Text style={styles.continueBtnText}>Continue</Text>
          )}
        </Pressable>
      </ScrollView>

      {/* Picker modal */}
      <Modal
        visible={activePicker !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setActivePicker(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <FlatList
              data={getOptionsForPicker()}
              keyExtractor={(item) => item}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalOption}
                  onPress={() => handlePickerSelect(item)}
                >
                  <Text style={styles.modalOptionText}>{item}</Text>
                </Pressable>
              )}
              ItemSeparatorComponent={() => <View style={styles.optionDivider} />}
            />
            <Pressable
              style={styles.modalCancel}
              onPress={() => setActivePicker(null)}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  },
  title: {
    fontSize: 28,
    fontFamily: FONTS.semiBold,
    color: COLORS.text,
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: FONTS.regular,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 32,
  },
  // Field rows
  fieldWrapper: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginLeft: 4,
  },
  optionalTag: {
    color: COLORS.textMuted,
    textTransform: 'none',
    fontWeight: '400',
    letterSpacing: 0,
  },
  fieldRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  fieldValue: {
    fontSize: 17,
    color: COLORS.text,
    flex: 1,
  },
  fieldPlaceholder: {
    color: COLORS.textMuted,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.textMuted,
    marginLeft: 8,
  },
  textInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    color: COLORS.text,
  },
  // Continue button
  continueBtn: {
    backgroundColor: COLORS.green,
    borderRadius: 14,
    padding: 18,
    alignItems: 'center',
    marginTop: 32,
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    color: '#000',
    fontSize: 17,
    fontWeight: '700',
  },
  // Picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.separator,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  modalOption: {
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  modalOptionText: {
    fontSize: 17,
    color: COLORS.text,
  },
  optionDivider: {
    height: 1,
    backgroundColor: COLORS.separator,
    marginLeft: 24,
  },
  modalCancel: {
    marginTop: 8,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 17,
    color: COLORS.red,
    fontWeight: '600',
  },
});
