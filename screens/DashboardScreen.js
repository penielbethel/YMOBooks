import React, { useState, useMemo, useCallback, memo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { InteractionManager } from 'react-native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';

const MenuItem = memo(({ item, onPress }) => (
  <TouchableOpacity
    style={styles.menuItem}
    onPress={() => onPress(item.id)}
  >
    <View style={[styles.menuIcon, { backgroundColor: item.color }]}>
      <Text style={styles.menuIconText}>{item.icon}</Text>
    </View>
    <Text style={styles.menuTitle}>{item.title}</Text>
    <Text style={styles.menuDescription}>{item.description}</Text>
  </TouchableOpacity>
));

const DashboardScreen = ({ navigation }) => {
  const [companyData, setCompanyData] = useState(null);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadCompanyData();
      });
      return () => task.cancel();
    }, [])
  );

  const loadCompanyData = async () => {
    try {
      const data = await AsyncStorage.getItem('companyData');
      if (data) {
        setCompanyData(JSON.parse(data));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load company data');
    }
  };

  const menuItems = useMemo(() => ([
    {
      id: 'invoice',
      title: 'Create Invoice',
      description: 'Generate professional invoices',
      icon: '📄',
      color: Colors.primary
    },
    {
      id: 'history',
      title: 'Invoice History',
      description: 'View invoices from the last 6 months',
      icon: '🗂️',
      color: Colors.success
    },
    {
      id: 'calculator',
      title: 'Financial Calculator',
      description: 'Perform financial calculations',
      icon: '🧮',
      color: Colors.success
    }
  ]), []);

  const handleMenuPress = useCallback((itemId) => {
    switch (itemId) {
      case 'invoice':
        navigation.navigate('TemplatePicker');
        break;
      case 'history':
        navigation.navigate('InvoiceHistory');
        break;
      case 'calculator':
        navigation.navigate('FinancialCalculator');
        break;
      default:
        // For other features, show coming soon alert
        Alert.alert('Coming Soon', `${itemId} feature will be available soon!`);
    }
  }, [navigation]);

  if (!companyData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {companyData.logo && (
              <Image 
                source={{ uri: companyData.logo }} 
                style={styles.companyLogo}
              />
            )}
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{companyData.companyName}</Text>
              <Text style={styles.welcomeText}>Welcome to YMOBooks</Text>
              <Text style={[styles.welcomeText, { fontWeight: '700', color: Colors.text }]}>ID: {companyData.companyId}</Text>
            </View>
            {/* Top-right hamburger for Global Options */}
            <TouchableOpacity style={styles.hamburgerButton} onPress={() => navigation.navigate('Settings')}>
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
              <View style={styles.hamburgerLine} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Company Details Card */}
        <View style={styles.companyCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Company Information</Text>
            <View style={styles.idBadge}>
              <Text style={styles.idBadgeText}>ID: {companyData.companyId}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📍 Address</Text>
            <Text style={styles.infoValue}>{companyData.address || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>✉️ Email</Text>
            <Text style={styles.infoValue}>{companyData.email || '—'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>📞 Phone</Text>
            <Text style={styles.infoValue}>{companyData.phoneNumber || '—'}</Text>
          </View>
          {companyData.signature && (
            <View style={[styles.infoRow, { alignItems: 'center' }]}> 
              <Text style={styles.infoLabel}>🖋️ Signature</Text>
              <Image 
                source={{ uri: companyData.signature }} 
                style={styles.signatureImage}
              />
            </View>
          )}
        </View>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          <Text style={styles.sectionTitle}>What would you like to do?</Text>
          <View style={styles.menuGrid}>
            {menuItems.map((item) => (
              <MenuItem key={item.id} item={item} onPress={handleMenuPress} />
            ))}
          </View>
        </View>

        {/* Removed duplicate Edit Company section; use top-right Settings */}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: Spacing.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: Fonts.sizes.lg,
    color: Colors.textSecondary,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  companyLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: Spacing.md,
  },
  companyInfo: {
    flex: 1,
  },
  hamburgerButton: {
    width: 36,
    height: 28,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingVertical: 2,
    marginLeft: Spacing.md,
  },
  hamburgerLine: {
    width: 28,
    height: 3,
    backgroundColor: Colors.white,
    borderRadius: 2,
  },
  companyName: {
    fontSize: Fonts.sizes.xl,
    fontWeight: Fonts.weights.bold,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  welcomeText: {
    fontSize: Fonts.sizes.md,
    color: Colors.white,
    opacity: 0.9,
  },
  companyCard: {
    backgroundColor: Colors.surface,
    margin: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: 0,
  },
  idBadge: {
    backgroundColor: Colors.accent,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  idBadgeText: {
    color: Colors.white,
    fontSize: Fonts.sizes.sm,
    fontWeight: Fonts.weights.semiBold,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.medium,
    color: Colors.text,
    width: 120,
  },
  infoValue: {
    fontSize: Fonts.sizes.md,
    color: Colors.text,
    flex: 1,
  },
  signatureContainer: {
    marginTop: Spacing.sm,
  },
  signatureImage: {
    width: 140,
    height: 64,
    marginTop: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuContainer: {
    paddingHorizontal: Spacing.lg,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.lg,
  },
  menuItem: {
    width: '48%',
    aspectRatio: 1,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: Spacing.md,
    marginBottom: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  menuIcon: {
    width: 64,
    height: 64,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  menuIconText: {
    fontSize: 32,
  },
  menuTitle: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
  menuDescription: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  
  
});

export default DashboardScreen;