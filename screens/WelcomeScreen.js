import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Dimensions
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';

const { width, height } = Dimensions.get('window');

const WelcomeScreen = ({ navigation }) => {
  const features = [
    {
      icon: '📄',
      title: 'Create Professional Invoices',
      description: 'Generate beautiful, professional invoices with your company letterhead'
    },
    {
      icon: '🧾',
      title: 'Digital Receipts',
      description: 'Create and manage digital receipts for all your transactions'
    },
    {
      icon: '📊',
      title: 'Financial Calculations',
      description: 'Perform complex financial calculations with ease and accuracy'
    },
    {
      icon: '🏢',
      title: 'Company Branding',
      description: 'Customize all documents with your company logo and signature'
    },
    {
      icon: '📱',
      title: 'Cross-Platform',
      description: 'Access your financial tools on any device, anywhere'
    },
    {
      icon: '🔒',
      title: 'Secure & Reliable',
      description: 'Your financial data is protected with enterprise-grade security'
    }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header Section */}
        <View style={styles.header}>
          <Image 
            source={require('../logo.png')} 
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>YMOBooks</Text>
          <Text style={styles.subtitle}>
            Your Complete Financial Management Solution
          </Text>
        </View>

        {/* Features Section */}
        <View style={styles.featuresContainer}>
          <Text style={styles.sectionTitle}>What You Can Do</Text>
          {features.map((feature, index) => (
            <View key={index} style={styles.featureCard}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Call to Action */}
        <View style={styles.ctaContainer}>
          <Text style={styles.ctaText}>
            Ready to streamline your financial operations?
          </Text>
          <TouchableOpacity 
            style={styles.registerButton}
            onPress={() => navigation.navigate('CompanyRegistration')}
          >
            <Text style={styles.registerButtonText}>REGISTER YOUR COMPANY</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={() => navigation.navigate('Login')}
          >
            <Text style={styles.loginButtonText}>LOGIN WITH COMPANY ID</Text>
          </TouchableOpacity>
          
          <Text style={styles.footerText}>
            Get started in less than 5 minutes
          </Text>
        </View>
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
  header: {
    alignItems: 'center',
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xxl,
    backgroundColor: Colors.primary,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: Fonts.sizes.header,
    fontWeight: Fonts.weights.bold,
    color: Colors.white,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: Fonts.sizes.lg,
    color: Colors.white,
    textAlign: 'center',
    opacity: 0.9,
  },
  featuresContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    borderRadius: 12,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: Spacing.md,
    alignSelf: 'flex-start',
  },
  featureContent: {
    flex: 1,
  },
  featureTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  featureDescription: {
    fontSize: Fonts.sizes.md,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  ctaContainer: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xxl,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: Fonts.sizes.lg,
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.xl,
    fontWeight: Fonts.weights.medium,
  },
  registerButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: Spacing.md,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
    width: '100%',
  },
  registerButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.bold,
    letterSpacing: 1,
  },
  loginButtonText: {
    color: Colors.primary,
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.bold,
    letterSpacing: 1,
  },
  footerText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    textAlign: 'center',
  },
});

export default WelcomeScreen;