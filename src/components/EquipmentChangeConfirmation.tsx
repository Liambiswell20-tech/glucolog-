import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS } from '../theme';

interface EquipmentChangeConfirmationProps {
  visible: boolean;
  field: string;        // human-readable label e.g. "Rapid-acting insulin"
  oldValue: string;     // currently active value to display
  newValue: string;     // newly selected value to display
  onConfirm: () => void;
  onCancel: () => void;
}

export default function EquipmentChangeConfirmation({
  visible,
  field,
  oldValue,
  newValue,
  onConfirm,
  onCancel,
}: EquipmentChangeConfirmationProps) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Change equipment?</Text>
        <Text style={styles.body}>
          Changing <Text style={styles.fieldName}>{field}</Text> from{' '}
          <Text style={styles.valueName}>{oldValue}</Text> to{' '}
          <Text style={styles.valueName}>{newValue}</Text>.
        </Text>
        <View style={styles.buttonRow}>
          <Pressable style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </Pressable>
          <Pressable style={styles.confirmBtn} onPress={onConfirm}>
            <Text style={styles.confirmBtnText}>Confirm</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.textSecondary,
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 12,
  },
  body: {
    fontSize: 16,
    color: COLORS.textSecondary,
    lineHeight: 24,
    marginBottom: 28,
  },
  fieldName: {
    color: COLORS.text,
    fontWeight: '600',
  },
  valueName: {
    color: COLORS.text,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  confirmBtn: {
    flex: 1,
    backgroundColor: COLORS.green,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
});
