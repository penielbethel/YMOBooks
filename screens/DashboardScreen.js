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
  Alert,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { Ionicons } from '@expo/vector-icons';
import { getApiBaseUrl, resolveAssetUri } from '../utils/api';

const MenuItem = memo(({ item, onPress, showProBadge }) => (
  <TouchableOpacity style={styles.menuItem} onPress={() => onPress(item.id)}>
    <View style={styles.iconWrapper}>
      <View style={[styles.menuIcon, { backgroundColor: item.tint }]}>
        <Ionicons name={item.icon} size={26} color={Colors.white} />
      </View>
      {item.isPro && showProBadge && <View style={styles.proBadge}><Text style={styles.proBadgeText}>PRO</Text></View>}
    </View>
    <Text style={styles.menuTitle}>{item.title}</Text>
    <Text style={styles.menuDescription}>{item.description}</Text>
  </TouchableOpacity>
));

const DashboardScreen = ({ navigation }) => {
  const [companyData, setCompanyData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadCompanyData();
      });
      return () => task.cancel();
    }, [])
  );

  // Check currency/location notification on load
  React.useEffect(() => {
    if (companyData?.companyId) {
      checkCurrencyPrompt(companyData.companyId);
    }
  }, [companyData]);

  const checkCurrencyPrompt = async (cId) => {
    try {
      const key = `currencyPromptLastShown_${cId}`;
      const lastShown = await AsyncStorage.getItem(key);
      const now = Date.now();
      const twoWeeks = 14 * 24 * 60 * 60 * 1000;

      if (!lastShown || (now - parseInt(lastShown) > twoWeeks)) {
        Alert.alert(
          "Action Required: Verify Currency & Location",
          "For accurate invoicing and financial reports, you must verify your Country and Currency settings.\n\nIt is mandatory to check this every 2 weeks.\n\n1. You will be redirected to Settings.\n2. Scroll down to 'Update Currency and Location'.\n3. Confirm/Update your Country and click Save.",
          [
            {
              text: "Go to Settings Now",
              onPress: async () => {
                await AsyncStorage.setItem(key, now.toString());
                navigation.navigate('Settings');
              }
            }
          ],
          { cancelable: false }
        );
      }
    } catch (e) {
      console.warn('Currency prompt check failed:', e);
    }
  };

  const loadCompanyData = async () => {
    try {
      const stored = await AsyncStorage.getItem('companyData');
      if (!stored) return;
      let parsed = JSON.parse(stored);
      setCompanyData(parsed);

      // On-demand fetch for missing logo/signature to ensure dashboard looks complete
      if ((!parsed.logo || !parsed.signature) && parsed.companyId) {
        if (parsed.hasLogo || parsed.hasSignature) {
          try {
            const { getApiBaseUrl } = await import('../utils/api');
            const resp = await fetch(`${getApiBaseUrl()}/api/company/${parsed.companyId}`);
            const json = await resp.json();
            const c = json?.company || json?.data;
            if (c) {
              const updated = { ...parsed, ...c };
              setCompanyData(updated);
              // Save back to AsyncStorage to make it permanent locally
              await AsyncStorage.setItem('companyData', JSON.stringify(updated)).catch(() => { });
              if (c.logo) await AsyncStorage.setItem('companyLogoCache', c.logo).catch(() => { });
            }
          } catch (e) {
            console.warn('[Dashboard] On-demand fetch failed:', e);
          }
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to load company data');
    }
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadCompanyData();
    } finally {
      setRefreshing(false);
    }
  }, []);

  const menuItems = useMemo(() => {
    const isManufacturing = companyData?.businessType === 'manufacturing';
    const isPrintingPress = companyData?.businessType === 'printing_press';

    // Printing Press has its own standalone framework — only show the 3 services
    if (isPrintingPress) {
      return [
        {
          id: 'large_format',
          title: 'Large Format',
          description: 'Banners, Flex & Stickers',
          icon: 'image-outline',
          tint: '#8B5CF6', // Purple
        },
        {
          id: 'di_printing',
          title: 'DI Printing',
          description: 'DI & Small Format',
          icon: 'print-outline',
          tint: '#EC4899', // Pink
        },
        {
          id: 'dtf_prints',
          title: 'DTF Prints',
          description: 'DTF & Apparel Prints',
          icon: 'shirt-outline',
          tint: '#F97316', // Orange
        },
        {
          id: 'photo_frames',
          title: 'Photo Frames',
          description: 'Frame Production & Mounting',
          icon: 'image',
          tint: '#10B981', // Emerald
        },
        {
          id: 'profit_loss',
          title: 'Overall P&L',
          description: 'Company-wide Financials',
          icon: 'bar-chart',
          tint: '#10B981', // Emerald
          isPro: true,
        },
      ];
    }

    // General Merchandise & Manufacturing share base items
    const items = [
      {
        id: 'invoice',
        title: 'Create Invoice',
        description: 'Generate professional invoices',
        icon: 'document-text-outline',
        tint: Colors.primary,
      },
      {
        id: 'history',
        title: 'Invoice History',
        description: 'View invoices from the last 6 months',
        icon: 'albums-outline',
        tint: Colors.success,
      }
    ];

    if (isManufacturing) {
      items.push({
        id: 'stock',
        title: 'Stock Manager',
        description: 'Manage materials and products',
        icon: 'cube-outline',
        tint: '#F59E0B', // Amber
        isPro: true,
      });
      items.push({
        id: 'profit_loss',
        title: 'Profit & Loss',
        description: 'Check business profitability',
        icon: 'bar-chart-outline',
        tint: '#10B981', // Emerald
        isPro: true,
      });
      items.push({
        id: 'balance_sheet',
        title: 'Wealth Statement',
        description: 'Balance Sheet & Assets',
        icon: 'briefcase-outline',
        tint: '#6366F1', // Indigo
        isPro: true,
      });
    } else {
      items.push({
        id: 'calculator',
        title: 'Financial Calculator',
        description: 'Perform financial calculations',
        icon: 'calculator-outline',
        tint: Colors.success,
        isPro: true,
      });
    }
    const isSuperAdmin = ['pbmsrvr', 'pbmsrv'].includes(companyData?.companyId?.toLowerCase());
    return items;
  }, [companyData]);

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
      case 'stock':
        navigation.navigate('StockManagement');
        break;
      case 'profit_loss':
        navigation.navigate('ProfitLoss');
        break;
      case 'balance_sheet':
        navigation.navigate('BalanceSheet');
        break;
      case 'large_format':
        navigation.navigate('PrintingService', { service: 'large_format' });
        break;
      case 'di_printing':
        navigation.navigate('PrintingService', { service: 'di_printing' });
        break;
      case 'dtf_prints':
        navigation.navigate('PrintingService', { service: 'dtf_prints' });
        break;
      case 'photo_frames':
        navigation.navigate('PrintingService', { service: 'photo_frames' });
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
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            {companyData.logo && (
              <Image
                source={{ uri: resolveAssetUri(companyData.logo) }}
                style={styles.companyLogo}
              />
            )}
            <View style={styles.companyInfo}>
              <Text style={styles.companyName}>{companyData.name || companyData.companyName}</Text>
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
            <Text style={styles.infoValue}>{companyData.phone || companyData.phoneNumber || '—'}</Text>
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
              <MenuItem
                key={item.id}
                item={item}
                onPress={handleMenuPress}
                showProBadge={!companyData?.isPremium && !['pbmsrvr', 'pbmsrv'].includes(companyData?.companyId?.toLowerCase())}
              />
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
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  // menuIconText removed in favor of vector icons
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
  iconWrapper: {
    position: 'relative',
    alignItems: 'center',
  },
  proBadge: {
    position: 'absolute',
    right: -8,
    top: -8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.white,
  },
  proBadgeText: {
    fontSize: 9,
    color: Colors.white,
    fontWeight: 'bold'
  },


});

export default DashboardScreen;