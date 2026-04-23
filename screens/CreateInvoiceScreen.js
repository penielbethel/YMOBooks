import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, Alert, KeyboardAvoidingView, Platform, Modal, ActivityIndicator } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { createInvoice } from '../utils/api';
import { Linking } from 'react-native';
import { Config } from '../constants/Config';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import { buildInvoiceHtml } from '../utils/invoiceHtml';

const emptyItem = { description: '', qty: '1', price: '0' };
const CreateInvoiceScreen = ({ navigation, route }) => {
  const [invoice, setInvoice] = useState({
    customerName: '',
    customerAddress: '',
    contact: '',
    invoiceDate: new Date(),
    dueDate: new Date(),
    category: route?.params?.category || 'general'
  });
  const [items, setItems] = useState([{ ...emptyItem }]);
  const [loading, setLoading] = useState(false);
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);

  // Reload company data whenever screen is focused (fixing stale data issue)
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const stored = await AsyncStorage.getItem('companyData');
          if (stored) {
            const parsed = JSON.parse(stored);
            setCompanyData(parsed);
          }
        } catch (_) { }
      })();
    }, [])
  );

  const updateInvoice = (field, value) => setInvoice(prev => ({ ...prev, [field]: value }));
  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [...prev, { ...emptyItem }]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const totalAmount = useMemo(() => {
    return items.reduce((sum, item) => {
      const q = parseFloat(item.qty) || 0;
      const p = parseFloat(item.price) || 0;
      return sum + (q * p);
    }, 0);
  }, [items]);

  const currencySymbol = companyData?.currencySymbol || '$';

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem('companyData');
      const companyData = stored ? JSON.parse(stored) : null;
      if (!companyData?.companyId) {
        Alert.alert('Not logged in', 'Please login to your company account');
        return;
      }

      let fullCompanyData = { ...companyData };
      if ((!fullCompanyData.logo || !fullCompanyData.signature) && companyData.companyId) {
        try {
          if (!fullCompanyData.logo) {
            const cachedLogo = await AsyncStorage.getItem('companyLogoCache');
            if (cachedLogo) fullCompanyData.logo = cachedLogo;
          }
          if (!fullCompanyData.logo || !fullCompanyData.signature) {
            const fetched = await import('../utils/api').then(m => m.fetchCompany(companyData.companyId));
            if (fetched?.company) {
              fullCompanyData = { ...fullCompanyData, ...fetched.company };
              if (fetched.company.logo) {
                AsyncStorage.setItem('companyLogoCache', fetched.company.logo).catch(() => { });
              }
            }
          }
        } catch (e) {
          console.warn('Failed to fetch full company details', e);
        }
      }

      const invoiceData = {
        invoiceDate: invoice.invoiceDate,
        dueDate: invoice.dueDate,
        customerName: invoice.customerName,
        customerAddress: invoice.customerAddress,
        customerContact: invoice.contact,
        invoiceNumber: `INV-${Date.now()}`
      };

      const html = buildInvoiceHtml({
        company: fullCompanyData,
        invoice: invoiceData,
        items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
        template: fullCompanyData?.invoiceTemplate || 'classic',
        brandColor: fullCompanyData?.brandColor,
        currencySymbol
      });

      if (Platform.OS === 'web') {
        const payload = {
          companyId: companyData.companyId,
          businessType: companyData.businessType || 'general_merchandise',
          template: companyData?.invoiceTemplate,
          brandColor: companyData?.brandColor,
          currencySymbol,
          invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10),
          dueDate: invoice.dueDate?.toISOString().slice(0, 10),
          customer: {
            name: invoice.customerName,
            address: invoice.customerAddress,
            contact: invoice.contact,
          },
          items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
          category: invoice.category,
        };

        const res = await createInvoice(payload);
        if (res?.pdfPath) {
          const downloadUrl = `${Config.API_BASE_URL}/api/download-invoice?pdfPath=${encodeURIComponent(res.pdfPath)}&filename=${encodeURIComponent(res.filename || 'invoice.pdf')}`;
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = res.filename || 'invoice.pdf';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } else {
          Alert.alert('Error', 'Failed to generate PDF on server');
        }
      } else {
        // Mobile workflow: Show preview first
        const html = buildInvoiceHtml({
          company: companyData,
          invoice: {
            ...invoice,
            invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10),
            dueDate: invoice.dueDate?.toISOString().slice(0, 10),
            invoiceNumber: `INV-${Date.now()}` // Temporary for preview
          },
          items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
          template: companyData?.invoiceTemplate || 'classic',
          brandColor: companyData?.brandColor,
          currencySymbol
        });
        setPreviewHtml(html);
        setPreviewUrl(null);
        setPreviewVisible(true);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Invoice generation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalShare = async () => {
    try {
      setLoading(true);
      const payload = {
        companyId: companyData.companyId,
        businessType: companyData.businessType || 'general_merchandise',
        template: companyData?.invoiceTemplate,
        brandColor: companyData?.brandColor,
        currencySymbol,
        invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10),
        dueDate: invoice.dueDate?.toISOString().slice(0, 10),
        customer: {
          name: invoice.customerName,
          address: invoice.customerAddress,
          contact: invoice.contact,
        },
        items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
        category: invoice.category,
      };

      const res = await createInvoice(payload);
      if (res?.success && res.pdfUrl) {
        const fileName = res.filename || `INV_${Date.now()}.pdf`;
        const tempUri = `${FileSystem.cacheDirectory}${fileName}`;
        const dl = await FileSystem.downloadAsync(res.pdfUrl, tempUri);
        if (dl.uri) {
          await Sharing.shareAsync(dl.uri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
          setPreviewUrl(dl.uri);
          Alert.alert('Success', 'Invoice created and shared!');
        }
      } else {
        Alert.alert('Error', 'Failed to register invoice on server');
      }
    } catch (err) {
      Alert.alert('Error', 'Sharing failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS !== 'web' && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <View>
            <Text style={styles.title}>New Invoice</Text>
            <Text style={styles.subtitle}>Create professional invoice</Text>
          </View>
        </View>
      )}

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>ESTIMATED TOTAL</Text>
                <Text style={styles.summaryValue}>{currencySymbol}{totalAmount.toFixed(2)}</Text>
              </View>
              <View style={styles.iconCircle}>
                <Ionicons name="receipt-outline" size={24} color={Colors.primary} />
              </View>
            </View>
            {!!companyData?.invoiceTemplate && (
              <View style={styles.templateBadge}>
                <Text style={styles.templateText}>Template: {companyData.invoiceTemplate.toUpperCase()}</Text>
              </View>
            )}
          </View>

          {/* Section: Customer */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="person-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Customer Details</Text>
            </View>
            <TextInput style={styles.input} placeholder="Client Name" placeholderTextColor={Colors.textSecondary} value={invoice.customerName} onChangeText={(t) => updateInvoice('customerName', t)} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="Billing Address" placeholderTextColor={Colors.textSecondary} value={invoice.customerAddress} onChangeText={(t) => updateInvoice('customerAddress', t)} multiline />
            <TextInput style={styles.input} placeholder="Contact (Email/Phone)" placeholderTextColor={Colors.textSecondary} value={invoice.contact} onChangeText={(t) => updateInvoice('contact', t)} />
          </View>

          {/* Section: Category (Printing Press Only) */}
          {companyData?.businessType === 'printing_press' && (
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Ionicons name="pricetag-outline" size={20} color={Colors.primary} />
                <Text style={styles.sectionTitle}>Service Category</Text>
              </View>
              <View style={styles.categoryRow}>
                {[
                  { id: 'general', label: 'General' },
                  { id: 'large_format', label: 'Large Format' },
                  { id: 'di_printing', label: 'DI Printing' },
                  { id: 'dtf_prints', label: 'DTF Prints' },
                ].map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      invoice.category === cat.id && styles.activeCategoryChip,
                    ]}
                    onPress={() => updateInvoice('category', cat.id)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        invoice.category === cat.id && styles.activeCategoryChipText,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Section: Dates */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Key Dates</Text>
            </View>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateField} onPress={() => setShowInvoiceDatePicker(true)}>
                <Text style={styles.dateLabel}>Issued Date</Text>
                <Text style={styles.dateValue}>{invoice.invoiceDate?.toLocaleDateString('en-GB')}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} style={{ position: 'absolute', right: 10, bottom: 12 }} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateField} onPress={() => setShowDueDatePicker(true)}>
                <Text style={styles.dateLabel}>Due Date</Text>
                <Text style={styles.dateValue}>{invoice.dueDate?.toLocaleDateString('en-GB')}</Text>
                <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} style={{ position: 'absolute', right: 10, bottom: 12 }} />
              </TouchableOpacity>
            </View>
            {showInvoiceDatePicker && (
              <DateTimePicker value={invoice.invoiceDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowInvoiceDatePicker(false); if (d) updateInvoice('invoiceDate', d); }} />
            )}
            {showDueDatePicker && (
              <DateTimePicker value={invoice.dueDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowDueDatePicker(false); if (d) updateInvoice('dueDate', d); }} />
            )}
          </View>

          {/* Section: Items */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Ionicons name="list-outline" size={20} color={Colors.primary} />
              <Text style={styles.sectionTitle}>Line Items</Text>
            </View>

            {items.map((it, idx) => (
              <View key={idx} style={styles.itemContainer}>
                <View style={styles.itemHeaderRow}>
                  <Text style={styles.itemIndex}>#{idx + 1}</Text>
                  <TouchableOpacity onPress={() => removeItem(idx)}>
                    <Ionicons name="trash-outline" size={18} color={Colors.error} />
                  </TouchableOpacity>
                </View>
                <TextInput style={styles.inputS} placeholder="Item Description" placeholderTextColor={Colors.textSecondary} value={it.description} onChangeText={(t) => updateItem(idx, 'description', t)} />
                <View style={styles.itemRowInputs}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>Qty</Text>
                    <TextInput style={styles.inputS} keyboardType="numeric" value={it.qty} onChangeText={(t) => updateItem(idx, 'qty', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>Price</Text>
                    <TextInput style={styles.inputS} keyboardType="numeric" value={it.price} onChangeText={(t) => updateItem(idx, 'price', t)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.miniLabel}>Total</Text>
                    <Text style={styles.rowTotal}>{currencySymbol}{((parseFloat(it.qty) || 0) * (parseFloat(it.price) || 0)).toFixed(2)}</Text>
                  </View>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
              <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
              <Text style={styles.addItemText}>Add Another Item</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
          {/* Preview Modal */}
          <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
            <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
              <View style={{ backgroundColor: Colors.primary, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setPreviewVisible(false)}>
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>← Close</Text>
                </TouchableOpacity>
                <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>Invoice Preview</Text>
                <View style={{ width: 40 }} />
              </View>
              
              <View style={{ flex: 1, margin: 16, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 4 }}>
                <WebView originWhitelist={['*']} source={{ html: previewHtml }} style={{ flex: 1 }} />
              </View>

              <View style={{ padding: 16, gap: 12 }}>
                <TouchableOpacity 
                  style={{ backgroundColor: previewUrl ? Colors.primary : Colors.success, padding: 16, borderRadius: 12, alignItems: 'center' }}
                  onPress={handleFinalShare}
                  disabled={loading}
                >
                  <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>
                    {loading ? 'Processing...' : previewUrl ? 'Share Again' : 'Step 2: Create & Share'}
                  </Text>
                </TouchableOpacity>
              </View>
            </SafeAreaView>
          </Modal>

        </ScrollView>

        <View style={styles.footerActions}>
          <TouchableOpacity style={[styles.generateButton, loading && styles.disabledBtn]} disabled={loading} onPress={handleGenerate}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <>
                <Ionicons name="cloud-download-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.generateButtonText}>Generate & Download</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && {
      backgroundColor: '#f8fafc',
    })
  },
  header: {
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 40 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 5
  },
  backButton: { marginRight: 15, padding: 5 },
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  content: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1,
    ...(Platform.OS === 'web' && {
      maxWidth: 600,
      alignSelf: 'center',
      width: '100%',
      backgroundColor: Colors.white,
      minHeight: '100%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.05,
      shadowRadius: 20,
    })
  },

  summaryCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.03)'
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 1 },
  summaryValue: { fontSize: 32, fontWeight: '800', color: Colors.text, marginTop: 4 },
  iconCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  templateBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, alignSelf: 'flex-start', marginTop: 10 },
  templateText: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600' },

  sectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginLeft: 8 },

  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    marginBottom: 12
  },
  inputS: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: Colors.text,
    marginBottom: 8
  },
  textArea: { height: 80, textAlignVertical: 'top' },

  dateRow: { flexDirection: 'row', gap: 12 },
  dateField: { flex: 1, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 8, padding: 12, position: 'relative' },
  dateLabel: { fontSize: 11, color: Colors.textSecondary, marginBottom: 4 },
  dateValue: { fontSize: 14, fontWeight: '600', color: Colors.text },

  itemContainer: { backgroundColor: '#FAFAFA', padding: 12, borderRadius: 8, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: Colors.primary },
  itemHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  itemIndex: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },
  itemRowInputs: { flexDirection: 'row', gap: 10 },
  miniLabel: { fontSize: 10, color: Colors.textSecondary, marginBottom: 2 },
  rowTotal: { fontSize: 14, fontWeight: '700', color: Colors.text, marginTop: 10 },

  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderStyle: 'dashed', borderWidth: 1, borderColor: Colors.primary, borderRadius: 8, marginTop: 8 },
  addItemText: { color: Colors.primary, fontWeight: '600', marginLeft: 6 },

  footerActions: {
    padding: 20,
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0
  },
  generateButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4
  },
  disabledBtn: { opacity: 0.7 },
  generateButtonText: { color: Colors.white, fontSize: 16, fontWeight: 'bold' },

  previewContainer: { flex: 1, backgroundColor: Colors.white },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  closePreviewBtn: { padding: 4 },
  previewTitle: { fontSize: 16, fontWeight: '700' },
  webviewContainer: { flex: 1, backgroundColor: '#F1F5F9' },
  previewFooter: { flexDirection: 'row', padding: 16, gap: 12, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  pActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', padding: 14, borderRadius: 10 },
  pDownloadBtn: { backgroundColor: Colors.primary },
  pPrintBtn: { backgroundColor: '#EFF6FF' },
  pActionText: { marginLeft: 8, fontWeight: '600', color: '#fff' },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  categoryChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  activeCategoryChip: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  activeCategoryChipText: { color: '#fff' },
});

export default CreateInvoiceScreen;