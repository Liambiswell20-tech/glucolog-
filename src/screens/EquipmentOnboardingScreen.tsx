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
  View,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useNavigation } from '@react-navigation/native';
import { COLORS, FONTS } from '../theme';
import { changeEquipment } from '../utils/equipmentProfile';
import type { RootStackParamList } from '../../App';

// ─── Picker options (verbatim from CONTEXT.md) ────────────────────────────────

const RAPID_OPTIONS = ['NovoRapid', 'Humalog', 'Fiasp', 'Apidra', 'Lyumjev', 'Other'];
const LONG_ACTING_OPTIONS = [
  'Lantus',
  'Levemir',
  'Tresiba',
  'Toujeo',
  'Abasaglar',
  'Other',
  "I don't take long-acting insulin",
];
const DELIVERY_OPTIONS = ['Disposable pen', 'Reusable pen', 'Insulin pump', 'Syringe & vial'];
const CGM_OPTIONS = [
  'FreeStyle Libre 2',
  'FreeStyle Libre 3',
  'Dexcom G7',
  'Dexcom ONE',
  'Medtronic Guardian',
  'Other',
];
const PEN_NEEDLE_OPTIONS = ['BD Micro-Fine', 'Unifine Pentips', 'NovoFine', 'GlucoRx', 'Other', 'Skip'];

const PEN_DELIVERY_METHODS = ['Disposable pen', 'Reusable pen'];

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivePicker =
  | 'rapidInsulin'
  | 'longActingInsulin'
  | 'deliveryMethod'
  | 'cgmDevice'
  | 'penNeedle'
  | null;

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldRow({
  label,
  value,
  placeholder,
  onPress,
}: {
  label: string;
  value: string | null;
  placeholder: string;
  onPress: () => void;
}) {
  return (
    <View style={styles.fieldWrapper}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable style={styles.fieldRow} onPress={onPress}>
        <Text style={[styles.fieldValue, !value && styles.fieldPlaceholder]}>
          {value ?? placeholder}
        </Text>
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function EquipmentOnboardingScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList, 'EquipmentOnboarding'>>();

  const [rapidInsulin, setRapidInsulin] = useState<string | null>(null);
  const [longActingInsulin, setLongActingInsulin] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string | null>(null);
  const [cgmDevice, setCgmDevice] = useState<string | null>(null);
  const [penNeedle, setPenNeedle] = useState<string | null>(null);

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);
  const [saving, setSaving] = useState(false);

  const showPenNeedle =
    deliveryMethod !== null && PEN_DELIVERY_METHODS.includes(deliveryMethod);

  const canContinue =
    rapidInsulin !== null &&
    longActingInsulin !== null &&
    deliveryMethod !== null &&
    cgmDevice !== null;

  function getOptionsForPicker(): string[] {
    switch (activePicker) {
      case 'rapidInsulin': return RAPID_OPTIONS;
      case 'longActingInsulin': return LONG_ACTING_OPTIONS;
      case 'deliveryMethod': return DELIVERY_OPTIONS;
      case 'cgmDevice': return CGM_OPTIONS;
      case 'penNeedle': return PEN_NEEDLE_OPTIONS;
      default: return [];
    }
  }

  function handlePickerSelect(option: string) {
    switch (activePicker) {
      case 'rapidInsulin':
        setRapidInsulin(option);
        break;
      case 'longActingInsulin':
        setLongActingInsulin(option);
        break;
      case 'deliveryMethod':
        setDeliveryMethod(option);
        // Reset pen needle if user switched away from pen type
        if (!PEN_DELIVERY_METHODS.includes(option)) {
          setPenNeedle(null);
        }
        break;
      case 'cgmDevice':
        setCgmDevice(option);
        break;
      case 'penNeedle':
        setPenNeedle(option);
        break;
    }
    setActivePicker(null);
  }

  async function handleContinue() {
    if (!canContinue) return;
    setSaving(true);
    try {
      await changeEquipment('rapid_insulin_brand', rapidInsulin!);
      // Long-acting: store NO_LONG_ACTING sentinel for opt-out
      const longActingValue =
        longActingInsulin === "I don't take long-acting insulin"
          ? 'NO_LONG_ACTING'
          : longActingInsulin!;
      await changeEquipment('long_acting_insulin_brand', longActingValue);
      await changeEquipment('delivery_method', deliveryMethod!);
      await changeEquipment('cgm_device', cgmDevice!);
      // Pen needle: only save if selected and not 'Skip'
      if (penNeedle !== null && penNeedle !== 'Skip') {
        await changeEquipment('pen_needle_brand', penNeedle);
      }
      navigation.replace('Home');
    } catch (err) {
      console.error('[EquipmentOnboarding] save failed', err);
      // Rethrow handled by outer catch — saving state reset in finally
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
        <Text style={styles.title}>Set up your equipment</Text>
        <Text style={styles.subtitle}>
          This helps us understand your data accurately.{'\n'}You can update this later in Settings.
        </Text>

        {/* Rapid-acting insulin */}
        <FieldRow
          label="Rapid-acting insulin"
          value={rapidInsulin}
          placeholder="Select your rapid-acting insulin"
          onPress={() => setActivePicker('rapidInsulin')}
        />

        {/* Long-acting insulin */}
        <FieldRow
          label="Long-acting insulin"
          value={longActingInsulin}
          placeholder="Select your long-acting insulin"
          onPress={() => setActivePicker('longActingInsulin')}
        />

        {/* Delivery method */}
        <FieldRow
          label="Delivery method"
          value={deliveryMethod}
          placeholder="Select how you take insulin"
          onPress={() => setActivePicker('deliveryMethod')}
        />

        {/* CGM device */}
        <FieldRow
          label="CGM device"
          value={cgmDevice}
          placeholder="Select your CGM device"
          onPress={() => setActivePicker('cgmDevice')}
        />

        {/* Pen needle (conditional) */}
        {showPenNeedle && (
          <FieldRow
            label="Pen needle brand (optional)"
            value={penNeedle}
            placeholder="Select pen needle brand"
            onPress={() => setActivePicker('penNeedle')}
          />
        )}

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

        <Text style={styles.disclaimer}>
          BolusBrain does not give medical advice. All data is stored locally on your device.
        </Text>
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
              keyExtractor={item => item}
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
    fontWeight: '700',
    color: COLORS.text,
    fontFamily: FONTS.semiBold,
    marginTop: 20,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    lineHeight: 22,
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
  disclaimer: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
    paddingHorizontal: 8,
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
