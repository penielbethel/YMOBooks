import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, Linking, SafeAreaView, ActivityIndicator, Alert, Platform, Modal, TextInput, SectionList } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { fetchInvoices, fetchReceipts, createReceipt, deleteInvoice, deleteReceiptByInvoice, getApiBaseUrl, fetchCompany, resolveAssetUri } from '../utils/api';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { WebView } from 'react-native-webview';
import { buildInvoiceHtml, buildReceiptHtml } from '../utils/invoiceHtml';

const InvoiceHistoryScreen = ({ navigation, route }) => {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [companyId, setCompanyId] = useState(null);
  const [receiptsByInvoice, setReceiptsByInvoice] = useState({});
  const [company, setCompany] = useState(null);
  const [downloadingFor, setDownloadingFor] = useState(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [savingHtmlPdf, setSavingHtmlPdf] = useState(false);
  const [pdfReadyUri, setPdfReadyUri] = useState(null);
  const currentPreviewRef = useRef({ type: 'invoice', invoiceItem: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDays, setFilterDays] = useState(null); // null = All
  const [selectedCurrencies, setSelectedCurrencies] = useState([]); // [] means ALL currencies
  const [paidFilter, setPaidFilter] = useState('ALL'); // ALL | PAID | UNPAID
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedMap, setCollapsedMap] = useState({});
  const [selectMode, setSelectMode] = useState(false);
  const [selectedInvoicesMap, setSelectedInvoicesMap] = useState({});
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // Reload company data on focus to ensure receipts have latest settings
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const stored = await AsyncStorage.getItem('companyData');
          if (stored) {
            const parsed = JSON.parse(stored);
            setCompany(parsed);
          }
        } catch (_) { }
      })();
    }, [])
  );

  // Persist and restore filters/search
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('invoiceHistoryFilters');
        const saved = raw ? JSON.parse(raw) : null;
        if (saved) {
          if (typeof saved.searchQuery === 'string') setSearchQuery(saved.searchQuery);
          if (saved.filterDays === null || typeof saved.filterDays === 'number') setFilterDays(saved.filterDays);
          if (Array.isArray(saved.selectedCurrencies)) setSelectedCurrencies(saved.selectedCurrencies);
          if (typeof saved.paidFilter === 'string') setPaidFilter(saved.paidFilter);
        }
      } catch (_e) { }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const payload = { searchQuery, filterDays, selectedCurrencies, paidFilter };
        await AsyncStorage.setItem('invoiceHistoryFilters', JSON.stringify(payload));
      } catch (_e) { }
    })();
  }, [searchQuery, filterDays, selectedCurrencies, paidFilter]);

  useEffect(() => {
    (async () => {
      try {
        const overrideId = route?.params?.companyId;
        let effectiveId = overrideId;
        if (!effectiveId) {
          const stored = await AsyncStorage.getItem('companyData');
          const parsed = stored ? JSON.parse(stored) : null;
          setCompany(parsed || null);
          effectiveId = parsed?.companyId;
        }
        if (!effectiveId) {
          Alert.alert('Missing Company', 'Please register your company first');
          navigation.navigate('CompanyRegistration');
          return;
        }
        setCompanyId(effectiveId);
        const category = route?.params?.category;
        await (async () => {
          const [invRes, rctRes] = await Promise.all([
            fetchInvoices(effectiveId, 60, category),
            fetchReceipts(effectiveId, 60, category),
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
        })();
      } catch (err) {
        Alert.alert('Error', 'Could not load invoice history');
      } finally {
        setLoading(false);
      }
    })();
  }, [navigation]);

  const refetch = async () => {
    if (!companyId) return;
    setRefreshing(true);
    try {
      const category = route?.params?.category;
      const [invRes, rctRes] = await Promise.all([
        fetchInvoices(companyId, 12, category),
        fetchReceipts(companyId, 12, category),
      ]);
      if (invRes?.success) {
        setInvoices(invRes.invoices || []);
      }
      if (rctRes?.success && Array.isArray(rctRes.receipts)) {
        const map = {};
        rctRes.receipts.forEach((r) => {
          if (r.invoiceNumber) map[r.invoiceNumber] = true;
        });
        setReceiptsByInvoice(map);
      }
    } catch (_e) {
      // swallow for refresh UX
    } finally {
      setRefreshing(false);
    }
  };

  const toDataUrl = async (rawUri) => {
    const uri = resolveAssetUri(rawUri);
    if (!uri || typeof uri !== 'string') return '';
    if (uri.startsWith('data:')) return uri;
    try {
      const ext = (uri.split(/[#?]/)[0].split('.').pop() || '').toLowerCase();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : 'image/png';

      if (uri.startsWith('file:')) {
        const base64 = await FileSystemLegacy.readAsStringAsync(uri, { encoding: 'base64' });
        return `data:${mime};base64,${base64}`;
      } else {
        const tmp = `${FileSystem.cacheDirectory}img-${Date.now()}.${ext || 'png'}`;
        const dl = await FileSystemLegacy.downloadAsync(uri, tmp);
        const base64 = await FileSystemLegacy.readAsStringAsync(dl.uri, { encoding: 'base64' });
        return `data:${mime};base64,${base64}`;
      }
    } catch (err) {
      console.warn('[toDataUrl] Failed:', err.message);
      return uri;
    }
  };

  // Helpers to resolve currency symbol consistently from invoice fields
  const codeToSymbol = (code) => {
    switch (String(code || '').trim().toUpperCase()) {
      case 'NGN': return '₦';
      case 'USD': return '$';
      case 'GBP': return '£';
      case 'EUR': return '€';
      case 'GHS': return '₵';
      case 'KES': return 'KSh';
      default: return undefined;
    }
  };
  const resolveCurrencySymbol = (inv, company) => {
    // Display invoices in the company's currency only
    return company?.currencySymbol || '$';
  };

  const fetchFullCompanyDataIfNeeded = async (company) => {
    if (!company?.companyId) return company;
    let full = { ...company };
    if ((!full.logo || !full.signature)) {
      try {
        if (!full.logo) {
          const cachedLogo = await AsyncStorage.getItem('companyLogoCache');
          if (cachedLogo) full.logo = cachedLogo;
        }
        if (!full.logo || !full.signature) {
          if (company.hasLogo || company.hasSignature) {
            const fetched = await fetchCompany(company.companyId);
            const c = fetched?.company || fetched?.data;
            if (c) {
              full = { ...full, ...c };
              if (c.logo) AsyncStorage.setItem('companyLogoCache', c.logo).catch(() => { });
            }
          }
        }
      } catch (e) {
        console.warn('[History] Failed to fetch full company details', e);
      }
    }
    return full;
  };

  const openInvoicePreview = async (item) => {
    try {
      const stored = await AsyncStorage.getItem('companyData');
      let company = stored ? JSON.parse(stored) : {};
      company = await fetchFullCompanyDataIfNeeded(company);
      const resolvedLogo = await toDataUrl(company?.logo);
      const resolvedSignature = await toDataUrl(company?.signature);
      const currencySymbol = resolveCurrencySymbol(item, company);
      const html = buildInvoiceHtml({
        company: {
          name: company?.name || company?.companyName,
          address: company?.address,
          email: company?.email,
          phone: company?.phone || company?.phoneNumber,
          bankName: company?.bankName,
          accountName: company?.accountName || company?.bankAccountName,
          accountNumber: company?.accountNumber || company?.bankAccountNumber,
          logo: resolvedLogo,
          signature: resolvedSignature,
        },
        invoice: {
          customerName: item?.customer?.name,
          customerAddress: item?.customer?.address,
          customerContact: item?.customer?.contact,
          invoiceDate: dayjs(item.invoiceDate || item.createdAt).format('YYYY-MM-DD'),
          dueDate: item.dueDate ? dayjs(item.dueDate).format('YYYY-MM-DD') : undefined,
          invoiceNumber: item.invoiceNumber,
        },
        items: (item.items || []).map((it) => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
        template: item?.invoiceTemplate || company?.invoiceTemplate || 'classic',
        brandColor: company?.brandColor || '',
        currencySymbol,
      });
      setPreviewTitle(`${item.invoiceNumber} — Preview`);
      setPreviewHtml(html);
      setPdfReadyUri(null);
      currentPreviewRef.current = { type: 'invoice', invoiceItem: item };
      setPreviewVisible(true);
    } catch (e) {
      Alert.alert('Preview failed', String(e?.message || e));
    }
  };

  // buildReceiptHtml is now imported from utils/invoiceHtml

  const openReceiptPreview = async (item) => {
    try {
      const stored = await AsyncStorage.getItem('companyData');
      let company = stored ? JSON.parse(stored) : {};
      company = await fetchFullCompanyDataIfNeeded(company);
      const resolvedLogo = await toDataUrl(company?.logo);
      const resolvedSignature = await toDataUrl(company?.signature);
      const currencySymbol = resolveCurrencySymbol(item, company);
      const receiptDate = dayjs().format('YYYY-MM-DD');
      const html = buildReceiptHtml({
        company: {
          name: company?.name || company?.companyName,
          address: company?.address,
          email: company?.email,
          phone: company?.phone || company?.phoneNumber,
          bankName: company?.bankName,
          accountName: company?.accountName || company?.bankAccountName,
          accountNumber: company?.accountNumber || company?.bankAccountNumber,
          logo: resolvedLogo,
          signature: resolvedSignature,
          brandColor: company?.brandColor,
          termsAndConditions: company?.termsAndConditions,
        },
        invoice: {
          customerName: item?.customer?.name,
          customerAddress: item?.customer?.address,
          customerContact: item?.customer?.contact,
          invoiceNumber: item.invoiceNumber,
        },
        items: item.items || [], // Ensure items are passed
        receiptNumber: `RCT-${company?.companyId || 'LOCAL'}-${Date.now()}`,
        receiptDate,
        amountPaid: Number(item.grandTotal || 0),
        currencySymbol,
        template: company?.receiptTemplate || 'classic',
        brandColor: company.brandColor || '#16a34a',
      });
      setPreviewTitle(`${item.invoiceNumber} — Receipt Preview (PAID)`);
      setPreviewHtml(html);
      setPdfReadyUri(null);
      currentPreviewRef.current = { type: 'receipt', invoiceItem: item };
      setPreviewVisible(true);
    } catch (e) {
      Alert.alert('Preview failed', String(e?.message || e));
    }
  };

  const onGenerateReceipt = async (item) => {
    if (!companyId) return Alert.alert('Missing Company', 'Company ID not found');
    await openReceiptPreview(item);
  };

  const handleDownload = async (pdfUrl) => {
    if (!pdfUrl) return;
    try {
      setDownloadingFor(pdfUrl);
      const fileNameGuess = pdfUrl.split('/').pop() || `document-${Date.now()}.pdf`;
      const filename = fileNameGuess.replace(/[^a-zA-Z0-9_.-]/g, '_');
      const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || '';
      const tempUri = `${baseDir}${filename}`;
      const dl = await FileSystemLegacy.downloadAsync(pdfUrl, tempUri);
      if (Platform.OS === 'android') {
        try {
          const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
          if (perm.granted && perm.directoryUri) {
            const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, filename, 'application/pdf');
            const base64 = await FileSystemLegacy.readAsStringAsync(dl.uri, { encoding: 'base64' });
            await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
            Alert.alert('Saved', 'PDF saved to selected folder.');
          } else {
            const contentUri = await FileSystem.getContentUriAsync(dl.uri);
            await Linking.openURL(contentUri);
          }
        } catch (e) {
          try {
            const contentUri = await FileSystem.getContentUriAsync(dl.uri);
            await Linking.openURL(contentUri);
          } catch (_) { }
        }
      } else {
        await Linking.openURL(dl.uri);
      }
    } catch (e) {
      Alert.alert('Download failed', String(e?.message || 'Could not save PDF to device'));
    } finally {
      setDownloadingFor(null);
    }
  };

  const onDeleteInvoice = async (item) => {
    if (!companyId) return Alert.alert('Missing Company', 'Company ID not found');
    Alert.alert(
      'Delete Invoice',
      `Are you sure you want to delete ${item.invoiceNumber}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              const res = await deleteInvoice(companyId, item.invoiceNumber);
              if (res?.success) {
                setInvoices((prev) => prev.filter((x) => x.invoiceNumber !== item.invoiceNumber));
                // Refresh receipts map to reflect cascaded deletion and paid status change
                try { await refetch(); } catch (_) { }
                Alert.alert('Deleted', 'Invoice removed from history');
              } else {
                Alert.alert('Failed', res?.message || 'Could not delete invoice');
              }
            } catch (e) {
              Alert.alert('Error', 'Delete failed');
            }
          }
        },
      ]
    );
  };

  const toggleSelectInvoice = (invoiceNumber) => {
    setSelectedInvoicesMap((prev) => ({ ...prev, [invoiceNumber]: !prev[invoiceNumber] }));
  };

  const clearSelection = () => setSelectedInvoicesMap({});

  const selectAllVisible = () => {
    const map = {};
    visibleInvoices.forEach((inv) => { map[inv.invoiceNumber] = true; });
    setSelectedInvoicesMap(map);
  };

  const deleteSelectedInvoices = async () => {
    if (!companyId) return Alert.alert('Missing Company', 'Company ID not found');
    const targets = Object.keys(selectedInvoicesMap).filter((k) => selectedInvoicesMap[k]);
    if (!targets.length) return Alert.alert('Select invoices', 'Please select at least one invoice to delete');
    Alert.alert(
      'Delete Selected Invoices',
      `Delete ${targets.length} selected invoice${targets.length === 1 ? '' : 's'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              setBulkDeleting(true);
              let successCount = 0;
              for (const invNum of targets) {
                try {
                  const res = await deleteInvoice(companyId, invNum);
                  if (res?.success) successCount++;
                } catch (_) { }
              }
              if (successCount > 0) {
                setInvoices((prev) => prev.filter((x) => !selectedInvoicesMap[x.invoiceNumber]));
                clearSelection();
                try { await refetch(); } catch (_) { }
                Alert.alert('Deleted', `Removed ${successCount} invoice${successCount === 1 ? '' : 's'} from history`);
              } else {
                Alert.alert('Failed', 'Could not delete selected invoices');
              }
            } finally {
              setBulkDeleting(false);
            }
          }
        },
      ]
    );
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      {selectMode ? (
        <TouchableOpacity
          onPress={() => toggleSelectInvoice(item.invoiceNumber)}
          style={[styles.selectCheckbox, selectedInvoicesMap[item.invoiceNumber] && styles.selectCheckboxSelected]}
        >
          {selectedInvoicesMap[item.invoiceNumber] ? (
            <Text style={styles.selectCheckboxTick}>✓</Text>
          ) : null}
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={[styles.rowLeft, selectMode && { marginLeft: 8 }]} onPress={() => openInvoicePreview(item)}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.invNumber}>{item.invoiceNumber}</Text>
          {receiptsByInvoice[item.invoiceNumber] ? (
            <View style={styles.paidPill}><Text style={styles.paidPillText}>PAID</Text></View>
          ) : null}
        </View>
        <Text style={styles.customerName}>{item?.customer?.name || 'Unknown Customer'}</Text>
      </TouchableOpacity>
      <View style={styles.rowRight}>
        <Text style={styles.amount}>{String(resolveCurrencySymbol(item, company))} {Number(item.grandTotal || 0).toLocaleString()}</Text>
        <Text style={styles.dateText}>{dayjs(item.invoiceDate || item.createdAt).format('DD MMM, YYYY')}</Text>
        <View style={{ flexDirection: 'row', marginTop: 6 }}>
          <TouchableOpacity style={[styles.smallBtn, styles.receiptBtn]}
            disabled={!!downloadingFor}
            onPress={() => onGenerateReceipt(item)}>
            <Text style={styles.smallBtnText}>{downloadingFor ? 'Saving…' : 'Receipt'}</Text>
          </TouchableOpacity>
          {receiptsByInvoice[item.invoiceNumber] ? (
            <TouchableOpacity
              style={[styles.smallBtn, styles.deleteBtn]}
              onPress={() => {
                Alert.alert(
                  'Delete Receipt',
                  `Remove receipt(s) for ${item.invoiceNumber}? This will reduce revenue.`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete', style: 'destructive', onPress: async () => {
                        try {
                          const res = await deleteReceiptByInvoice(companyId, item.invoiceNumber);
                          if (res?.success) {
                            setReceiptsByInvoice((prev) => ({ ...prev, [item.invoiceNumber]: false }));
                            Alert.alert('Deleted', 'Receipt removed and revenue synced');
                            await refetch();
                          } else {
                            Alert.alert('Failed', res?.message || 'Could not delete receipt');
                          }
                        } catch (_e) {
                          Alert.alert('Error', 'Delete failed');
                        }
                      }
                    },
                  ]
                );
              }}
            >
              <Text style={styles.smallBtnText}>Delete Receipt</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={[styles.smallBtn, styles.deleteBtn]} onPress={() => onDeleteInvoice(item)}>
            <Text style={styles.smallBtnText}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // Currency selection removed; company currency applies globally

  // Filter + search
  const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
  const now = dayjs();
  const visibleInvoices = (invoices || []).filter((inv) => {
    // Days filter
    if (filterDays && Number(filterDays) > 0) {
      const date = dayjs(inv.invoiceDate || inv.createdAt);
      if (!date.isValid()) return false;
      if (now.diff(date, 'day') > Number(filterDays)) return false;
    }
    // Paid status filter
    const isPaid = !!receiptsByInvoice[inv.invoiceNumber];
    if (paidFilter === 'PAID' && !isPaid) return false;
    if (paidFilter === 'UNPAID' && isPaid) return false;
    // Currency filter removed
    // Search filter: by customer name, invoice number, currency
    if (normalizedQuery) {
      const name = (inv?.customer?.name || '').toLowerCase();
      const number = (inv?.invoiceNumber || '').toLowerCase();
      const currency = String(resolveCurrencySymbol(inv, company)).toLowerCase();
      if (!name.includes(normalizedQuery) && !number.includes(normalizedQuery) && !currency.includes(normalizedQuery)) {
        return false;
      }
    }
    return true;
  });

  // Group by month for professional arrangement
  const sections = Object.values(
    visibleInvoices.reduce((acc, inv) => {
      const key = dayjs(inv.invoiceDate || inv.createdAt).format('YYYY-MM');
      const label = dayjs(inv.invoiceDate || inv.createdAt).format('MMMM YYYY');
      if (!acc[key]) acc[key] = { title: label, key, data: [] };
      acc[key].data.push(inv);
      return acc;
    }, {})
  )
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((section) => ({
      ...section,
      data: section.data.sort((a, b) => {
        const da = dayjs(a.invoiceDate || a.createdAt).valueOf();
        const db = dayjs(b.invoiceDate || b.createdAt).valueOf();
        return db - da;
      }),
    }));

  // Initialize collapse map for sections (default collapsed)
  useEffect(() => {
    setCollapsedMap((prev) => {
      const next = { ...prev };
      sections.forEach((s) => {
        if (next[s.key] === undefined) next[s.key] = true;
      });
      return next;
    });
  }, [sections.length]);

  const sectionCounts = Object.fromEntries(sections.map((s) => [s.key, s.data.length]));
  const sectionTotals = Object.fromEntries(
    sections.map((s) => [
      s.key,
      s.data.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0),
    ])
  );
  const displaySections = sections.map((s) => ({
    ...s,
    data: collapsedMap[s.key] ? [] : s.data,
  }));

  const subtitleText = `Showing ${visibleInvoices.length} invoice${visibleInvoices.length !== 1 ? 's' : ''}${filterDays ? ` · last ${filterDays}d` : ''}${paidFilter !== 'ALL' ? ` · ${paidFilter.toLowerCase()}` : ''}${companyId ? ` · ${companyId}` : ''}`;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{route?.params?.serviceTitle ? `${route.params.serviceTitle} History` : 'Invoice History'}</Text>
        <Text style={styles.subtitle}>{subtitleText}</Text>
      </View>
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.primary} />
          <Text style={styles.loadingText}>Loading invoices...</Text>
        </View>
      ) : (
        <>
          <View style={styles.filtersBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search name, currency, invoice #"
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor={Colors.textSecondary}
            />
            <View style={styles.chipsRow}>
              {[
                { label: 'All days', value: null },
                { label: '7 days', value: 7 },
                { label: '30 days', value: 30 },
                { label: '90 days', value: 90 },
              ].map((opt) => (
                <TouchableOpacity
                  key={String(opt.value)}
                  style={[styles.chip, filterDays === opt.value && styles.chipActive]}
                  onPress={() => setFilterDays(opt.value)}
                >
                  <Text style={[styles.chipText, filterDays === opt.value && { color: Colors.white }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Currency filter removed: enforced company currency */}
            <View style={styles.chipsRow}>
              {[
                { label: 'All', value: 'ALL' },
                { label: 'Paid', value: 'PAID' },
                { label: 'Unpaid', value: 'UNPAID' },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.value}
                  style={[styles.chip, paidFilter === opt.value && styles.chipActive]}
                  onPress={() => setPaidFilter(opt.value)}
                >
                  <Text style={[styles.chipText, paidFilter === opt.value && { color: Colors.white }]}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity
                style={styles.resetBtn}
                onPress={async () => {
                  setSearchQuery('');
                  setFilterDays(null);
                  // currency selection removed
                  setPaidFilter('ALL');
                  try {
                    await AsyncStorage.setItem('invoiceHistoryFilters', JSON.stringify({
                      searchQuery: '', filterDays: null, paidFilter: 'ALL',
                    }));
                  } catch (_e) { }
                }}
              >
                <Text style={styles.resetBtnText}>Show all invoices</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Selection Toolbar */}
          <View style={styles.selectionBar}>
            <TouchableOpacity
              style={[styles.selectionBtn, selectMode && styles.selectionBtnActive]}
              onPress={() => {
                const next = !selectMode;
                setSelectMode(next);
                if (!next) clearSelection();
              }}
            >
              <Text style={[styles.selectionBtnText, selectMode && { color: Colors.white }]}>{selectMode ? 'Exit Select' : 'Select'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectionBtn, { marginLeft: 8 }]} disabled={!selectMode || bulkDeleting} onPress={selectAllVisible}>
              <Text style={styles.selectionBtnText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectionBtn, { marginLeft: 8 }]} disabled={!selectMode || bulkDeleting} onPress={clearSelection}>
              <Text style={styles.selectionBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.selectionBtn, styles.deleteBtn, { marginLeft: 8, opacity: (!selectMode || bulkDeleting) ? 0.7 : 1 }]} disabled={!selectMode || bulkDeleting} onPress={deleteSelectedInvoices}>
              <Text style={styles.smallBtnText}>{bulkDeleting ? 'Deleting…' : 'Delete Selected'}</Text>
            </TouchableOpacity>
          </View>

          <SectionList
            sections={displaySections}
            keyExtractor={(item) => item._id || item.invoiceNumber}
            renderItem={renderItem}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <TouchableOpacity style={styles.sectionHeader} onPress={() => setCollapsedMap((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionHeaderText}>
                    {section.title} ({sectionCounts[section.key] || 0}) — {String(company?.currencySymbol || '$')} {Number(sectionTotals[section.key] || 0).toLocaleString()}
                  </Text>
                  <Text style={styles.sectionHeaderIcon}>{collapsedMap[section.key] ? '▶' : '▼'}</Text>
                </View>
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.list}
            refreshing={refreshing}
            onRefresh={refetch}
            ListEmptyComponent={() => (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>No invoices match your filters.</Text>
              </View>
            )}
          />
        </>
      )}

      {/* Preview Modal */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <SafeAreaView style={[styles.container, { backgroundColor: Colors.gray[100] }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity style={styles.backButton} onPress={() => setPreviewVisible(false)}>
              <Text style={styles.backButtonText}>← Close</Text>
            </TouchableOpacity>
            <Text style={styles.title}>{previewTitle || 'Preview'}</Text>
          </View>
          <View style={{ flex: 1, margin: Spacing.lg, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden' }}>
            {!!previewHtml ? (
              <WebView originWhitelist={["*"]} source={{ html: previewHtml }} />
            ) : (
              <View style={styles.loadingBox}><ActivityIndicator color={Colors.primary} /></View>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg }}>
            <TouchableOpacity
              style={[styles.smallBtn, { backgroundColor: pdfReadyUri ? Colors.primary : Colors.success, paddingVertical: 10, flex: 1 }, savingHtmlPdf && { opacity: 0.7 }]}
              disabled={savingHtmlPdf}
              onPress={async () => {
                const { type, invoiceItem } = currentPreviewRef.current || {};
                const invNo = invoiceItem?.invoiceNumber || 'document';
                const prefix = type === 'receipt' ? 'RCT' : 'INV';
                const filename = `${prefix}_${invNo}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');

                if (pdfReadyUri) {
                  if (Platform.OS === 'web') {
                    await Linking.openURL(pdfReadyUri);
                  } else {
                    if (await Sharing.isAvailableAsync()) {
                      await Sharing.shareAsync(pdfReadyUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf' });
                    } else {
                      await Linking.openURL(pdfReadyUri);
                    }
                  }
                  return;
                }

                if (!previewHtml) return;
                try {
                  setSavingHtmlPdf(true);
                  const file = await Print.printToFileAsync({ html: previewHtml });

                  let targetUri = file.uri;
                  if (Platform.OS !== 'web') {
                    try {
                      const baseDir = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
                      targetUri = `${baseDir}${filename}`;
                      await FileSystem.moveAsync({ from: file.uri, to: targetUri });
                    } catch (mvErr) {
                      console.warn('[History] Rename failed:', mvErr);
                      targetUri = file.uri;
                    }
                  } else {
                    // Web download logic
                    try {
                      const resp = await fetch(file.uri);
                      const blob = await resp.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      setTimeout(() => URL.revokeObjectURL(url), 1500);
                    } catch (_e) {
                      await Linking.openURL(file.uri);
                    }
                  }

                  // If this was a receipt preview, register receipt in history
                  try {
                    if (type === 'receipt' && companyId && invoiceItem) {
                      const payload = {
                        companyId,
                        invoiceNumber: invoiceItem.invoiceNumber,
                        receiptDate: new Date().toISOString().slice(0, 10),
                        customer: invoiceItem.customer || {},
                        amountPaid: Number(invoiceItem.grandTotal || 0),
                        currencySymbol: resolveCurrencySymbol(invoiceItem, company),
                        currencyCode: invoiceItem.currencyCode,
                        category: invoiceItem.category || 'general',
                      };
                      const res = await createReceipt(payload);
                      if (res?.success) {
                        setPdfReadyUri(targetUri);
                        Alert.alert('Success', 'Receipt created and registered successfully!');
                      } else {
                        throw new Error(res?.message || 'Failed to register receipt on server');
                      }
                    } else {
                      // Just an invoice preview, set ready immediately
                      setPdfReadyUri(targetUri);
                    }
                  } catch (regErr) {
                    console.warn('[History] Receipt registration failed:', regErr);
                    Alert.alert('Registration Failed', 'PDF generated but could not register receipt. ' + (regErr?.message || ''));
                  }
                } catch (err) {
                  Alert.alert('Export failed', String(err?.message || err));
                } finally {
                  setSavingHtmlPdf(false);
                }
              }}
            >
              <Text style={styles.smallBtnText}>
                {savingHtmlPdf ? 'Generating…' : pdfReadyUri ? 'Step 2: Share Document' : 'Step 1: Create & Register'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Modal>
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
  filtersBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  searchInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    color: Colors.text,
    marginBottom: Spacing.md,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    color: Colors.text,
    fontSize: Fonts.sizes.sm,
    fontWeight: Fonts.weights.medium,
  },
  resetBtn: {
    marginTop: Spacing.sm,
    alignSelf: 'flex-end',
    backgroundColor: Colors.gray[200],
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  resetBtnText: {
    color: Colors.text,
    fontSize: Fonts.sizes.sm,
    fontWeight: Fonts.weights.semiBold,
  },
  row: {
    backgroundColor: Colors.surface,
    padding: Spacing.lg,
    borderRadius: 12,
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  selectCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    marginRight: 8,
  },
  selectCheckboxSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  selectCheckboxTick: {
    color: Colors.white,
    fontSize: Fonts.sizes.sm,
    textAlign: 'center',
    lineHeight: 16,
  },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semiBold,
    color: Colors.textSecondary,
  },
  sectionHeaderIcon: {
    fontSize: Fonts.sizes.md,
    color: Colors.textSecondary,
  },
  modalHeader: {
    backgroundColor: Colors.primary,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
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
    backgroundColor: Colors.secondary,
  },
  deleteBtn: {
    backgroundColor: '#ef4444',
    marginLeft: 8,
  },
  smallBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  smallBtnText: {
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
  selectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  selectionBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: Colors.gray[200],
  },
  selectionBtnActive: {
    backgroundColor: Colors.primary,
  },
  selectionBtnText: {
    color: Colors.text,
    fontWeight: Fonts.weights.semiBold,
  },
});

export default InvoiceHistoryScreen;