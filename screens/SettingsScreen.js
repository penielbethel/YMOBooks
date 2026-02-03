import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, TextInput, ScrollView, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { updateCompany, fetchCompany } from '../utils/api';

const SettingsScreen = ({ navigation }) => {
  // State for form fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const [country, setCountry] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  const populateFields = (c) => {
    setCompany(c);
    setName(c?.companyName || c?.name || '');
    setAddress(c?.address || '');
    setEmail(c?.email || '');
    setPhone(c?.phoneNumber || c?.phone || '');
    setBankName(c?.bankName || '');
    setAccountName(c?.bankAccountName || c?.accountName || '');
    setAccountNumber(c?.bankAccountNumber || c?.accountNumber || '');
    setCountry(c?.country || '');
    setCurrencySymbol(c?.currencySymbol || '$');
  };

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        const c = stored ? JSON.parse(stored) : null;
        populateFields(c);
      } catch (_) { }
    })();
  }, []);

  const reloadCompanyData = async () => {
    try {
      const stored = await AsyncStorage.getItem('companyData');
      const c = stored ? JSON.parse(stored) : null;
      populateFields(c);
    } catch (_) { }
  };

  // ... (onRefresh, handleLogout same as before) 
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await reloadCompanyData();
    } finally {
      setRefreshing(false);
    }
  };

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
        name,
        address,
        email,
        phone,
        bankName,
        accountName,
        accountNumber,
        bankAccountName: accountName, // legacy support
        bankAccountNumber: accountNumber, // legacy support
        country: String(country || '').trim() || undefined,
        currencySymbol,
        currencyCode: symbolToCode(currencySymbol),
      };

      const res = await updateCompany(payload);

      if (res?.success) {
        // Prefer authoritative data from server immediately after update
        let serverCompany = res?.company;
        if (!serverCompany) {
          try {
            const refetch = await fetchCompany(company.companyId);
            serverCompany = refetch?.company || null;
          } catch (_) { }
        }

        // Consolidated object for local storage
        const updated = {
          ...(company || {}),
          ...(serverCompany || {}),
          companyName: name,
          name,
          address,
          email,
          phoneNumber: phone, // legacy key
          phone,
          bankName,
          bankAccountName: accountName,
          bankAccountNumber: accountNumber,
          country: payload.country || '',
          currencySymbol: payload.currencySymbol,
          currencyCode: payload.currencyCode,
        };

        await AsyncStorage.setItem('companyData', JSON.stringify(updated));
        setCompany(updated);
        Alert.alert('Saved', 'Company profile updated successfully.');
      } else {
        Alert.alert('Update Failed', res?.message || 'Could not update company');
      }
    } catch (err) {
      Alert.alert('Error', 'Saving settings failed: ' + err.message);
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

      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Company Details</Text>
          <View style={styles.formRow}>
            <Text style={styles.label}>Company Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Company Name" />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Address</Text>
            <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Full Address" />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Email</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Email Address" keyboardType="email-address" />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Phone Number</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Phone Number" keyboardType="phone-pad" />
          </View>

          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />
          <Text style={styles.sectionTitle}>Bank Details</Text>
          <View style={styles.formRow}>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="e.g. Chase Bank" />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Account Name</Text>
            <TextInput style={styles.input} value={accountName} onChangeText={setAccountName} placeholder="Account Holder Name" />
          </View>
          <View style={styles.formRow}>
            <Text style={styles.label}>Account Number</Text>
            <TextInput style={styles.input} value={accountNumber} onChangeText={setAccountNumber} placeholder="Account Number" keyboardType="numeric" />
          </View>

          <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />
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
        </View>

        {/* Actions */}
        <View style={{ gap: 12 }}>
          <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} disabled={saving} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Edit Profile (Save Changes)'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.actionButton, styles.logoutButton]} onPress={handleLogout}>
            <Text style={[styles.actionText, styles.logoutText]}>Logout</Text>
          </TouchableOpacity>
        </View>

        {/* Advanced Options */}
        <TouchableOpacity
          style={[styles.actionButton, { marginTop: 20 }]}
          onPress={() => setShowAdvanced(!showAdvanced)}
        >
          <Text style={styles.actionText}>{showAdvanced ? 'Hide Advanced Options' : 'Show Advanced Options'}</Text>
        </TouchableOpacity>

        {showAdvanced && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Branding Images</Text>

            <View style={styles.formRow}>
              <Text style={styles.label}>Company Logo</Text>
              {logo ? (
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <Image source={{ uri: logo }} style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 8 }} />
                  <TouchableOpacity onPress={() => setLogo(null)}><Text style={{ color: Colors.error }}>Remove Logo</Text></TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('logo')}>
                <Text style={styles.uploadBtnText}>{logo ? 'Change Logo' : 'Upload Logo'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 12 }} />

            <View style={styles.formRow}>
              <Text style={styles.label}>Signature</Text>
              {signature ? (
                <View style={{ alignItems: 'center', marginBottom: 10 }}>
                  <Image source={{ uri: signature }} style={{ width: 150, height: 80, resizeMode: 'contain', marginBottom: 8 }} />
                  <TouchableOpacity onPress={() => setSignature(null)}><Text style={{ color: Colors.error }}>Remove Signature</Text></TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('signature')}>
                <Text style={styles.uploadBtnText}>{signature ? 'Change Signature' : 'Upload Signature'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
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
  uploadBtn: { backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 12, alignItems: 'center' },
  uploadBtnText: { color: Colors.text, fontWeight: '500' },
});

export default SettingsScreen;