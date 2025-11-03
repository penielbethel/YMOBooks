import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Alert
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LetterheadTemplate from '../components/LetterheadTemplate';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';

const LetterheadPreviewScreen = ({ navigation }) => {
  const [companyData, setCompanyData] = useState(null);

  useEffect(() => {
    loadCompanyData();
  }, []);

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

  const sampleInvoiceContent = (
    <View style={styles.documentContent}>
      <Text style={styles.documentTitle}>INVOICE</Text>
      
      <View style={styles.invoiceHeader}>
        <View style={styles.invoiceInfo}>
          <Text style={styles.invoiceNumber}>Invoice #: INV-001</Text>
          <Text style={styles.invoiceDate}>Date: {new Date().toLocaleDateString()}</Text>
          <Text style={styles.dueDate}>Due Date: {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString()}</Text>
        </View>
      </View>

      <View style={styles.billToSection}>
        <Text style={styles.sectionTitle}>Bill To:</Text>
        <Text style={styles.clientInfo}>Sample Client Name</Text>
        <Text style={styles.clientInfo}>123 Client Street</Text>
        <Text style={styles.clientInfo}>Client City, State 12345</Text>
        <Text style={styles.clientInfo}>client@email.com</Text>
      </View>

      <View style={styles.itemsTable}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderText, styles.descriptionColumn]}>Description</Text>
          <Text style={[styles.tableHeaderText, styles.quantityColumn]}>Qty</Text>
          <Text style={[styles.tableHeaderText, styles.priceColumn]}>Price</Text>
          <Text style={[styles.tableHeaderText, styles.totalColumn]}>Total</Text>
        </View>
        
        <View style={styles.tableRow}>
          <Text style={[styles.tableText, styles.descriptionColumn]}>Consulting Services</Text>
          <Text style={[styles.tableText, styles.quantityColumn]}>10</Text>
          <Text style={[styles.tableText, styles.priceColumn]}>$100.00</Text>
          <Text style={[styles.tableText, styles.totalColumn]}>$1,000.00</Text>
        </View>
        
        <View style={styles.tableRow}>
          <Text style={[styles.tableText, styles.descriptionColumn]}>Software License</Text>
          <Text style={[styles.tableText, styles.quantityColumn]}>1</Text>
          <Text style={[styles.tableText, styles.priceColumn]}>$500.00</Text>
          <Text style={[styles.tableText, styles.totalColumn]}>$500.00</Text>
        </View>
      </View>

      <View style={styles.totalsSection}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal:</Text>
          <Text style={styles.totalValue}>$1,500.00</Text>
        </View>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Tax (10%):</Text>
          <Text style={styles.totalValue}>$150.00</Text>
        </View>
        <View style={[styles.totalRow, styles.grandTotalRow]}>
          <Text style={styles.grandTotalLabel}>Total:</Text>
          <Text style={styles.grandTotalValue}>$1,650.00</Text>
        </View>
      </View>

      <View style={styles.notesSection}>
        <Text style={styles.notesTitle}>Notes:</Text>
        <Text style={styles.notesText}>
          Thank you for your business! Payment is due within 30 days of invoice date.
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Letterhead Preview</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.previewContainer}>
          <LetterheadTemplate 
            companyData={companyData} 
            showSignature={true}
          >
            {sampleInvoiceContent}
          </LetterheadTemplate>
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
  header: {
    backgroundColor: Colors.primary,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: Spacing.md,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.medium,
  },
  headerTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.bold,
    color: Colors.white,
  },
  scrollView: {
    flex: 1,
  },
  previewContainer: {
    margin: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: 8,
    shadowColor: Colors.black,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  documentContent: {
    padding: Spacing.lg,
  },
  documentTitle: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  invoiceHeader: {
    marginBottom: Spacing.lg,
  },
  invoiceInfo: {
    alignItems: 'flex-end',
  },
  invoiceNumber: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  invoiceDate: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  dueDate: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
  },
  billToSection: {
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  clientInfo: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  itemsTable: {
    marginBottom: Spacing.xl,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  tableHeaderText: {
    fontSize: Fonts.sizes.sm,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
  },
  tableText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
  },
  descriptionColumn: {
    flex: 2,
  },
  quantityColumn: {
    flex: 0.5,
    textAlign: 'center',
  },
  priceColumn: {
    flex: 1,
    textAlign: 'right',
  },
  totalColumn: {
    flex: 1,
    textAlign: 'right',
  },
  totalsSection: {
    alignItems: 'flex-end',
    marginBottom: Spacing.xl,
  },
  totalRow: {
    flexDirection: 'row',
    marginBottom: Spacing.xs,
    minWidth: 200,
    justifyContent: 'space-between',
  },
  grandTotalRow: {
    borderTopWidth: 1,
    borderColor: Colors.border,
    paddingTop: Spacing.xs,
    marginTop: Spacing.sm,
  },
  totalLabel: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
  },
  totalValue: {
    fontSize: Fonts.sizes.sm,
    color: Colors.text,
    fontWeight: Fonts.weights.medium,
  },
  grandTotalLabel: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.bold,
    color: Colors.text,
  },
  grandTotalValue: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.bold,
    color: Colors.primary,
  },
  notesSection: {
    marginTop: Spacing.lg,
  },
  notesTitle: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  notesText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});

export default LetterheadPreviewScreen;