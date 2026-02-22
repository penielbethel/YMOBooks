import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, TextInput, ScrollView, RefreshControl, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { updateCompany, fetchCompany, resolveAssetUri } from '../utils/api';

import { Modal } from 'react-native';
import SignatureCanvas from 'react-native-signature-canvas';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

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
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

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
    const init = async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        if (!stored) return;
        let c = JSON.parse(stored);

        // Populate initial fields
        populateFields(c);

        // On-demand fetch if assets are missing but flags say they exist
        if ((!c.logo || !c.signature) && c.companyId) {
          if (c.hasLogo || c.hasSignature) {
            try {
              const fetched = await fetchCompany(c.companyId);
              const full = fetched?.company || fetched?.data;
              if (full) {
                // Merge and update state
                const merged = { ...c, ...full };
                populateFields(merged);
                // Save back to AsyncStorage to make it permanent locally
                await AsyncStorage.setItem('companyData', JSON.stringify(merged)).catch(() => { });
                // Also cache the logo for other screens
                if (full.logo) {
                  await AsyncStorage.setItem('companyLogoCache', full.logo).catch(() => { });
                }
              }
            } catch (e) {
              console.warn('[Settings] Failed to fetch full company details on load', e);
            }
          }
        }
      } catch (_) { }
    };
    init();
  }, []);

  const reloadCompanyData = async () => {
    try {
      const stored = await AsyncStorage.getItem('companyData');
      const c = stored ? JSON.parse(stored) : null;
      populateFields(c);
    } catch (_) { }
  };

  // --- Client-side image compression helpers (Copied from CompanyRegistration) ---
  const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:');
  const parseDataUrl = (dataUrl) => {
    try {
      const [header, b64] = dataUrl.split(',');
      const mime = header.slice(5, header.indexOf(';')) || 'image/png';
      return { mime, base64: b64 };
    } catch {
      return { mime: 'image/png', base64: null };
    }
  };
  const ensureFileUriFromInput = async (input, kind) => {
    if (!input) return null;
    if (isDataUrl(input)) {
      try {
        const { base64 } = parseDataUrl(input);
        if (!base64) return null;
        const cacheDir = FileSystem.cacheDirectory || FileSystemLegacy.cacheDirectory || '';
        const path = `${cacheDir}img-${kind}-${Date.now()}.png`;
        await FileSystemLegacy.writeAsStringAsync(path, base64, { encoding: 'base64' });
        return path;
      } catch {
        return null;
      }
    }
    return input;
  };
  const compressToDataUrl = async (input, kind = 'logo') => {
    if (!input || typeof input !== 'string') return undefined;
    if (input.startsWith('http')) return undefined; // Already a URL
    try {
      const fileUri = await ensureFileUriFromInput(input, kind);
      if (!fileUri) return undefined;
      const bounds = kind === 'signature' ? { width: 600, height: 220 } : { width: 512, height: 512 };
      const result = await ImageManipulator.manipulateAsync(
        fileUri,
        [{ resize: { width: bounds.width, height: bounds.height } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.PNG, base64: true }
      );
      if (result?.base64) return `data:image/png;base64,${result.base64}`;
    } catch { }
    try {
      const fileUri = await ensureFileUriFromInput(input, kind);
      if (!fileUri) return undefined;
      const base64 = await FileSystemLegacy.readAsStringAsync(fileUri, { encoding: 'base64' });
      return `data:image/png;base64,${base64}`;
    } catch {
      return undefined;
    }
  };

  const pickImage = async (type) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'logo' ? [1, 1] : [4, 2],
        quality: 0.8,
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        if (type === 'logo') {
          try {
            const dataUrl = await compressToDataUrl(uri, 'logo');
            if (dataUrl) {
              // cache immediately for other screens
              AsyncStorage.setItem('companyLogoCache', dataUrl).catch(() => { });
              setLogo(dataUrl);
            } else {
              setLogo(uri);
            }
          } catch (e) { setLogo(uri); }
        } else {
          try {
            const dataUrl = await compressToDataUrl(uri, 'signature');
            setSignature(dataUrl || uri);
          } catch (e) { setSignature(uri); }
        }
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
      await AsyncStorage.removeItem('companyLogoCache');
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
      // Re-compress if needed (e.g. if they just picked uncompressed) - generally already handled in pickImage/onOK
      // but let's be safe. Though compressToDataUrl aims to handle raw URIs. 
      // Existing data URLs are fast-pathed.

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
        // Use logic that preserves existing data on server if we don't have a new upload ready
        logo: logo === null ? null : await compressToDataUrl(logo, 'logo'),
        signature: signature === null ? null : await compressToDataUrl(signature, 'signature')
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
          logo: serverCompany?.logo || payload.logo,
          signature: serverCompany?.signature || payload.signature,
          hasLogo: !!(serverCompany?.logo || payload.logo),
          hasSignature: !!(serverCompany?.signature || payload.signature)
        };

        // Cache optimization: Store logo separately if possible, or just as is
        if (updated.logo) {
          AsyncStorage.setItem('companyLogoCache', updated.logo).catch(() => { });
        }

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
    <>
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
                    <Image source={{ uri: resolveAssetUri(logo) }} style={{ width: 100, height: 100, resizeMode: 'contain', marginBottom: 8 }} />
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
                    <Image source={{ uri: resolveAssetUri(signature) }} style={{ width: 150, height: 80, resizeMode: 'contain', marginBottom: 8 }} />
                    <View style={{ flexDirection: 'row', gap: 20 }}>
                      <TouchableOpacity onPress={() => setSignatureModalVisible(true)}>
                        <Text style={{ color: Colors.primary, fontWeight: '500' }}>Re-sign</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => setSignature(null)}>
                        <Text style={{ color: Colors.error, fontWeight: '500' }}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={[styles.uploadBtn, { flex: 1 }]} onPress={() => pickImage('signature')}>
                    <Text style={styles.uploadBtnText}>Upload Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.uploadBtn, { flex: 1, backgroundColor: '#fdf4ff', borderColor: '#f0abfc' }]} onPress={() => setSignatureModalVisible(true)}>
                    <Text style={[styles.uploadBtnText, { color: '#c026d3' }]}>Draw Signature</Text>
                  </TouchableOpacity>
                </View>
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
              <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : "Save Changes"}</Text>
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
      <Modal
        visible={signatureModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setSignatureModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={{ flex: 1, padding: Spacing.lg }}>
            <Text style={{ fontSize: Fonts.sizes.header, fontWeight: Fonts.weights.bold, marginBottom: Spacing.md }}>
              Draw Your Signature
            </Text>
            <Text style={{ color: Colors.textSecondary, marginBottom: Spacing.md }}>
              Use a stylus or your finger to sign in the area below. Your signature will be saved to your profile and used on generated documents.
            </Text>
            <View style={{ flex: 1, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 }}>
              <SignatureCanvas
                onOK={async (sig) => {
                  // sig is a base64 data URL; recompress for smaller payload
                  const compact = await compressToDataUrl(sig, 'signature');
                  setSignature(compact || sig);
                  setSignatureModalVisible(false);
                  Alert.alert('Signature Saved', 'Your electronic signature has been captured.');
                }}
                onEmpty={() => {
                  Alert.alert('No Signature', 'Please draw your signature before saving.');
                }}
                descriptionText="Sign here"
                clearText="Clear"
                confirmText="Save Signature"
                webStyle=".m-signature-pad--footer {box-shadow: none;}"
                backgroundColor={Colors.white}
              />
            </View>
            <TouchableOpacity style={[styles.uploadedBtn, { marginTop: Spacing.lg, padding: 15, alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8 }]} onPress={() => setSignatureModalVisible(false)}>
              <Text style={{ fontWeight: '600', color: Colors.text }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </>
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