import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const FAQ = [
  {
    q: 'Why is my glucose reading stale?',
    a: 'GlucoLog reads from your Nightscout instance, which polls LibreLinkUp every 5 minutes. If the reading is older than 10 minutes, the sensor may have lost connection or the LibreLinkUp bridge may need restarting.',
  },
  {
    q: 'What does the confidence indicator mean?',
    a: '"Solo ✓" means only one meal was logged in a 3-hour window — the glucose curve is reliable. "Mixed ⚠" or "Complex ✕" means multiple entries were logged close together, so the curve reflects several foods and cannot be attributed to one meal alone.',
  },
  {
    q: 'What is the carb:insulin ratio used for?',
    a: 'It\'s stored for your reference and shown when logging meals in future updates. GlucoLog never gives dosing advice — always follow your care team\'s guidance.',
  },
  {
    q: 'Why is the 12hr curve not showing for long-acting insulin?',
    a: 'The curve is fetched from Nightscout once 12 hours have passed since the injection. Open the history screen after 12 hours and tap "Load overnight curve".',
  },
  {
    q: 'How do I update my Nightscout URL or token?',
    a: 'These are currently baked into the app. If your Nightscout details change, let us know and we\'ll update the connection.',
  },
  {
    q: 'Is my data private?',
    a: 'Yes. All meal and insulin data is stored locally on your device. Glucose data is fetched directly from your personal Nightscout instance — no data passes through GlucoLog servers.',
  },
];

export default function HelpScreen() {
  return (
    <ScrollView contentContainerStyle={styles.container}>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Frequently asked questions</Text>
        {FAQ.map((item, i) => (
          <View key={i} style={styles.faqItem}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>About GlucoLog</Text>
        <View style={styles.card}>
          <Text style={styles.aboutText}>
            GlucoLog is a personal T1D meal and glucose tracking app built by a Type 1 diabetic, for Type 1 diabetics.
          </Text>
          <Text style={styles.aboutText}>
            It connects to your Nightscout instance to display live CGM data and builds a personal memory of how your body responds to different meals over time.
          </Text>
          <Text style={[styles.aboutText, { color: '#636366' }]}>
            GlucoLog does not give medical advice. Always consult your diabetes care team.
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionHeader}>Contact</Text>
        <View style={styles.card}>
          <Pressable onPress={() => Linking.openURL('mailto:support@glucolog.app')}>
            <Text style={styles.contactLink}>support@glucolog.app</Text>
          </Pressable>
        </View>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 48 },
  section: { marginBottom: 8 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  faqItem: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
    gap: 8,
  },
  question: { fontSize: 15, fontWeight: '600', color: '#FFFFFF' },
  answer: { fontSize: 14, color: '#8E8E93', lineHeight: 20 },
  aboutText: { fontSize: 14, color: '#EBEBF5', lineHeight: 21 },
  contactLink: { fontSize: 16, color: '#0A84FF' },
});
