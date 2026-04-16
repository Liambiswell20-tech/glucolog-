import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS, FONTS } from '../theme';

export const CURRENT_AI_CONSENT_VERSION = '1.0';

interface AIConsentModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export default function AIConsentModal({ visible, onAccept, onDecline }: AIConsentModalProps) {
  const [saving, setSaving] = useState(false);

  async function handleAccept() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        onDecline();
        return;
      }
      const { error } = await supabase.from('ai_consent_records').upsert({
        user_id: user.id,
        version: CURRENT_AI_CONSENT_VERSION,
        accepted_at: new Date().toISOString(),
        revoked_at: null,
      }, { onConflict: 'user_id,version' });

      if (error) {
        console.warn('[AIConsentModal] consent save failed', error);
        onDecline();
        return;
      }
      onAccept();
    } catch (err) {
      console.warn('[AIConsentModal] unexpected error', err);
      onDecline();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onDecline}>
      <Pressable style={styles.backdrop} onPress={onDecline} />
      <View style={styles.wrapper}>
        <View style={styles.sheet}>
          <Text style={styles.title}>AI Carb Estimation</Text>
          <Text style={styles.body}>
            Your photo is sent to Anthropic's Claude API for carb estimation and is not stored by them. You can revoke this consent in Settings at any time.
          </Text>
          <Pressable
            style={[styles.acceptBtn, saving && { opacity: 0.5 }]}
            onPress={handleAccept}
            disabled={saving}
          >
            <Text style={styles.acceptBtnText}>{saving ? 'Saving...' : 'I understand, continue'}</Text>
          </Pressable>
          <Pressable style={styles.declineBtn} onPress={onDecline}>
            <Text style={styles.declineBtnText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  wrapper: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32,
  },
  sheet: {
    backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, gap: 16, width: '100%',
  },
  title: { fontSize: 18, fontWeight: '700', color: COLORS.text, fontFamily: FONTS.semiBold },
  body: { fontSize: 15, color: COLORS.textSecondary, lineHeight: 22, fontFamily: FONTS.regular },
  acceptBtn: {
    backgroundColor: COLORS.green, borderRadius: 12, padding: 14, alignItems: 'center',
  },
  acceptBtnText: { color: COLORS.text, fontSize: 16, fontWeight: '600', fontFamily: FONTS.semiBold },
  declineBtn: { alignItems: 'center', padding: 8 },
  declineBtnText: { color: COLORS.textSecondary, fontSize: 14, fontFamily: FONTS.regular },
});
