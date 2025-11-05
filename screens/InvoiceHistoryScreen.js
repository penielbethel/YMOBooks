import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Linking, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { fetchInvoices, fetchReceipts, createReceipt } from '../utils/api';

const InvoiceHistoryScreen = ({ navigation, route }) => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [receiptsByInvoice, setReceiptsByInvoice] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const overrideId = route?.params?.companyId;
        let effectiveId = overrideId;
        if (!effectiveId) {
          const stored = await AsyncStorage.getItem('companyData');
          const parsed = stored ? JSON.parse(stored) : null;
          effectiveId = parsed?.companyId;
        }
        if (!effectiveId) {
          Alert.alert('Missing Company', 'Please register your company first');
          navigation.navigate('CompanyRegistration');
          return;
        }
        setCompanyId(effectiveId);
        const [invRes, rctRes] = await Promise.all([
          fetchInvoices(effectiveId, 6),
          fetchReceipts(effectiveId, 6),
        ]);
        if (invRes?.success) {
          setInvoices(invRes.invoices || []);
        } else {
          Alert.alert('Error', invRes?.message || 'Failed to load invoices');
        }
        if (rctRes?.success && Array.isArray(rctRes.receipts)) {
          const map = {};
          rctRes.receipts.forEach((r) => {
            if (r.invoiceNumber) map[r.invoiceNumber] = true;
          });
          setReceiptsByInvoice(map);
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load invoice history');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  const openPdf = async (item) => {
    if (!item?.pdfUrl) return;
    try {
      await Linking.openURL(item.pdfUrl);
    } catch {}
  };

  const onGenerateReceipt = async (item) => {
    if (!companyId) return Alert.alert('Missing Company', 'Company ID not found');
    try {
      const payload = {
        companyId,
        invoiceNumber: item.invoiceNumber,
        receiptDate: new Date().toISOString().slice(0,10),
        customer: item.customer || {},
        amountPaid: Number(item.grandTotal || 0),
      };
      const res = await createReceipt(payload);
      if (res?.success && res?.pdfUrl) {
        Alert.alert('Receipt Generated', 'Opening Receipt PDF...');
        await Linking.openURL(res.pdfUrl);
      } else {
        Alert.alert('Failed', res?.message || 'Could not generate receipt');
      }
    } catch (e) {
      Alert.alert('Error', 'Receipt generation failed');
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <TouchableOpacity style={styles.rowLeft} onPress={() => openPdf(item)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.invNumber}>{item.invoiceNumber}</Text>
          {receiptsByInvoice[item.invoiceNumber] ? (
            <View style={styles.paidPill}><Text style={styles.paidPillText}>PAID</Text></View>
          ) : null}
        </View>
        <Text style={styles.customerName}>{item?.customer?.name || 'Unknown Customer'}</Text>
      </TouchableOpacity>
      <View style={styles.rowRight}>
        <Text style={styles.amount}>₦ {Number(item.grandTotal || 0).toLocaleString()}</Text>
        <Text style={styles.dateText}>{dayjs(item.invoiceDate || item.createdAt).format('DD MMM, YYYY')}</Text>
        <TouchableOpacity style={styles.receiptBtn} onPress={() => onGenerateReceipt(item)}>
          <Text style={styles.receiptBtnText}>Receipt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Invoice History</Text>
        <Text style={styles.subtitle}>Showing up to 6 months of invoices{companyId ? ` · ${companyId}` : ''}</Text>
      </View>
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Loading invoices...</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={invoices}
          keyExtractor={(item) => item._id || item.invoiceNumber}
          renderItem={renderItem}
          ListEmptyComponent={() => (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No invoices found in the last 6 months.</Text>
            </View>
          )}
        />
      )}
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
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
  },
  backButtonText: {
    color: Colors.white,
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.medium,
  },
  title: {
    fontSize: Fonts.sizes.title,
    fontWeight: Fonts.weights.bold,
    color: Colors.white,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.white,
    opacity: 0.9,
  },
  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  row: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowLeft: {
    flex: 1,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  invNumber: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.text,
  },
  customerName: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  amount: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.bold,
    color: Colors.text,
  },
  dateText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  receiptBtn: {
    marginTop: 6,
    backgroundColor: Colors.secondary,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  receiptBtnText: {
    color: Colors.white,
    fontWeight: Fonts.weights.semiBold,
    fontSize: Fonts.sizes.sm,
  },
  paidPill: {
    marginLeft: 8,
    backgroundColor: '#22c55e',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  paidPillText: {
    color: '#fff',
    fontSize: Fonts.sizes.xs,
    fontWeight: Fonts.weights.semiBold,
  },
  loadingBox: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  emptyBox: {
    padding: Spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
  },
});

export default InvoiceHistoryScreen;