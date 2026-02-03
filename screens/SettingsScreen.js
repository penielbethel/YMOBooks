import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, TextInput, ScrollView, RefreshControl, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
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

  // New state for branding
  const [logo, setLogo] = useState(null);
  const [signature, setSignature] = useState(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Local state for company object
  const [company, setCompany] = useState(null);

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

    setLogo(c?.logo || null);
    setSignature(c?.signature || null);
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

  const pickImage = async (type) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'logo' ? [1, 1] : [2, 1], // square for logo, wide for signature
        quality: 0.5,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const base64 = result.assets[0].base64;
        const dataUrl = `data:image/jpeg;base64,${base64}`;
        if (type === 'logo') setLogo(dataUrl);
        else setSignature(dataUrl);
      }
    } catch (e) {
      Alert.alert('Error', 'Could not pick image');
    }
  };

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
        companyId: String(company.companyId).trim(),
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
        logo,
        signature
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
          logo: serverCompany?.logo || logo,
          signature: serverCompany?.signature || signature
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
        {/* Section 1: Company Information */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Company Profile</Text>
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
        </View>

        {/* Section 2: Bank Details */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Bank Details</Text>
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
        </View>

        {/* Section 3: Global Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Global Settings (Currency & Location)</Text>
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

        {/* Section 4: Advanced Options (Hidden by default) */}
        {showAdvanced && (
          <View style={[styles.card, { borderColor: Colors.primary, borderWidth: 1 }]}>
            <Text style={styles.cardTitle}>Advanced Options: Branding</Text>
            <Text style={styles.helperText}>Upload your official assets for documents.</Text>

            <View style={[styles.formRow, { marginTop: 15 }]}>
              <Text style={styles.label}>Company Logo</Text>
              {logo ? (
                <View style={{ alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8 }}>
                  <Image source={{ uri: logo }} style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 8 }} />
                  <TouchableOpacity onPress={() => setLogo(null)}><Text style={{ color: Colors.error, fontWeight: '500' }}>Remove Logo</Text></TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('logo')}>
                <Text style={styles.uploadBtnText}>{logo ? 'Change Logo' : 'Click to Upload Logo'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ height: 1, backgroundColor: Colors.border, marginVertical: 15 }} />

            <View style={styles.formRow}>
              <Text style={styles.label}>Signature</Text>
              {signature ? (
                <View style={{ alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 8 }}>
                  <Image source={{ uri: signature }} style={{ width: 150, height: 80, resizeMode: 'contain', marginBottom: 8 }} />
                  <TouchableOpacity onPress={() => setSignature(null)}><Text style={{ color: Colors.error, fontWeight: '500' }}>Remove Signature</Text></TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity style={styles.uploadBtn} onPress={() => pickImage('signature')}>
                <Text style={styles.uploadBtnText}>{signature ? 'Change Signature' : 'Click to Upload Signature'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Primary Actions: The 3 Requested Buttons */}
        <View style={styles.actionGroup}>
          {/* Button 1: Edit/Save Profile */}
          <TouchableOpacity
            style={[styles.primaryBtn, saving && { opacity: 0.8 }]}
            disabled={saving}
            onPress={handleSave}
          >
            <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : "Edit Company's Profile"}</Text>
          </TouchableOpacity>

          {/* Button 2: Advanced Options Toggle */}
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setShowAdvanced(!showAdvanced)}
          >
            <Text style={styles.secondaryBtnText}>
              {showAdvanced ? 'Hide Advanced Options' : 'Advance Option'}
            </Text>
          </TouchableOpacity>

          {/* Button 3: Logout */}
          <TouchableOpacity
            style={styles.destructiveBtn}
            onPress={handleLogout}
          >
            <Text style={styles.destructiveBtnText}>Logout</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backButtonText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium },
  title: { fontSize: Fonts.sizes.title, fontWeight: Fonts.weights.bold, color: Colors.white, marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.md, color: Colors.white, opacity: 0.9 },

  content: { padding: Spacing.lg },

  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: Spacing.lg,
    marginBottom: Spacing.lg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.text, marginBottom: 12 },
  helperText: { fontSize: 13, color: Colors.textSecondary, marginBottom: 8 },

  formRow: { marginBottom: 16 },
  label: { color: Colors.textSecondary, fontSize: 14, marginBottom: 6, fontWeight: '500' },
  input: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#e1e4e8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16
  },

  chip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: '#e1e4e8', backgroundColor: '#fff' },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { color: Colors.textSecondary, fontWeight: '500' },

  uploadBtn: {
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  uploadBtnText: { color: '#0284c7', fontWeight: '600', fontSize: 15 },

  // Action Buttons
  actionGroup: { gap: 16, marginTop: 10, paddingBottom: 40 },

  primaryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4
  },
  primaryBtnText: { color: Colors.white, fontWeight: 'bold', fontSize: 16, letterSpacing: 0.5 },

  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center'
  },
  secondaryBtnText: { color: Colors.primary, fontWeight: '700', fontSize: 16 },

  destructiveBtn: {
    backgroundColor: '#fee2e2',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10
  },
  destructiveBtnText: { color: '#dc2626', fontWeight: '700', fontSize: 16 },
});

export default SettingsScreen;