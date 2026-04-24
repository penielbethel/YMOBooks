import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { View, Text, StyleSheet, Platform } from 'react-native';

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
import SubscriptionScreen from './screens/SubscriptionScreen';
import StockManagementScreen from './screens/StockManagementScreen';
import ProfitLossScreen from './screens/ProfitLossScreen';
import BalanceSheetScreen from './screens/BalanceSheetScreen';
import PrintingServiceScreen from './screens/PrintingServiceScreen';

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
        const parsed = JSON.parse(companyData);
        let isValid = true; // Assume valid unless proven otherwise on web
        
        try {
          const ping = await pingBackend();
          if (ping.ok) {
            const check = await fetchCompany(parsed.companyId, parsed.businessType);
            // If the server explicitly says success:false, then it's invalid. 
            // If the server is down or returns 404, we might want to keep the local session.
            if (check && check.success === false && check.message?.includes('not found')) {
              isValid = false;
            }
          }
        } catch (e) { 
          console.log('Validation ping/fetch failed, keeping local session');
        }

        if (isValid) {
          setHasCompanyData(true);
        } else {
          await AsyncStorage.removeItem('companyData');
          setHasCompanyData(false);
        }
      }
    } catch (error) {
      console.log('Error checking company data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Professional Web Linking Configuration
  const linking = {
    prefixes: [Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : 'ymobooks://'],
    config: {
      screens: {
        Welcome: '',
        Login: {
          path: 'app.html',
          parse: { screen: (s) => s === 'login' ? 'login' : null },
        },
        CompanyRegistration: 'register',
        Dashboard: 'dashboard',
      }
    },
    // Custom logic to handle the ?screen=... param from the landing page
    getStateFromPath(path, config) {
      if (Platform.OS === 'web') {
        const urlParams = new URLSearchParams(window.location.search);
        const screenParam = urlParams.get('screen');
        
        // Sync check for web persistence to prevent race conditions during refresh
        const hasData = !!localStorage.getItem('companyData');

        if (screenParam === 'login') {
          return { routes: [{ name: 'Login' }] };
        }
        if (screenParam === 'register') {
          const businessType = urlParams.get('businessType');
          return { 
            routes: [{ 
              name: 'CompanyRegistration',
              params: { businessType }
            }] 
          };
        }

        // If we are on app.html and have data, force Dashboard
        if (path.includes('app.html') && hasData) {
          return { routes: [{ name: 'Dashboard' }] };
        }

        // If we are on app.html and NO data, force Login
        if (path.includes('app.html') && !hasData) {
          return { routes: [{ name: 'Login' }] };
        }
      }
      return undefined; // Fall back to default behavior
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10 }}>
           <Text style={{ color: Colors.primary, fontSize: 20, fontWeight: '800' }}>YMOBooks</Text>
        </View>
        <Text style={[styles.loadingText, { marginTop: 20 }]}>Resuming Session...</Text>
        <StatusBar style="auto" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="light" backgroundColor={Colors.primary} />
      <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? '#f8fafc' : Colors.background }}>
        <View style={Platform.OS === 'web' ? {
          flex: 1,
          maxWidth: 600,
          width: '100%',
          alignSelf: 'center',
          backgroundColor: Colors.background,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.1,
          shadowRadius: 30,
          elevation: 10,
        } : { flex: 1 }}>
          <Stack.Navigator
            initialRouteName={hasCompanyData ? 'Dashboard' : 'Welcome'}
            screenOptions={{
              headerShown: false,
              cardStyle: { backgroundColor: Colors.background }
            }}
          >
            <Stack.Screen name="Welcome" component={WelcomeScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CompanyRegistration" component={CompanyRegistrationScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="SuperAdmin" component={SuperAdminScreen} />
            <Stack.Screen name="CreateInvoice" component={CreateInvoiceScreen} />
            <Stack.Screen name="InvoiceHistory" component={InvoiceHistoryScreen} />
            <Stack.Screen name="LetterheadPreview" component={LetterheadPreviewScreen} />
            <Stack.Screen name="TemplatePicker" component={TemplatePickerScreen} />
            <Stack.Screen name="FinancialCalculator" component={FinancialCalculatorScreen} />
            <Stack.Screen name="Subscription" component={SubscriptionScreen} options={{ presentation: 'modal' }} />
            <Stack.Screen name="StockManagement" component={StockManagementScreen} />
            <Stack.Screen name="ProfitLoss" component={ProfitLossScreen} />
            <Stack.Screen name="BalanceSheet" component={BalanceSheetScreen} />
            <Stack.Screen name="PrintingService" component={PrintingServiceScreen} />
          </Stack.Navigator>
        </View>
      </View>
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
