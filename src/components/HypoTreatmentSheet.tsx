import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { COLORS, FONTS } from '../theme';
import type { HypoTreatmentSheetProps } from './types';
import type { HypoTreatment } from '../types/equipment';

const TREATMENT_TYPES = ['Glucose tablets', 'Juice', 'Sweets', 'Gel', 'Other'] as const;
const AMOUNT_UNITS: Array<'tablets' | 'ml' | 'g' | 'food'> = ['tablets', 'ml', 'g', 'food'];

export default function HypoTreatmentSheet({
  visible,
  currentGlucose,
  onClose,
  onSave,
}: HypoTreatmentSheetProps) {
  const [treatmentType, setTreatmentType] = useState<string>('Glucose tablets');
  const [customType, setCustomType] = useState('');
  const [brand, setBrand] = useState('');
  const [amountValue, setAmountValue] = useState('');
  const [amountUnit, setAmountUnit] = useState<'tablets' | 'ml' | 'g' | 'food'>('tablets');
  const [notes, setNotes] = useState('');

  function handleClose() {
    // Reset state on close
    setTreatmentType('Glucose tablets');
    setCustomType('');
    setBrand('');
    setAmountValue('');
    setAmountUnit('tablets');
    setNotes('');
    onClose();
  }

  const effectiveType = customType.trim() || treatmentType;
  const saveDisabled = !effectiveType;

  function handleSave() {
    if (!effectiveType) return;
    const parsedAmount = parseFloat(amountValue);
    const trimmedNotes = notes.trim();
    const trimmedBrand = brand.trim();
    onSave({
      glucose_at_event: currentGlucose ?? 0,
      treatment_type: effectiveType,
      ...(trimmedBrand ? { brand: trimmedBrand } : {}),
      ...(amountValue.trim() && !isNaN(parsedAmount) ? { amount_value: parsedAmount, amount_unit: amountUnit } : {}),
      ...(trimmedNotes ? { notes: trimmedNotes } : {}),
    });
    // Reset all state
    setTreatmentType('Glucose tablets');
    setCustomType('');
    setBrand('');
    setAmountValue('');
    setAmountUnit('tablets');
    setNotes('');
  }

  return (
    <Modal
      animationType="slide"
      transparent
      visible={visible}
      onRequestClose={handleClose}
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose} />

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.sheetWrapper}
      >
        <View style={styles.sheet}>
          {/* Handle bar */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.title}>Treating a low?</Text>

          {/* 1. Current glucose — read-only */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>CURRENT GLUCOSE</Text>
            <View style={styles.glucoseDisplay}>
              <Text style={styles.glucoseValue}>
                {currentGlucose != null
                  ? `${currentGlucose.toFixed(1)} mmol/L`
                  : 'No reading'}
              </Text>
            </View>
          </View>

          {/* 2. Treatment type picker + free text */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>TREATMENT TYPE</Text>
            <View style={styles.chipRow}>
              {TREATMENT_TYPES.map(type => (
                <Pressable
                  key={type}
                  style={[styles.chip, treatmentType === type && !customType.trim() && styles.chipActive]}
                  onPress={() => {
                    setCustomType('');
                    setTreatmentType(type);
                    // Auto-set sensible default unit for each treatment type
                    const unitMap: Record<string, 'tablets' | 'ml' | 'g' | 'food'> = {
                      'Glucose tablets': 'tablets',
                      'Juice': 'ml',
                      'Sweets': 'food',
                      'Gel': 'food',
                      'Other': 'food',
                    };
                    setAmountUnit(unitMap[type] ?? 'food');
                  }}
                >
                  <Text style={[styles.chipText, treatmentType === type && !customType.trim() && styles.chipTextActive]}>
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.freeTextInput}
              placeholder="Or type what you had..."
              placeholderTextColor={COLORS.textMuted}
              value={customType}
              onChangeText={(text) => {
                setCustomType(text);
                if (text.trim()) setTreatmentType('');  // deselect preset when typing
              }}
              returnKeyType="next"
            />
          </View>

          {/* 3. Brand (optional) — only when preset is selected */}
          {treatmentType !== '' && (
            <View style={styles.section}>
              <Text style={styles.fieldLabel}>BRAND (OPTIONAL)</Text>
              <TextInput
                style={styles.freeTextInput}
                placeholder="e.g. Lucozade, Dextro Energy..."
                placeholderTextColor={COLORS.textMuted}
                value={brand}
                onChangeText={setBrand}
                returnKeyType="next"
              />
            </View>
          )}

          {/* 4. Amount row — optional, value input + unit picker chips */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>AMOUNT (OPTIONAL)</Text>
            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="0"
                placeholderTextColor={COLORS.textMuted}
                value={amountValue}
                onChangeText={setAmountValue}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
              <View style={styles.unitChipRow}>
                {AMOUNT_UNITS.map(unit => (
                  <Pressable
                    key={unit}
                    style={[styles.unitChip, amountUnit === unit && styles.chipActive]}
                    onPress={() => setAmountUnit(unit)}
                  >
                    <Text style={[styles.chipText, amountUnit === unit && styles.chipTextActive]}>
                      {unit}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          {/* 5. What did you have? — optional free text notes */}
          <View style={styles.section}>
            <Text style={styles.fieldLabel}>NOTES</Text>
            <TextInput
              style={styles.notesInput}
              placeholder="Any other details..."
              placeholderTextColor={COLORS.textMuted}
              value={notes}
              onChangeText={setNotes}
              returnKeyType="done"
            />
          </View>

          {/* 6. Save / Cancel buttons */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.cancelBtn} onPress={handleClose}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, saveDisabled && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={saveDisabled}
            >
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetWrapper: {
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: '#48484A',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 24,
    fontFamily: FONTS.semiBold,
  },
  section: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontFamily: FONTS.semiBold,
    marginBottom: 8,
  },
  glucoseDisplay: {
    backgroundColor: COLORS.surfaceRaised,
    borderRadius: 12,
    padding: 14,
  },
  glucoseValue: {
    fontSize: 17,
    color: COLORS.text,
    fontFamily: FONTS.mono,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: {
    borderColor: COLORS.red,
    backgroundColor: COLORS.surfaceRaised,
  },
  chipText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    fontFamily: FONTS.regular,
  },
  chipTextActive: {
    color: COLORS.red,
    fontFamily: FONTS.semiBold,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  freeTextInput: {
    backgroundColor: COLORS.surfaceRaised,
    color: COLORS.text,
    fontSize: 15,
    padding: 14,
    borderRadius: 12,
    fontFamily: FONTS.regular,
  },
  notesInput: {
    backgroundColor: COLORS.surfaceRaised,
    color: COLORS.text,
    fontSize: 15,
    padding: 14,
    borderRadius: 12,
    fontFamily: FONTS.regular,
  },
  amountInput: {
    flex: 1,
    backgroundColor: COLORS.surfaceRaised,
    color: COLORS.text,
    fontSize: 17,
    padding: 14,
    borderRadius: 12,
    fontFamily: FONTS.regular,
  },
  unitChipRow: {
    flexDirection: 'row',
    gap: 6,
  },
  unitChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceRaised,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    backgroundColor: COLORS.surfaceRaised,
  },
  cancelBtnText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: FONTS.semiBold,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    backgroundColor: COLORS.red,
  },
  saveBtnDisabled: {
    opacity: 0.4,
  },
  saveBtnText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: FONTS.semiBold,
  },
});
