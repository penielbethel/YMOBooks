import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Linking, SafeAreaView, ActivityIndicator, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { fetchInvoices } from '../utils/api';

const InvoiceHistoryScreen = ({ navigation, route }) => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [companyId, setCompanyId] = useState(null);

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
        const res = await fetchInvoices(effectiveId, 6);
        if (res?.success) {
          setInvoices(res.invoices || []);
        } else {
          Alert.alert('Error', res?.message || 'Failed to load invoices');
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

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.row} onPress={() => openPdf(item)}>
      <View style={styles.rowLeft}>
        <Text style={styles.invNumber}>{item.invoiceNumber}</Text>
        <Text style={styles.customerName}>{item?.customer?.name || 'Unknown Customer'}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.amount}>₦ {Number(item.grandTotal || 0).toLocaleString()}</Text>
        <Text style={styles.dateText}>{dayjs(item.invoiceDate || item.createdAt).format('DD MMM, YYYY')}</Text>
      </View>
    </TouchableOpacity>
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