import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Dimensions
} from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';

const { width } = Dimensions.get('window');

const LetterheadTemplate = ({ companyData, children, showSignature = false }) => {
  if (!companyData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No company data available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header Section */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          {/* Company Logo */}
          {companyData.logo && (
            <View style={styles.logoContainer}>
              <Image 
                source={{ uri: companyData.logo }} 
                style={styles.logo}
                resizeMode="contain"
              />
            </View>
          )}
          
          {/* Company Information */}
          <View style={styles.companyInfoContainer}>
            <Text style={styles.companyName}>{companyData.companyName}</Text>
            <Text style={styles.companyAddress}>{companyData.address}</Text>
            <View style={styles.contactInfo}>
              <Text style={styles.contactText}>Email: {companyData.email}</Text>
              <Text style={styles.contactText}>Phone: {companyData.phoneNumber}</Text>
            </View>
          </View>
        </View>
        
        {/* Decorative Line */}
        <View style={styles.decorativeLine} />
      </View>

      {/* Content Section */}
      <View style={styles.content}>
        {children}
      </View>

      {/* Footer Section with Signature */}
      {showSignature && companyData.signature && (
        <View style={styles.footer}>
          <View style={styles.signatureSection}>
            <Text style={styles.signatureLabel}>Authorized Signature:</Text>
            <Image 
              source={{ uri: companyData.signature }} 
              style={styles.signature}
              resizeMode="contain"
            />
            <View style={styles.signatureLine} />
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.white,
    minHeight: '100%',
  },
  errorText: {
    fontSize: Fonts.sizes.md,
    color: Colors.error,
    textAlign: 'center',
    margin: Spacing.lg,
  },
  header: {
    backgroundColor: Colors.white,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: Colors.primary,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  logoContainer: {
    marginRight: Spacing.md,
  },
  logo: {
    width: 80,
    height: 80,
  },
  companyInfoContainer: {
    flex: 1,
  },
  companyName: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  companyAddress: {
    fontSize: Fonts.sizes.md,
    color: Colors.text,
    marginBottom: Spacing.sm,
    lineHeight: 20,
  },
  contactInfo: {
    marginTop: Spacing.xs,
  },
  contactText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  decorativeLine: {
    height: 3,
    backgroundColor: Colors.primary,
    marginTop: Spacing.md,
    borderRadius: 2,
  },
  content: {
    flex: 1,
    padding: Spacing.lg,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    marginTop: Spacing.xl,
  },
  signatureSection: {
    alignItems: 'flex-end',
    marginTop: Spacing.xl,
  },
  signatureLabel: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  signature: {
    width: 150,
    height: 75,
    marginBottom: Spacing.xs,
  },
  signatureLine: {
    width: 150,
    height: 1,
    backgroundColor: Colors.border,
  },
});

export default LetterheadTemplate;