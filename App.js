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
import LoginScreen from './screens/LoginScreen';

// Import constants
import { Colors } from './constants/Colors';

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
      setHasCompanyData(!!companyData);
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
          name="LetterheadPreview" 
          component={LetterheadPreviewScreen}
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
