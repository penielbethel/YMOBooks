import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, TextInput, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { updateCompany } from '../utils/api';

const SettingsScreen = ({ navigation }) => {
  const [company, setCompany] = useState(null);
  const [country, setCountry] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [saving, setSaving] = useState(false);

  const symbolToCode = (sym) => {
    switch (String(sym || '').trim()) {
      case '₦': return 'NGN';
      case '$': return 'USD';
      case '£': return 'GBP';
      case '€': return 'EUR';
      case '₵': return 'GHS';
      case 'KSh': return 'KES';
      default: return undefined;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        const c = stored ? JSON.parse(stored) : null;
        setCompany(c);
        setCountry(c?.country || '');
        setCurrencySymbol(c?.currencySymbol || '$');
      } catch (_) {}
    })();
  }, []);

  const handleLogout = async () => {
    try {
      await AsyncStorage.removeItem('companyData');
      Alert.alert('Logged out', 'You have been logged out successfully.');
      navigation.reset({ index: 0, routes: [{ name: 'Welcome' }] });
    } catch (err) {
      Alert.alert('Error', 'Failed to logout');
    }
  };

  const handleSave = async () => {
    if (!company?.companyId) {
      Alert.alert('Not logged in', 'Please login to your company account');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        companyId: company.companyId,
        country: String(country || '').trim() || undefined,
        currencySymbol,
        currencyCode: symbolToCode(currencySymbol),
      };
      const res = await updateCompany(payload);
      if (res?.success) {
        const updated = {
          ...(company || {}),
          country: payload.country || '',
          currencySymbol: payload.currencySymbol,
          currencyCode: payload.currencyCode,
        };
        await AsyncStorage.setItem('companyData', JSON.stringify(updated));
        setCompany(updated);
        Alert.alert('Saved', 'Company settings updated.');
      } else {
        Alert.alert('Failed', res?.message || 'Could not update company');
      }
    } catch (err) {
      Alert.alert('Error', 'Saving settings failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account and preferences</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Global Settings</Text>
          <View style={styles.formRow}>
            <Text style={styles.label}>Country</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Nigeria"
              placeholderTextColor={Colors.textSecondary}
              value={country}
              onChangeText={setCountry}
            />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Currency</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[
                { sym: '₦', name: 'Naira' },
                { sym: '$', name: 'Dollar' },
                { sym: '£', name: 'Pounds' },
                { sym: '€', name: 'Euros' },
                { sym: '₵', name: 'Cedis' },
                { sym: 'KSh', name: 'Shillings' },
              ].map(({ sym, name }) => (
                <TouchableOpacity
                  key={sym}
                  style={[styles.chip, currencySymbol === sym && styles.chipActive]}
                  onPress={() => setCurrencySymbol(sym)}
                >
                  <Text style={[styles.chipText, currencySymbol === sym && { color: Colors.white }]}>{name} ({sym})</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.actionButton} onPress={() => navigation.navigate('CompanyRegistration', { mode: 'edit' })}>
          <Text style={styles.actionText}>Edit Company Information</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
          <Text style={[styles.actionText, styles.logoutText]}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backButtonText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium },
  title: { fontSize: Fonts.sizes.title, fontWeight: Fonts.weights.bold, color: Colors.white, marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.md, color: Colors.white, opacity: 0.9 },
  content: { padding: Spacing.lg },
  section: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.lg },
  sectionTitle: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  formRow: { marginBottom: Spacing.md },
  label: { color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: Colors.text },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.border, marginRight: 8, marginBottom: 8 },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.success, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: Spacing.sm },
  saveBtnText: { color: Colors.white, fontWeight: Fonts.weights.semiBold },
  actionButton: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.lg, marginBottom: Spacing.md },
  actionText: { fontSize: Fonts.sizes.md, color: Colors.text, fontWeight: Fonts.weights.semiBold },
  logoutButton: { backgroundColor: Colors.white, borderColor: Colors.primary },
  logoutText: { color: Colors.primary },
});

export default SettingsScreen;