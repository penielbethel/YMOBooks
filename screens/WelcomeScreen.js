import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
  Linking,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';

const { width } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  const [refreshing, setRefreshing] = useState(false);
  const [businessTypeModalVisible, setBusinessTypeModalVisible] = useState(false);

  const features = [
    {
      icon: 'document-text-outline',
      title: 'Invoices',
      description: 'Create professional invoices instantly',
      color: '#4F46E5'
    },
    {
      icon: 'receipt-outline',
      title: 'Receipts',
      description: 'Manage digital receipts easily',
      color: '#10B981'
    },
    {
      icon: 'calculator-outline',
      title: 'Calculator',
      description: 'Financial tools at your fingertips',
      color: '#F59E0B'
    },
    {
      icon: 'briefcase-outline',
      title: 'Branding',
      description: 'Custom logo & signature support',
      color: '#8B5CF6'
    }
  ];

  const businessTypes = [
    {
      id: 'printing_press',
      title: 'Printing PRESS Company',
      icon: 'print-outline',
      description: 'For printing and publishing businesses',
      color: '#D97706' // amber
    },
    {
      id: 'manufacturing',
      title: 'Production / Manufacturing',
      icon: 'construct-outline',
      description: 'For factories and production lines',
      color: '#059669' // emerald
    },
    {
      id: 'general_merchandise',
      title: 'General Merchandise',
      icon: 'storefront-outline',
      description: 'For retail, wholesale, and general trading',
      color: '#2563EB' // blue
    }
  ];

  const handleWhatsApp = () => {
    // WhatsApp direct link (Nigeria +234 for 08169114903)
    const url = 'https://wa.me/2348169114903?text=Hello%20YMOBooks%20Help%20Desk';
    Linking.openURL(url).catch(() => { });
  };

  const onSelectBusinessType = (type) => {
    setBusinessTypeModalVisible(false);
    navigation.navigate('CompanyRegistration', { businessType: type });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 400);
            }}
            tintColor={Colors.primary}
          />
        }
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.logoContainer}>
            <Image
              source={require('../logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.appName}>YMOBooks</Text>
          <Text style={styles.tagline}>
            Smart Financial Management for Your Business
          </Text>
        </View>

        {/* Action Buttons - Moved to top for better UX */}
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => setBusinessTypeModalVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Get Started</Text>
            <Ionicons name="arrow-forward" size={20} color={Colors.white} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>I have an Account</Text>
          </TouchableOpacity>
        </View>

        {/* Features Grid */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionHeader}>Why Choose YMOBooks?</Text>
          <View style={styles.gridContainer}>
            {features.map((feature, index) => (
              <View key={index} style={styles.gridItem}>
                <View style={[styles.iconContainer, { backgroundColor: feature.color + '15' }]}>
                  <Ionicons name={feature.icon} size={28} color={feature.color} />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Floating WhatsApp Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={handleWhatsApp}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-whatsapp" size={32} color="white" />
      </TouchableOpacity>

      {/* Business Type Selection Modal */}
      <Modal
        visible={businessTypeModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setBusinessTypeModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setBusinessTypeModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={styles.modalContent}
            onPress={e => e.stopPropagation()}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Business Type</Text>
              <TouchableOpacity onPress={() => setBusinessTypeModalVisible(false)}>
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>
              Choose the category that best fits your company.
            </Text>

            <View style={styles.typeList}>
              {businessTypes.map((type) => (
                <TouchableOpacity
                  key={type.id}
                  style={styles.typeCard}
                  onPress={() => onSelectBusinessType(type.id)}
                >
                  <View style={[styles.typeIconBox, { backgroundColor: type.color + '20' }]}>
                    <Ionicons name={type.icon} size={28} color={type.color} />
                  </View>
                  <View style={styles.typeInfo}>
                    <Text style={styles.typeTitle}>{type.title}</Text>
                    <Text style={styles.typeDescription}>{type.description}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  },
  heroSection: {
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    backgroundColor: Colors.surface,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 5,
    marginBottom: Spacing.xl,
  },
  logoContainer: {
    width: 100,
    height: 100,
    backgroundColor: Colors.white,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  logo: {
    width: 70,
    height: 70,
  },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.primary,
    marginBottom: Spacing.xs,
    letterSpacing: 0.5,
  },
  tagline: {
    fontSize: Fonts.sizes.md,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.md,
    lineHeight: 22,
  },
  actionContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
    gap: Spacing.md,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    gap: 8,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  featuresSection: {
    paddingHorizontal: Spacing.lg,
  },
  sectionHeader: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.lg,
    marginLeft: Spacing.xs,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  gridItem: {
    width: (width - (Spacing.lg * 2) - Spacing.md) / 2,
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  featureDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
  },
  footerSpacing: {
    height: 100, // Space for FAB
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 25,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#25D366',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.xl,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  modalSubtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: Spacing.lg,
  },
  typeList: {
    gap: Spacing.md,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    padding: Spacing.md,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  typeIconBox: {
    width: 50,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  typeInfo: {
    flex: 1,
  },
  typeTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 2,
  },
  typeDescription: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
});

export default WelcomeScreen;