import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Modal } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import SignatureCanvas from 'react-native-signature-canvas';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { registerCompany, updateCompany, fetchCompany } from '../utils/api';

const CompanyRegistrationScreen = ({ navigation, route }) => {
  const mode = route?.params?.mode === 'edit' ? 'edit' : 'register';
  const businessTypeParam = route?.params?.businessType || 'general_merchandise';
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    email: '',
    phoneNumber: '',
    logo: null,
    signature: null,
    bankAccountNumber: '',
    bankAccountName: '',
    bankName: '',
    businessType: businessTypeParam,
  });

  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [generatedCompanyId, setGeneratedCompanyId] = useState('');
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);
  const [progressVisible, setProgressVisible] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const progressTimerRef = React.useRef(null);

  // Prefill form when editing - prefer backend values to ensure latest DB state
  useEffect(() => {
    const loadExisting = async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        const existing = stored ? JSON.parse(stored) : null;
        if (existing) {
          // First, set from local storage as immediate fallback
          setFormData(prev => ({
            ...prev,
            companyName: existing.companyName || '',
            address: existing.address || '',
            email: existing.email || '',
            phoneNumber: existing.phoneNumber || '',
            logo: existing.logo || null,
            signature: existing.signature || null,
            bankAccountNumber: existing.bankAccountNumber || '',
            bankAccountName: existing.bankAccountName || '',
            bankName: existing.bankName || '',
            businessType: existing.businessType || businessTypeParam,
          }));
          // Then, fetch authoritative record from backend and prefer its values
          if (existing.companyId) {
            try {
              const resp = await fetchCompany(existing.companyId);
              const c = resp?.company;
              if (c) {
                setFormData(prev => ({
                  ...prev,
                  companyName: c.name || prev.companyName,
                  address: c.address || prev.address,
                  email: c.email || prev.email,
                  phoneNumber: c.phone || prev.phoneNumber,
                  logo: c.logo ?? prev.logo,
                  signature: c.signature ?? prev.signature,
                  bankAccountNumber: c.accountNumber || prev.bankAccountNumber,
                  bankAccountName: c.accountName || prev.bankAccountName,
                  bankName: c.bankName || prev.bankName,
                  businessType: c.businessType || prev.businessType,
                }));
              }
            } catch { }
          }
        }
      } catch { }
    };
    if (mode === 'edit') loadExisting();
  }, [mode]);

  const updateFormData = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // --- Client-side image compression helpers ---
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
        const path = `${FileSystem.cacheDirectory || ''}img-${kind}-${Date.now()}.png`;
        await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
        return path;
      } catch {
        return null;
      }
    }
    return input;
  };
  const compressToDataUrl = async (input, kind = 'logo') => {
    try {
      const fileUri = await ensureFileUriFromInput(input, kind);
      if (!fileUri) return null;
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
      if (!fileUri) return null;
      const base64 = await FileSystemLegacy.readAsStringAsync(fileUri, { encoding: 'base64' });
      return `data:image/png;base64,${base64}`;
    } catch {
      return null;
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
              await AsyncStorage.setItem('companyLogoCache', dataUrl);
              updateFormData(type, dataUrl);
            } else {
              updateFormData(type, uri);
            }
          } catch {
            updateFormData(type, uri);
          }
        } else if (type === 'signature') {
          try {
            const dataUrl = await compressToDataUrl(uri, 'signature');
            updateFormData(type, dataUrl || uri);
          } catch {
            updateFormData(type, uri);
          }
        } else {
          updateFormData(type, uri);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const validateForm = () => {
    if (!formData.companyName.trim()) {
      Alert.alert('Validation Error', 'Company name is required');
      return false;
    }
    if (!formData.address.trim()) {
      Alert.alert('Validation Error', 'Address is required');
      return false;
    }
    if (!formData.email.trim()) {
      Alert.alert('Validation Error', 'Email is required');
      return false;
    }
    if (!formData.phoneNumber.trim()) {
      Alert.alert('Validation Error', 'Phone number is required');
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    // Show progress overlay for registration to reassure users
    if (mode !== 'edit') {
      setProgressVisible(true);
      setProgressPercent(5);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      // Smoothly increase progress while awaiting network operations
      progressTimerRef.current = setInterval(() => {
        setProgressPercent((p) => {
          const cap = 90; // cap auto-progress; we'll set to 100% on success
          const next = p + (Math.random() * 6 + 2); // 2–8%
          return next >= cap ? cap : next;
        });
      }, 500);
    }
    try {
      // Convert and compress images to compact base64 (if present)
      const toCompressedData = async (val, kind) => {
        if (!val) return null;
        if (isDataUrl(val)) {
          const recompressed = await compressToDataUrl(val, kind);
          return recompressed || val;
        }
        return await compressToDataUrl(val, kind);
      };
      if (mode !== 'edit') setProgressPercent((p) => Math.max(p, 15));

      const payload = {
        name: formData.companyName,
        address: formData.address,
        email: formData.email,
        phone: formData.phoneNumber,
        // Always send compact base64 for smaller payloads
        logo: await toCompressedData(formData.logo, 'logo'),
        signature: await toCompressedData(formData.signature, 'signature'),
        // Send both modern and legacy keys so server can map reliably
        bankAccountNumber: formData.bankAccountNumber,
        bankAccountName: formData.bankAccountName,
        accountNumber: formData.bankAccountNumber,
        accountName: formData.bankAccountName,
        bankName: formData.bankName,
        businessType: formData.businessType,
      };
      const storedExisting = await AsyncStorage.getItem('companyData');
      const existing = storedExisting ? JSON.parse(storedExisting) : null;
      if (mode === 'edit') {
        if (!existing?.companyId) {
          Alert.alert('Not Found', 'No existing company profile to edit. Please register first.');
        } else {
          const result = await updateCompany(existing.companyId, payload);
          if (result?.success) {
            // Trust the returned company object from the update operation to avoid stale cache issues
            let server = result.company || {};
            // Only refetch if for some reason the update didn't return the company object
            if (!server.companyId) {
              try {
                const refetch = await fetchCompany(existing.companyId);
                if (refetch?.company) server = refetch.company;
              } catch (_) { }
            }

            const normalized = {
              companyName: server.name ?? formData.companyName,
              address: server.address ?? formData.address,
              email: server.email ?? formData.email,
              phoneNumber: server.phone ?? formData.phoneNumber,
              logo: server.logo ?? formData.logo,
              signature: server.signature ?? formData.signature,
              companyId: server.companyId || existing.companyId,
              invoiceTemplate: server.invoiceTemplate || existing.invoiceTemplate || 'classic',
              receiptTemplate: server.receiptTemplate || existing.receiptTemplate || 'classic',
              bankName: server.bankName ?? formData.bankName,
              bankAccountName: server.accountName || server.bankAccountName || formData.bankAccountName || '',
              bankAccountNumber: server.accountNumber || server.bankAccountNumber || formData.bankAccountNumber || '',
              brandColor: server.brandColor || existing.brandColor || null,
              currencySymbol: server.currencySymbol || existing.currencySymbol || '$',
              hasLogo: !!(server.logo ?? formData.logo),
              hasSignature: !!(server.signature ?? formData.signature),
              // Preserve canonical keys alongside legacy ones for broader UI compatibility
              name: server.name ?? existing.name ?? formData.companyName,
              phone: server.phone ?? existing.phone ?? formData.phoneNumber,
            };
            await AsyncStorage.setItem('companyData', JSON.stringify(normalized));
            Alert.alert('Profile Updated Successfully', 'Your company profile has been updated.');
            navigation.navigate('Dashboard');
          } else {
            if (Array.isArray(result?.conflicts) && result.conflicts.length > 0) {
              Alert.alert('Duplicate Details', `Please use unique values for: ${result.conflicts.join(', ')}`);
            } else {
              Alert.alert('Error', result?.message || 'Update failed');
            }
          }
        }
      } else {
        setProgressPercent((p) => Math.max(p, 30));
        const result = await registerCompany(payload);
        setProgressPercent((p) => Math.max(p, 60));
        if (result?.success) {
          setGeneratedCompanyId(result.companyId);
          try {
            const resp = await fetchCompany(result.companyId);
            const c = resp?.company || {};
            const stored = {
              companyName: c.name || formData.companyName,
              address: c.address || formData.address,
              email: c.email || formData.email,
              phoneNumber: c.phone || formData.phoneNumber,
              logo: c.logo ?? formData.logo,
              signature: c.signature ?? formData.signature,
              companyId: c.companyId || result.companyId,
              invoiceTemplate: c.invoiceTemplate || 'classic',
              receiptTemplate: c.receiptTemplate || 'classic',
              bankName: c.bankName || formData.bankName || '',
              bankAccountName: c.accountName || c.bankAccountName || formData.bankAccountName || '',
              bankAccountNumber: c.accountNumber || c.bankAccountNumber || formData.bankAccountNumber || '',
              brandColor: c.brandColor || null,
              currencySymbol: c.currencySymbol || '$',
              hasLogo: !!(c.logo ?? formData.logo),
              hasSignature: !!(c.signature ?? formData.signature),
            };
            await AsyncStorage.setItem('companyData', JSON.stringify(stored));
          } catch {
            const storedFallback = { ...formData, companyId: result.companyId };
            await AsyncStorage.setItem('companyData', JSON.stringify(storedFallback));
          }
          setProgressPercent(100);
          // Short UX delay to let the bar reach 100%
          setTimeout(() => {
            setProgressVisible(false);
            setSuccessModalVisible(true);
          }, 400);
        } else {
          if (Array.isArray(result?.conflicts) && result.conflicts.length > 0) {
            Alert.alert('Duplicate Details', `Please use unique values for: ${result.conflicts.join(', ')}`);
          } else {
            Alert.alert('Error', result?.message || 'Registration failed');
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save company data');
    } finally {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      if (mode !== 'edit') setProgressVisible(false);
      setLoading(false);
    }
  };

  const copyCompanyId = async () => {
    try {
      await Clipboard.setStringAsync(generatedCompanyId);
      Alert.alert('Copied', 'Company ID copied to clipboard');
    } catch { }
  };

  return (
    <>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={styles.header}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.backButtonText}>← Back</Text>
              </TouchableOpacity>
              <Text style={styles.title}>{mode === 'edit' ? "Edit your Company's Details" : 'Register Your Company'}</Text>
              <Text style={styles.subtitle}>
                {mode === 'edit' ? 'Update your profile information and logo' : 'Set up your company profile to create professional documents'}
              </Text>
            </View>

            {/* Form */}
            <View style={styles.formContainer}>
              {/* Company Name */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Company Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.companyName}
                  onChangeText={(text) => updateFormData('companyName', text)}
                  placeholder="Enter your company name"
                  placeholderTextColor={Colors.textSecondary}
                  editable={true}
                />
                {mode === 'edit' && (
                  <Text style={styles.helperText}>Ensure the new name is unique.</Text>
                )}
              </View>

              {/* Company Logo */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Company Logo</Text>
                <TouchableOpacity
                  style={styles.imagePickerButton}
                  onPress={() => pickImage('logo')}
                >
                  {formData.logo ? (
                    <Image source={{ uri: formData.logo }} style={styles.logoPreview} />
                  ) : (
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>📷</Text>
                      <Text style={styles.imagePlaceholderLabel}>Tap to select logo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Address */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Address *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  value={formData.address}
                  onChangeText={(text) => updateFormData('address', text)}
                  placeholder="Enter your company address"
                  placeholderTextColor={Colors.textSecondary}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Email */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Email *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.email}
                  onChangeText={(text) => updateFormData('email', text)}
                  placeholder="Enter your email address"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>

              {/* Phone Number */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number *</Text>
                <TextInput
                  style={styles.input}
                  value={formData.phoneNumber}
                  onChangeText={(text) => updateFormData('phoneNumber', text)}
                  placeholder="Enter your phone number"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="phone-pad"
                />
              </View>

              {/* Bank Details */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={formData.bankName}
                  onChangeText={(text) => updateFormData('bankName', text)}
                  placeholder="Enter your bank name"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  value={formData.bankAccountName}
                  onChangeText={(text) => updateFormData('bankAccountName', text)}
                  placeholder="Enter your account name"
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={formData.bankAccountNumber}
                  onChangeText={(text) => updateFormData('bankAccountNumber', text)}
                  placeholder="Enter your account number"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="number-pad"
                />
              </View>

              {/* Signature */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>{mode === 'edit' ? 'Signature' : 'Register Your Signature'}</Text>
                <Text style={styles.helperText}>
                  Create an electronic signature to be used across invoices, receipts, and documents.
                </Text>
                {formData.signature ? (
                  <View style={{ alignItems: 'center' }}>
                    <Image source={{ uri: formData.signature }} style={styles.signaturePreview} />
                    <TouchableOpacity
                      style={[styles.imagePickerButton, { marginTop: Spacing.sm }]}
                      onPress={() => setSignatureModalVisible(true)}
                    >
                      <Text style={styles.imagePlaceholderLabel}>Re-sign</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerButton}
                    onPress={() => setSignatureModalVisible(true)}
                  >
                    <View style={styles.imagePlaceholder}>
                      <Text style={styles.imagePlaceholderText}>✍️</Text>
                      <Text style={styles.imagePlaceholderLabel}>{mode === 'edit' ? 'Tap to add or update signature' : 'Tap to register signature'}</Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitButton, loading && styles.submitButtonDisabled]}
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? (mode === 'edit' ? 'Saving...' : 'Registering...') : (mode === 'edit' ? 'Save Changes' : 'Complete Registration')}
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {/* Signature Modal */}
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
                  updateFormData('signature', compact || sig);
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
            <TouchableOpacity style={[styles.submitButton, { marginTop: Spacing.lg }]} onPress={() => setSignatureModalVisible(false)}>
              <Text style={styles.submitButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
      {mode !== 'edit' && (
        <Modal
          visible={progressVisible}
          animationType="fade"
          transparent
          onRequestClose={() => { }}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.progressCard}>
              <Text style={styles.progressTitle}>Kindly wait, while we onboard your Company's Details</Text>
              <View style={styles.progressBarOuter}>
                <View style={[styles.progressBarInner, { width: `${Math.round(progressPercent)}%` }]} />
              </View>
              <Text style={styles.progressPercent}>{Math.round(progressPercent)}%</Text>
            </View>
          </View>
        </Modal>
      )}
      {mode !== 'edit' && (
        <Modal
          visible={successModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setSuccessModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Registration Successful</Text>
              <Text style={styles.modalMessage}>Your Company ID</Text>
              <Text style={styles.modalId}>{generatedCompanyId}</Text>
              <Text style={styles.modalHint}>Keep and save this ID. You’ll need it to log in.</Text>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.copyButton} onPress={copyCompanyId}>
                  <Text style={styles.copyButtonText}>Copy ID</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.continueButton} onPress={() => { setSuccessModalVisible(false); navigation.navigate('Dashboard'); }}>
                  <Text style={styles.continueButtonText}>Go to Dashboard</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.md,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.medium,
  },
  title: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Fonts.sizes.md,
    color: Colors.white,
    opacity: 0.9,
  },
  formContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  inputGroup: {
    marginBottom: Spacing.lg,
  },
  label: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  helperText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: Fonts.sizes.md,
    color: Colors.text,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    backgroundColor: Colors.surface,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  imagePlaceholder: {
    alignItems: 'center',
  },
  imagePlaceholderText: {
    fontSize: 32,
    marginBottom: Spacing.sm,
  },
  imagePlaceholderLabel: {
    fontSize: Fonts.sizes.md,
    color: Colors.textSecondary,
  },
  logoPreview: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  signaturePreview: {
    width: 120,
    height: 60,
    borderRadius: 8,
  },
  submitButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.lg,
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: 12,
    width: '85%',
  },
  modalTitle: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  modalMessage: {
    fontSize: Fonts.sizes.md,
    color: Colors.textSecondary,
  },
  modalId: {
    marginTop: Spacing.md,
    fontSize: Fonts.sizes.header,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
    textAlign: 'center',
  },
  modalHint: {
    marginTop: Spacing.sm,
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  copyButton: {
    flex: 1,
    marginRight: Spacing.sm,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyButtonText: {
    color: Colors.primary,
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.bold,
  },
  continueButton: {
    flex: 1,
    marginLeft: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  continueButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.bold,
  },
  progressCard: {
    backgroundColor: Colors.surface,
    padding: Spacing.xl,
    borderRadius: 12,
    width: '85%',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: Fonts.sizes.md,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.md,
    fontWeight: Fonts.weights.semiBold,
  },
  progressBarOuter: {
    width: '100%',
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.gray?.[100] || '#eee',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  progressBarInner: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  progressPercent: {
    marginTop: Spacing.sm,
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
  },
});

export default CompanyRegistrationScreen;
