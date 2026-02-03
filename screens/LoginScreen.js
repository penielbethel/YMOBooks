import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { loginCompany, pingBackend, getApiBaseUrl, fetchCompany } from '../utils/api';

const LoginScreen = ({ navigation }) => {
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedType, setSelectedType] = useState('general_merchandise');

  const businessTypes = [
    { id: 'printing_press', label: 'Printing Press', prefix: 'PBM/PP', color: '#D97706' },
    { id: 'manufacturing', label: 'Manufacturing', prefix: 'PBM/MC', color: '#059669' },
    { id: 'general_merchandise', label: 'General Merchandise', prefix: 'PBM/GM', color: '#2563EB' },
  ];

  const handleLogin = async () => {
    if (!companyId.trim()) {
      Alert.alert('Validation Error', 'Company ID is required');
      return;
    }
    setLoading(true);
    try {
      const entered = companyId.trim();
      // Admin check - case insensitive
      if (entered.toUpperCase() === 'PBMSRV') {
        navigation.navigate('SuperAdmin');
        return;
      }

      // Optional: Check if ID matches selected type prefix (soft validation)
      const activeType = businessTypes.find(t => t.id === selectedType);
      if (activeType && entered.toUpperCase().startsWith('PBM/') && !entered.toUpperCase().startsWith(activeType.prefix)) {
        // User might be logging into wrong category, but we let it pass if valid, just a warning in real app? 
        // For now, assume user knows what they are doing or the ID is unique enough.
        // However, distinct account requirement suggests we should perhaps enforce it?
        // Let's rely on the backend finding the company.
      }

      // Diagnostics: check connectivity and log runtime base URL
      const baseUrl = getApiBaseUrl();
      console.log('[Login] Runtime API_BASE_URL:', baseUrl);
      const ping = await pingBackend();
      if (!ping.ok) {
        Alert.alert(
          'Network Error',
          `Cannot reach backend at ${ping.url}.\nEnsure device USB connection is active and ports 4000/8083 are reversed.`
        );
        return;
      }

      let result = await loginCompany(entered);
      console.log('[Login] Result:', result);
      // Fallback: older servers may not implement POST /api/login; try GET /api/company/:id
      if (!(result?.success && result.company)) {
        try {
          const alt = await fetchCompany(entered);
          console.log('[Login] Fallback fetchCompany:', alt);
          if (alt?.success && (alt.company || alt.data)) {
            result = { success: true, company: alt.company || alt.data };
          }
        } catch (e) {
          console.warn('[Login] Fallback fetchCompany failed:', e?.message || e);
        }
      }
      if (result?.success && result.company) {
        // Merge cached logo/signature if backend doesn't have them
        let cachedLogo = null;
        let previousLogo = null;
        try {
          cachedLogo = await AsyncStorage.getItem('companyLogoCache');
        } catch { }
        try {
          const prevRaw = await AsyncStorage.getItem('companyData');
          const prev = prevRaw ? JSON.parse(prevRaw) : null;
          previousLogo = prev?.logo || null;
        } catch { }
        const stored = {
          companyName: result.company.name,
          address: result.company.address || '',
          email: result.company.email || '',
          phoneNumber: result.company.phone || '',
          companyId: result.company.companyId,
          invoiceTemplate: result.company.invoiceTemplate || 'classic',
          receiptTemplate: result.company.receiptTemplate || 'classic',
          // Persist bank and brand fields so they survive relogin
          bankName: result.company.bankName || '',
          bankAccountName: result.company.accountName || result.company.bankAccountName || '',
          bankAccountNumber: result.company.accountNumber || result.company.bankAccountNumber || '',
          brandColor: result.company.brandColor || null,
          currencySymbol: result.company.currencySymbol || '$',
          businessType: result.company.businessType || selectedType, // Use server value or fallback
          // Hint for on-demand signature fetch to avoid huge AsyncStorage writes
          hasSignature: !!result.company.signature,
          hasLogo: !!(result.company.logo || previousLogo || cachedLogo),
        };
        // Never persist large base64 blobs (signature/logo) to AsyncStorage to avoid SQLITE_FULL
        // If needed, screens should fetch them on-demand from the backend using companyId
        try {
          await AsyncStorage.removeItem('companyLogoCache');
        } catch { }
        await AsyncStorage.setItem('companyData', JSON.stringify(stored));
        navigation.navigate('Dashboard');
      } else {
        const msg = result?.message || 'Invalid Company ID';
        Alert.alert('Login Failed', typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
    } catch (err) {
      console.log('[Login] Error:', err);
      const msg = err?.message || String(err);
      Alert.alert('Error', `Failed to Login\n${msg}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Login</Text>
            <Text style={styles.subtitle}>Enter your Company ID to access your account</Text>
          </View>

          <View style={styles.formContainer}>
            <Text style={styles.sectionLabel}>Select Account Category</Text>
            <View style={styles.typeContainer}>
              {businessTypes.map((type) => {
                const isActive = selectedType === type.id;
                return (
                  <TouchableOpacity
                    key={type.id}
                    style={[
                      styles.typeChip,
                      isActive && { backgroundColor: type.color, borderColor: type.color }
                    ]}
                    onPress={() => {
                      setSelectedType(type.id);
                      // Clear ID or maybe auto-fill prefix? Let's leave clear to avoid confusion
                      // but maybe nice to hint the prefix
                    }}
                  >
                    <Ionicons
                      name={isActive ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={isActive ? Colors.white : Colors.textSecondary}
                    />
                    <Text style={[styles.typeText, isActive && styles.typeTextActive]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.divider} />

            <Text style={styles.label}>Company ID</Text>
            <TextInput
              style={styles.input}
              value={companyId}
              onChangeText={setCompanyId}
              placeholder={`e.g. ${businessTypes.find(t => t.id === selectedType)?.prefix}-12345`}
              placeholderTextColor={Colors.textSecondary}
              autoCapitalize="characters"
            />
            {/* Helper hint */}
            <Text style={styles.helperText}>
              Ensure your ID starts with <Text style={{ fontWeight: 'bold' }}>{businessTypes.find(t => t.id === selectedType)?.prefix}</Text> for this category.
            </Text>

            <TouchableOpacity style={[styles.loginButton, loading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={loading}>
              <Text style={styles.loginButtonText}>{loading ? 'Logging in...' : 'Login'}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.registerLink} onPress={() => navigation.navigate('CompanyRegistration', { businessType: selectedType })}>
              <Text style={styles.registerLinkText}>Don’t have an account? Register as {businessTypes.find(t => t.id === selectedType)?.label}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scrollContent: { flexGrow: 1 },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backButtonText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium },
  title: { fontSize: Fonts.sizes.title, fontWeight: Fonts.weights.bold, color: Colors.white, marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.md, color: Colors.white, opacity: 0.9 },
  formContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  sectionLabel: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: Colors.text, marginBottom: Spacing.md },
  typeContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.lg },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
    gap: 6
  },
  typeText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '500' },
  typeTextActive: { color: Colors.white, fontWeight: 'bold' },
  divider: { height: 1, backgroundColor: Colors.border, marginBottom: Spacing.lg },
  label: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Fonts.sizes.md, color: Colors.text },
  helperText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, marginTop: Spacing.xs },
  loginButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.lg, borderRadius: 8, alignItems: 'center', marginTop: Spacing.lg },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: Colors.white, fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold },
  registerLink: { marginTop: Spacing.md, alignItems: 'center' },
  registerLinkText: { color: Colors.primary, fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.medium },
});

export default LoginScreen;