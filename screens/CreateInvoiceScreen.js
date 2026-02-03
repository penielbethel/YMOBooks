import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, Alert, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { createInvoice } from '../utils/api';
import { Linking } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import { buildInvoiceHtml } from '../utils/invoiceHtml';

const emptyItem = { description: '', qty: '1', price: '0' };

const CreateInvoiceScreen = ({ navigation }) => {
  const [invoice, setInvoice] = useState({
    customerName: '',
    customerAddress: '',
    contact: '',
    invoiceDate: new Date(),
    dueDate: new Date(),
  });
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [loading, setLoading] = useState(false);
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);
  const webviewRef = useRef(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        if (stored) setCompanyData(JSON.parse(stored));
      } catch (_) { }
    })();
  }, []);

  const updateInvoice = (field, value) => setInvoice(prev => ({ ...prev, [field]: value }));
  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem('companyData');
      const companyData = stored ? JSON.parse(stored) : null;
      if (!companyData?.companyId) {
        Alert.alert('Not logged in', 'Please login to your company account');
        return;
      }

      // Ensure we have logo/signature if they are missing (e.g. from optimized storage)
      let fullCompanyData = { ...companyData };
      if ((!fullCompanyData.logo || !fullCompanyData.signature) && companyData.companyId) {
        try {
          // try cache first for logo
          if (!fullCompanyData.logo) {
            const cachedLogo = await AsyncStorage.getItem('companyLogoCache');
            if (cachedLogo) fullCompanyData.logo = cachedLogo;
          }

          // if still missing either, fetch from server
          if (!fullCompanyData.logo || !fullCompanyData.signature) {
            // Only fetch if we really need to (to avoid network delay if not needed)
            if (companyData.hasLogo || companyData.hasSignature) { // Optimization flags from Login
              const fetched = await import('../utils/api').then(m => m.fetchCompany(companyData.companyId));
              if (fetched?.company) {
                fullCompanyData = { ...fullCompanyData, ...fetched.company };
                // Update cache for next time? Maybe not the full data to avoid storage bloat, but maybe logo cache
                if (fetched.company.logo) {
                  AsyncStorage.setItem('companyLogoCache', fetched.company.logo).catch(() => { });
                }
              }
            } else {
              // Even if no flags, try once just in case
              const fetched = await import('../utils/api').then(m => m.fetchCompany(companyData.companyId));
              if (fetched?.company) {
                fullCompanyData = { ...fullCompanyData, ...fetched.company };
              }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch full company details', e);
        }
      }

      const companyCurrencySymbol = fullCompanyData?.currencySymbol || '$';

      // Generate Local PDF for immediate preview
      const invoiceData = {
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerContact: invoice.contact,
        // Generate a temp number or let server assign (for local preview we use temp)
        invoiceNumber: `INV-${Date.now()}`
      };

      const html = buildInvoiceHtml({
        company: fullCompanyData,
        invoice: invoiceData,
        items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
        template: fullCompanyData?.invoiceTemplate || 'classic',
        brandColor: fullCompanyData?.brandColor,
        currencySymbol: companyCurrencySymbol
      });

      const { uri } = await Print.printToFileAsync({ html });
      setPreviewUrl(uri);
      setPreviewVisible(true);

      // Sync with server
      const payload = {
        companyId: companyData.companyId,
        template: companyData?.invoiceTemplate,
        brandColor: companyData?.brandColor,
        currencySymbol: companyCurrencySymbol,
        invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10),
        dueDate: invoice.dueDate?.toISOString().slice(0, 10),
        customer: {
          name: invoice.customerName,
          address: invoice.customerAddress,
          contact: invoice.contact,
        },
        items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
      };

      // We don't block the UI heavily for this, but we await to ensure it succeeds
      createInvoice(payload).catch(err => console.warn('Background sync failed', err));

    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Invoice generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!previewUrl) return;
    try {
      setDownloading(true);
      console.log('[Download] Starting download for previewUrl:', previewUrl);
      const fileNameGuess = previewUrl.split('/').pop() || `invoice-${Date.now()}.pdf`;
      const filename = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
      const tempUri = `${baseDir}${filename}`;
      console.log('[Download] tempUri:', tempUri);
      const dl = await FileSystemLegacy.downloadAsync(previewUrl, tempUri);
      console.log('[Download] Downloaded to temp:', dl?.uri);
      if (Platform.OS === 'android') {
        try {
          const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          console.log('[Download][Android] SAF permission:', perm);
          if (perm.granted && perm.directoryUri) {
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, filename, 'application/pdf');
            console.log('[Download][Android] SAF created fileUri:', fileUri);
            const base64 = await FileSystemLegacy.readAsStringAsync(dl.uri, { encoding: 'base64' });
            await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
            Alert.alert('Saved', 'Invoice PDF saved to selected folder.');
          } else {
            console.log('[Download][Android] SAF not granted, opening from cache');
            const contentUri = await FileSystem.getContentUriAsync(dl.uri);
            console.log('[Download][Android] contentUri:', contentUri);
            await Linking.openURL(contentUri);
          }
        } catch (e) {
          console.warn('[Download][Android] SAF write failed:', e?.message || e);
          try {
            const contentUri = await FileSystem.getContentUriAsync(dl.uri);
            console.log('[Download][Android] Fallback contentUri:', contentUri);
            await Linking.openURL(contentUri);
          } catch (openErr) {
            console.error('[Download][Android] Fallback open failed:', openErr?.message || openErr);
          }
        }
      } else {
        console.log('[Download][iOS/Web] Opening temp file');
        await Linking.openURL(dl.uri);
      }
    } catch (e) {
      console.error('[Download] Download failed:', e?.message || e);
      Alert.alert('Download failed', String(e?.message || 'Could not save invoice to device'));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Invoice</Text>
        <Text style={styles.subtitle}>Generate a downloadable A4 invoice</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!!companyData?.invoiceTemplate && (
            <View style={styles.usingTemplateBox}>
              <Text style={styles.usingTemplateText}>
                Using Template: {String(companyData.invoiceTemplate).charAt(0).toUpperCase() + String(companyData.invoiceTemplate).slice(1)}
              </Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>Customer</Text>
          <TextInput style={styles.input} placeholder="Name" placeholderTextColor={Colors.textSecondary} value={invoice.customerName} onChangeText={(t) => updateInvoice('customerName', t)} />
          <TextInput style={[styles.input, styles.textArea]} placeholder="Address" placeholderTextColor={Colors.textSecondary} value={invoice.customerAddress} onChangeText={(t) => updateInvoice('customerAddress', t)} multiline />
          <TextInput style={styles.input} placeholder="Email or Phone (optional)" placeholderTextColor={Colors.textSecondary} value={invoice.contact} onChangeText={(t) => updateInvoice('contact', t)} />

          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={styles.dateRow}>
            <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowInvoiceDatePicker(true)}>
              <Text style={styles.dateText}>Issuance Date: {invoice.invoiceDate?.toISOString().slice(0, 10)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowDueDatePicker(true)}>
              <Text style={styles.dateText}>Due Date: {invoice.dueDate?.toISOString().slice(0, 10)}</Text>
            </TouchableOpacity>
          </View>
          {showInvoiceDatePicker && (
            <DateTimePicker value={invoice.invoiceDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowInvoiceDatePicker(false); if (d) updateInvoice('invoiceDate', d); }} />
          )}
          {showDueDatePicker && (
            <DateTimePicker value={invoice.dueDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowDueDatePicker(false); if (d) updateInvoice('dueDate', d); }} />
          )}

          <Text style={styles.sectionTitle}>Items</Text>
          {items.map((it, idx) => (
            <View key={idx} style={styles.itemRow}>
              <TextInput style={[styles.input, styles.itemDesc]} placeholder="Description" placeholderTextColor={Colors.textSecondary} value={it.description} onChangeText={(t) => updateItem(idx, 'description', t)} />
              <TextInput style={[styles.input, styles.itemQty]} placeholder="Qty" placeholderTextColor={Colors.textSecondary} keyboardType="number-pad" value={it.qty} onChangeText={(t) => updateItem(idx, 'qty', t)} />
              <TextInput style={[styles.input, styles.itemPrice]} placeholder="Price" placeholderTextColor={Colors.textSecondary} keyboardType="decimal-pad" value={it.price} onChangeText={(t) => updateItem(idx, 'price', t)} />
              <TouchableOpacity style={styles.removeButton} onPress={() => removeItem(idx)}>
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity style={styles.addButton} onPress={addItem}><Text style={styles.addButtonText}>+ Add Item</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.generateButton, loading && styles.generateButtonDisabled]} disabled={loading} onPress={handleGenerate}>
            <Text style={styles.generateButtonText}>{loading ? 'Generating...' : 'Generate Invoice'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Preview Modal */}
      <Modal visible={!!previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => setPreviewVisible(false)}>
              <Text style={styles.backButtonText}>← Close</Text>
            </TouchableOpacity>
            <Text style={styles.title}>Invoice Preview</Text>
            <Text style={styles.subtitle}>Review, then Download or Print</Text>
          </View>
          <View style={styles.previewBody}>
            {previewUrl ? (
              <WebView
                ref={webviewRef}
                source={{ uri: previewUrl }}
                startInLoadingState
                renderLoading={() => (
                  <View style={styles.previewLoading}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingHint}>Loading preview…</Text>
                  </View>
                )}
                style={styles.webview}
              />
            ) : (
              <View style={styles.previewLoading}>
                <ActivityIndicator size="large" color={Colors.primary} />
              </View>
            )}
          </View>
          <View style={styles.previewActions}>
            <TouchableOpacity style={[styles.actionBtn, styles.downloadBtn, downloading && { opacity: 0.6 }]} disabled={downloading} onPress={handleDownload}>
              <Text style={styles.actionText}>{downloading ? 'Downloading…' : 'Download'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.printBtn]}
              onPress={() => {
                try {
                  // Attempt in-webview print
                  webviewRef.current?.injectJavaScript('window.print(); true;');
                } catch (_) {
                  if (previewUrl) Linking.openURL(previewUrl);
                }
              }}
            >
              <Text style={styles.actionText}>Print</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backButtonText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium },
  title: { fontSize: Fonts.sizes.title, fontWeight: Fonts.weights.bold, color: Colors.white, marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.md, color: Colors.white, opacity: 0.9 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  usingTemplateBox: { backgroundColor: Colors.white, borderColor: Colors.border, borderWidth: 1, borderRadius: 8, padding: Spacing.md, marginTop: Spacing.md },
  usingTemplateText: { color: Colors.textSecondary },
  sectionTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.semiBold, color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Fonts.sizes.md, color: Colors.text, marginBottom: Spacing.sm },
  textArea: { height: 80, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1 },
  dateText: { color: Colors.text, fontSize: Fonts.sizes.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemDesc: { flex: 2 },
  itemQty: { flex: 0.7 },
  itemPrice: { flex: 1 },
  removeButton: { marginLeft: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.error, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  removeButtonText: { color: Colors.error, fontWeight: Fonts.weights.bold },
  addButton: { backgroundColor: Colors.white, borderColor: Colors.secondary, borderWidth: 1, borderRadius: 8, padding: Spacing.md, alignSelf: 'flex-start', marginVertical: Spacing.sm },
  addButtonText: { color: Colors.secondary, fontWeight: Fonts.weights.semiBold },
  generateButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.lg, borderRadius: 8, alignItems: 'center', marginTop: Spacing.lg },
  generateButtonDisabled: { opacity: 0.6 },
  generateButtonText: { color: Colors.white, fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold },
  previewBody: { flex: 1, backgroundColor: Colors.background },
  webview: { flex: 1 },
  previewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingHint: { marginTop: Spacing.sm, color: Colors.textSecondary },
  previewActions: { flexDirection: 'row', gap: 12, padding: Spacing.md, backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.border, justifyContent: 'flex-end' },
  actionBtn: { paddingVertical: Spacing.md, paddingHorizontal: Spacing.lg, borderRadius: 8 },
  downloadBtn: { backgroundColor: Colors.secondary },
  printBtn: { backgroundColor: Colors.primary },
  actionText: { color: Colors.white, fontWeight: Fonts.weights.bold },
});

export default CreateInvoiceScreen;