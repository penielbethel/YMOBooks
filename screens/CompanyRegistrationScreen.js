import React, { useState } from 'react';
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
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import SignatureCanvas from 'react-native-signature-canvas';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { registerCompany, updateCompany } from '../utils/api';

const CompanyRegistrationScreen = ({ navigation }) => {
  const [formData, setFormData] = useState({
    companyName: '',
    address: '',
    email: '',
    phoneNumber: '',
    logo: null,
    signature: null,
    bankAccountNumber: '',
    bankAccountName: '',
    bankName: ''
  });

  const [loading, setLoading] = useState(false);
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [generatedCompanyId, setGeneratedCompanyId] = useState('');
  const [signatureModalVisible, setSignatureModalVisible] = useState(false);

  const updateFormData = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const pickImage = async (type) => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      
      if (permissionResult.granted === false) {
        Alert.alert('Permission Required', 'Permission to access camera roll is required!');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: type === 'logo' ? [1, 1] : [4, 2],
        quality: 0.8,
      });

      if (!result.canceled) {
        updateFormData(type, result.assets[0].uri);
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
    try {
      // Convert images to base64 (if present)
      const toBase64 = async (uri) => {
        try {
          if (!uri) return null;
          const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
          return `data:image/png;base64,${base64}`;
        } catch {
          return null;
        }
      };

      const payload = {
        name: formData.companyName,
        address: formData.address,
        email: formData.email,
        phone: formData.phoneNumber,
        logo: formData.logo ? await toBase64(formData.logo) : null,
        signature: formData.signature ? await toBase64(formData.signature) : null,
        bankAccountNumber: formData.bankAccountNumber,
        bankAccountName: formData.bankAccountName,
        bankName: formData.bankName,
      };
      const storedExisting = await AsyncStorage.getItem('companyData');
      const existing = storedExisting ? JSON.parse(storedExisting) : null;
      if (existing?.companyId) {
        const result = await updateCompany(existing.companyId, payload);
        if (result?.success) {
          const stored = { ...formData, companyId: existing.companyId };
          await AsyncStorage.setItem('companyData', JSON.stringify(stored));
          Alert.alert('Updated', 'Company information updated successfully');
          navigation.navigate('Dashboard');
        } else {
          Alert.alert('Error', result?.message || 'Update failed');
        }
      } else {
        const result = await registerCompany(payload);
        if (result?.success) {
          setGeneratedCompanyId(result.companyId);
          const stored = { ...formData, companyId: result.companyId };
          await AsyncStorage.setItem('companyData', JSON.stringify(stored));
          setSuccessModalVisible(true);
        } else {
          Alert.alert('Error', result?.message || 'Registration failed');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save company data');
    } finally {
      setLoading(false);
    }
  };

  const copyCompanyId = async () => {
    try {
      await Clipboard.setStringAsync(generatedCompanyId);
      Alert.alert('Copied', 'Company ID copied to clipboard');
    } catch {}
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
            <Text style={styles.title}>Register Your Company</Text>
            <Text style={styles.subtitle}>
              Set up your company profile to create professional documents
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
              />
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

            {/* Signature */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Register Your Signature</Text>
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
                    <Text style={styles.imagePlaceholderLabel}>Tap to register signature</Text>
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
                {loading ? 'Registering...' : 'Complete Registration'}
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
              onOK={(sig) => {
                // sig is a base64 data URL
                updateFormData('signature', sig);
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
});

export default CompanyRegistrationScreen;
