import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet } from 'react-native';

// Import screens
import WelcomeScreen from './screens/WelcomeScreen';
import CompanyRegistrationScreen from './screens/CompanyRegistrationScreen';
import DashboardScreen from './screens/DashboardScreen';
import LetterheadPreviewScreen from './screens/LetterheadPreviewScreen';
import TemplatePickerScreen from './screens/TemplatePickerScreen';
import LoginScreen from './screens/LoginScreen';
import SettingsScreen from './screens/SettingsScreen';
import CreateInvoiceScreen from './screens/CreateInvoiceScreen';
import InvoiceHistoryScreen from './screens/InvoiceHistoryScreen';
import SuperAdminScreen from './screens/SuperAdminScreen';
import FinancialCalculatorScreen from './screens/FinancialCalculatorScreen';

// Import constants
import { Colors } from './constants/Colors';
import { registerCompany, fetchCompany, pingBackend } from './utils/api';

const Stack = createStackNavigator();

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasCompanyData, setHasCompanyData] = useState(false);

  useEffect(() => {
    checkCompanyData();
  }, []);

  const checkCompanyData = async () => {
    try {
      const companyData = await AsyncStorage.getItem('companyData');
      if (companyData) {
        // Verify against backend to support "clean sheet" resets
        const parsed = JSON.parse(companyData);
        let isValid = false;
        try {
          const ping = await pingBackend();
          if (ping.ok) {
            const check = await fetchCompany(parsed.companyId);
            if (check && check.success) {
              isValid = true;
            }
          } else {
            // Offline: assume valid if we have data
            isValid = true;
          }
        } catch (e) { }

        if (isValid) {
          setHasCompanyData(true);
        } else {
          // Backend has been wiped or ID is invalid - clear local storage
          await AsyncStorage.removeItem('companyData');
          // Proceed to auto-register below
          setHasCompanyData(false); // will trigger auto-reg logic if westructure flow, but here we just fall out
        }
      }

      const refreshedData = await AsyncStorage.getItem('companyData');
      if (!refreshedData) {
        // Auto-register a test company on first launch to verify backend
        try {
          const ping = await pingBackend();
          if (ping.ok) {
            const res = await registerCompany({
              name: 'Auto Test',
              email: 'auto@test.local',
              businessType: 'general_merchandise'
            });
            if (res?.success && res.companyId) {
              const fetched = await fetchCompany(res.companyId);
              const c = fetched?.company || { name: 'Auto Test', companyId: res.companyId };
              const stored = {
                companyName: c.name,
                address: c.address || '',
                email: c.email || '',
                phoneNumber: c.phone || '',
                logo: c.logo || null,
                signature: c.signature || null,
                companyId: c.companyId,
                invoiceTemplate: c.invoiceTemplate || 'classic',
                receiptTemplate: c.receiptTemplate || 'classic',
                // Include bank and brand fields so they persist across sessions
                bankName: c.bankName || '',
                bankAccountName: c.accountName || c.bankAccountName || '',
                bankAccountNumber: c.accountNumber || c.bankAccountNumber || '',
                brandColor: c.brandColor || null,
                currencySymbol: c.currencySymbol || '$',
                businessType: 'general_merchandise',
              };
              await AsyncStorage.setItem('companyData', JSON.stringify(stored));
              setHasCompanyData(true);
            }
          }
        } catch (_e) {
          // ignore auto-registration errors
        }
      }
    } catch (error) {
      console.log('Error checking company data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading YMOBooks...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <Stack.Navigator
        initialRouteName={hasCompanyData ? 'Dashboard' : 'Welcome'}
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: Colors.background }
        }}
      >
        <Stack.Screen
          name="Welcome"
          component={WelcomeScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="CompanyRegistration"
          component={CompanyRegistrationScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="SuperAdmin"
          component={SuperAdminScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="CreateInvoice"
          component={CreateInvoiceScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="InvoiceHistory"
          component={InvoiceHistoryScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="LetterheadPreview"
          component={LetterheadPreviewScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="TemplatePicker"
          component={TemplatePickerScreen}
          options={{
            animationEnabled: true,
          }}
        />
        <Stack.Screen
          name="FinancialCalculator"
          component={FinancialCalculatorScreen}
          options={{
            animationEnabled: true,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '600',
  },
});
