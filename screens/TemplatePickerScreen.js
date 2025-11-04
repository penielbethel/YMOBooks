import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { updateCompany } from '../utils/api';

const TEMPLATES = [
  { key: 'classic', title: 'Classic', emoji: '📄' },
  { key: 'modern', title: 'Modern', emoji: '✨' },
  { key: 'minimal', title: 'Minimal', emoji: '🧼' },
  { key: 'bold', title: 'Bold', emoji: '🔥' },
  { key: 'compact', title: 'Compact', emoji: '📦' },
];

export default function TemplatePickerScreen({ navigation }) {
  const [company, setCompany] = useState(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState('classic');
  const [receiptTemplate, setReceiptTemplate] = useState('classic');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem('companyData');
        if (data) {
          const parsed = JSON.parse(data);
          setCompany(parsed);
          setInvoiceTemplate(parsed.invoiceTemplate || 'classic');
          setReceiptTemplate(parsed.receiptTemplate || 'classic');
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load company data');
      }
    })();
  }, []);

  const saveSelection = async () => {
    if (!company?.companyId) return Alert.alert('Not Found', 'Company ID missing. Please login again.');
    setSaving(true);
    try {
      const res = await updateCompany(company.companyId, { invoiceTemplate, receiptTemplate });
      if (res?.success) {
        const updated = { ...company, invoiceTemplate, receiptTemplate };
        await AsyncStorage.setItem('companyData', JSON.stringify(updated));
        Alert.alert('Saved', 'Template preferences updated successfully. New invoices will use your selected style.');
        navigation.goBack();
      } else {
        Alert.alert('Error', res?.message || 'Failed to save templates');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const renderTemplate = (tplKey, title, emoji, selected, onSelect) => (
    <TouchableOpacity
      style={[styles.templateCard, selected && styles.templateSelected]}
      onPress={() => onSelect(tplKey)}
    >
      <Text style={styles.templateEmoji}>{emoji}</Text>
      <Text style={styles.templateTitle}>{title}</Text>
      <Text style={styles.templateSubtitle}>{selected ? 'Selected' : 'Tap to select'}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Pick Your Templates</Text>
          <Text style={styles.subtitle}>Choose invoice and receipt styles. Your choice affects future PDFs.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Template</Text>
          <View style={styles.grid}>
            {TEMPLATES.map((t) => (
              <View key={`inv-${t.key}`} style={styles.gridItem}>
                {renderTemplate(t.key, t.title, t.emoji, invoiceTemplate === t.key, setInvoiceTemplate)}
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Receipt Template</Text>
          <View style={styles.grid}>
            {TEMPLATES.map((t) => (
              <View key={`rcp-${t.key}`} style={styles.gridItem}>
                {renderTemplate(t.key, t.title, t.emoji, receiptTemplate === t.key, setReceiptTemplate)}
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={saveSelection} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Preference'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg },
  header: { marginBottom: Spacing.md },
  backButton: { paddingVertical: 8, paddingHorizontal: 12 },
  backButtonText: { color: Colors.primary, fontSize: 16, fontFamily: Fonts.medium },
  title: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text, marginTop: Spacing.xs },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  section: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.sm },
  gridItem: { width: '50%', paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm },
  templateCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateSelected: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  templateEmoji: { fontSize: 28 },
  templateTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginTop: 8 },
  templateSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.semiBold },
});