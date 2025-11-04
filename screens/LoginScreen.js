import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { loginCompany, pingBackend, getApiBaseUrl } from '../utils/api';

const LoginScreen = ({ navigation }) => {
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!companyId.trim()) {
      Alert.alert('Validation Error', 'Company ID is required');
      return;
    }
    setLoading(true);
    try {
      const entered = companyId.trim();
      if (entered.toLowerCase() === 'pbmsrvr') {
        navigation.navigate('SuperAdmin');
        return;
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

      const result = await loginCompany(entered);
      console.log('[Login] Result:', result);
      if (result?.success && result.company) {
        const stored = {
          companyName: result.company.name,
          address: result.company.address || '',
          email: result.company.email || '',
          phoneNumber: result.company.phone || '',
          logo: result.company.logo || null,
          signature: result.company.signature || null,
          companyId: result.company.companyId,
        };
        await AsyncStorage.setItem('companyData', JSON.stringify(stored));
        navigation.navigate('Dashboard');
      } else {
        Alert.alert('Login Failed', result?.message || 'Invalid Company ID');
      }
    } catch (err) {
      console.log('[Login] Error:', err);
      Alert.alert('Error', 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Login</Text>
          <Text style={styles.subtitle}>Enter your Company ID to access your account</Text>
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.label}>Company ID</Text>
          <TextInput
            style={styles.input}
            value={companyId}
            onChangeText={setCompanyId}
            placeholder="e.g. YMO-12345"
            placeholderTextColor={Colors.textSecondary}
            autoCapitalize="characters"
          />

          <TouchableOpacity style={[styles.loginButton, loading && styles.loginButtonDisabled]} onPress={handleLogin} disabled={loading}>
            <Text style={styles.loginButtonText}>{loading ? 'Logging in...' : 'Login'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.registerLink} onPress={() => navigation.navigate('CompanyRegistration')}>
            <Text style={styles.registerLinkText}>Don’t have an account? Register your company</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
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
  formContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl },
  label: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Fonts.sizes.md, color: Colors.text },
  loginButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.lg, borderRadius: 8, alignItems: 'center', marginTop: Spacing.lg },
  loginButtonDisabled: { opacity: 0.6 },
  loginButtonText: { color: Colors.white, fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold },
  registerLink: { marginTop: Spacing.md, alignItems: 'center' },
  registerLinkText: { color: Colors.primary, fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.medium },
});

export default LoginScreen;