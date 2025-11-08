import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput, Alert, ActivityIndicator, RefreshControl } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { fetchRevenueDaily, fetchExpensesDaily, saveExpenseDaily, deleteExpenses } from '../utils/api';

const FinancialCalculatorScreen = ({ navigation }) => {
  const [companyData, setCompanyData] = useState(null);
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [loading, setLoading] = useState(true);
  // Profit & Loss — daily hooked to server
  const [year, setYear] = useState(dayjs().year());
  const [revenueDaily, setRevenueDaily] = useState(Array.from({ length: 31 }, () => 0));
  const [expensesDaily, setExpensesDaily] = useState(Array.from({ length: 31 }, () => 0));
  const [expensesDailyInput, setExpensesDailyInput] = useState(Array.from({ length: 31 }, () => '0'));
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [busy, setBusy] = useState({ visible: false, message: '' });

  const showBusy = useCallback((message) => {
    setBusy({ visible: true, message });
  }, []);

  const hideBusy = useCallback(() => {
    setBusy({ visible: false, message: '' });
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('companyData');
        const c = stored ? JSON.parse(stored) : null;
        setCompanyData(c);
        // Currency is enforced by server/company settings
      } catch (_) {}
    })();
  }, []);

  // Removed AsyncStorage P&L persistence; expenses are stored in DB per day.

  // Removed auto-save timers and related cleanup per request

  const loadData = useCallback(async () => {
    if (!companyData?.companyId) return;
    setLoading(true);
    try {
      const [revDailyRes, expDailyRes] = await Promise.all([
        fetchRevenueDaily(companyData.companyId, month),
        fetchExpensesDaily(companyData.companyId, month),
      ]);
      if (revDailyRes?.success && Array.isArray(revDailyRes.days)) {
        const arr = Array.from({ length: 31 }, (_, i) => Number(revDailyRes.days[i] || 0));
        setRevenueDaily(arr);
      } else {
        setRevenueDaily(Array.from({ length: 31 }, () => 0));
      }
      if (expDailyRes?.success && Array.isArray(expDailyRes.days)) {
        const arrE = Array.from({ length: 31 }, (_, i) => Number(expDailyRes.days[i] || 0));
        setExpensesDaily(arrE);
        setExpensesDailyInput(arrE.map((v) => String(v)));
      } else {
        const zeros = Array.from({ length: 31 }, () => 0);
        setExpensesDaily(zeros);
        setExpensesDailyInput(zeros.map((v) => String(v)));
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to load finance data');
    } finally {
      setLoading(false);
    }
  }, [companyData, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => {
      setToast((t) => ({ ...t, visible: false }));
    }, 2000);
  }, []);

  const monthsOptions = useMemo(() => {
    const arr = [];
    const start = dayjs(month);
    for (let i = 0; i < 12; i++) {
      const m = start.subtract(i, 'month');
      arr.push({ key: m.format('YYYY-MM'), label: m.format('MMMM YYYY') });
    }
    return arr;
  }, [month]);

  const daysInSelectedMonth = 31; // Fixed 31 days per requirement
  const currency = companyData?.currencySymbol || '$';

  // Real calendar day names for the selected month
  const dayNamesForMonth = useMemo(() => {
    const base = dayjs(month);
    const dim = base.daysInMonth();
    return Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1;
      return dayNum <= dim ? base.date(dayNum).format('dddd') : '-';
    });
  }, [month]);

  const updateDailyExpenseInput = (dayIndex, text) => {
    // Do not sanitize: keep typing free and uninterrupted
    setExpensesDailyInput((prev) => {
      const next = [...prev];
      next[dayIndex] = String(text ?? '');
      return next;
    });
  };

  const persistDailyExpense = async (dayIndex) => {
    if (!companyData?.companyId) return;
    const valText = expensesDailyInput?.[dayIndex] ?? '0';
    const num = parseFloat(valText);
    const safe = isNaN(num) ? 0 : num;
    try {
      showBusy('Please wait while we save your entry...');
      const oldVal = Number(expensesDaily?.[dayIndex] || 0);
      await saveExpenseDaily(companyData.companyId, month, dayIndex + 1, safe);
      // Update local numeric array without overriding user's current typed string
      setExpensesDaily((prev) => {
        const next = [...prev];
        next[dayIndex] = safe;
        return next;
      });
      if (dayjs(month).year() === year) {
        const delta = safe - oldVal;
        setAnnualTotals((prev) => ({ ...prev, exp: prev.exp + delta }));
      }
      showToast('Saved entry', 'success');
    } catch (_) {
      Alert.alert('Error', 'Failed to save entry');
    } finally {
      hideBusy();
    }
  };

  const monthlyTotals = useMemo(() => {
    const exp = (expensesDailyInput || []).reduce((a, b) => a + (parseFloat(b) || 0), 0);
    const rev = (revenueDaily || []).reduce((a, b) => a + Number(b || 0), 0);
    const net = rev - exp;
    return { exp, rev, net };
  }, [expensesDailyInput, revenueDaily]);

  const [annualTotals, setAnnualTotals] = useState({ exp: 0, rev: 0 });
  const computeAnnualTotals = useCallback(async () => {
    if (!companyData?.companyId) return;
    let exp = 0;
    let rev = 0;
    // Iterate Jan..Dec for selected year
    for (let m = 0; m < 12; m++) {
      const key = dayjs(`${year}-01`).add(m, 'month').format('YYYY-MM');
      try {
        const [revRes, expRes] = await Promise.all([
          fetchRevenueDaily(companyData.companyId, key),
          fetchExpensesDaily(companyData.companyId, key),
        ]);
        if (revRes?.success && Array.isArray(revRes.days)) {
          rev += revRes.days.reduce((a, b) => a + Number(b || 0), 0);
        }
        if (expRes?.success && Array.isArray(expRes.days)) {
          exp += expRes.days.reduce((a, b) => a + Number(b || 0), 0);
        }
      } catch (_) {}
    }
    setAnnualTotals({ exp, rev });
  }, [companyData, year]);

  useEffect(() => {
    computeAnnualTotals();
  }, [computeAnnualTotals]);

  const finalAnnualNet = useMemo(() => {
    return annualTotals.rev - annualTotals.exp;
  }, [annualTotals]);

  // Removed old expense create form; daily expenses are edited inline and saved to server.

  const Section = ({ title, children }) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.divider} />
      {children}
    </View>
  );

  const SummaryRow = ({ label, value }) => (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Financial Calculator</Text>
        <Text style={styles.subtitle}>Monthly Profit and Loss</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); try { await loadData(); await computeAnnualTotals(); } finally { setRefreshing(false); } }} />}
        >
          <Section title="Select Month">
            <View style={styles.monthsRow}>
              {monthsOptions.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.monthChip, month === m.key && styles.monthChipActive]}
                  onPress={() => setMonth(m.key)}
                >
                  <Text style={[styles.monthChipText, month === m.key && { color: Colors.white }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Section>

          {/* Streamlined UI: Daily grid with server-linked revenue and expenses */}

          {/* Profit & Loss — Manual Entry (Card 1) */}
          <Section title="Profit & Loss (Manual Entry)">
            <Text style={styles.sectionSubtitle}>Select Year</Text>
            <View style={styles.monthsRow}>
              {[year - 1, year, year + 1].map((y) => (
                <TouchableOpacity key={y} style={[styles.monthChip, year === y && styles.monthChipActive]} onPress={() => setYear(y)}>
                  <Text style={[styles.monthChipText, year === y && { color: Colors.white }]}>{y}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sectionSubtitle}>Daily Entries for {dayjs(month).format('MMMM YYYY')}</Text>
            <View style={styles.dailyGridHeader}>
              <Text style={[styles.dailyHeaderCell, { flex: 0.6 }]}>Day</Text>
              <Text style={[styles.dailyHeaderCell, { flex: 1, textAlign: 'right' }]}>Expenses ({currency})</Text>
              <Text style={[styles.dailyHeaderCell, { flex: 1, textAlign: 'right' }]}>Revenue ({currency})</Text>
            </View>
            {Array.from({ length: daysInSelectedMonth }).map((_, i) => (
              <View key={i} style={styles.dailyRow}>
                <Text style={[styles.dailyCell, { flex: 1 }]}>{`Day ${i + 1} (${dayNamesForMonth[i]})`}</Text>
                <TextInput
                  style={[styles.input, styles.dailyInput]}
                  placeholder="0"
                  placeholderTextColor={Colors.textSecondary}
                  keyboardType="decimal-pad"
                  value={String(expensesDailyInput?.[i] ?? '')}
                  onChangeText={(t) => updateDailyExpenseInput(i, t)}
                  blurOnSubmit={false}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={styles.entrySaveButton}
                  onPress={() => persistDailyExpense(i)}
                >
                  <Text style={styles.entrySaveText}>Save Entry</Text>
                </TouchableOpacity>
                <Text style={[styles.dailyCell, { flex: 1, textAlign: 'right' }]}>
                  {`${currency}${Number(revenueDaily?.[i] || 0).toLocaleString()}`}
                </Text>
              </View>
            ))}
            <View style={styles.divider} />
            <Text style={styles.sectionSubtitle}>Monthly Totals</Text>
            <SummaryRow label={`Expenses (${currency})`} value={`${currency}${Number(monthlyTotals.exp).toLocaleString()}`} />
            <SummaryRow label={`Revenue (${currency})`} value={`${currency}${Number(monthlyTotals.rev).toLocaleString()}`} />
            <SummaryRow label={`Net (${currency})`} value={`${currency}${Number(monthlyTotals.net).toLocaleString()}`} />
            <View style={{ flexDirection: 'row', gap: 8, marginTop: Spacing.sm }}>
              <TouchableOpacity
                style={[styles.saveButton, { flex: 1 }]}
                onPress={async () => {
                  if (!companyData?.companyId) return;
                  showBusy('Please wait while we clear the month...');
                  try {
                    const prevMonthExp = Number(monthlyTotals.exp || 0);
                    const res = await deleteExpenses(companyData.companyId, month);
                    const zeros = Array.from({ length: 31 }, () => 0);
                    setExpensesDaily(zeros);
                    setExpensesDailyInput(zeros.map((v) => String(v)));
                    if (dayjs(month).year() === year) {
                      setAnnualTotals((prev) => ({ ...prev, exp: prev.exp - prevMonthExp }));
                    }
                    if (res?.success) {
                      showToast(`Cleared daily expenses for ${dayjs(month).format('MMMM YYYY')}`, 'success');
                    } else {
                      Alert.alert('Error', 'Failed to clear month');
                    }
                  } finally {
                    hideBusy();
                  }
                }}
              >
                <Text style={styles.saveButtonText}>Clear Month</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.purgeButton, { flex: 1 }]}
                onPress={() => {
                  if (!companyData?.companyId) return;
                  Alert.alert(
                    'Confirm Purge',
                    `Delete all expense records for ${dayjs(month).format('MMMM YYYY')}?`,
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete',
                        style: 'destructive',
                        onPress: async () => {
                          try {
                            showBusy('Please wait while we purge this month...');
                            const prevMonthExp = Number(monthlyTotals.exp || 0);
                            const res = await deleteExpenses(companyData.companyId, month);
                            const zeros = Array.from({ length: 31 }, () => 0);
                            setExpensesDaily(zeros);
                            setExpensesDailyInput(zeros.map((v) => String(v)));
                            if (dayjs(month).year() === year) {
                              setAnnualTotals((prev) => ({ ...prev, exp: prev.exp - prevMonthExp }));
                            }
                            if (res?.success) {
                              const count = Number(res?.deletedCount || 0);
                              showToast(`Purged ${count} expense${count === 1 ? '' : 's'} for ${dayjs(month).format('MMMM YYYY')}`, 'success');
                            } else {
                              Alert.alert('Error', 'Failed to purge expenses');
                            }
                          } catch (_) {
                            Alert.alert('Error', 'Failed to purge expenses');
                          } finally {
                            hideBusy();
                          }
                        },
                      },
                    ]
                  );
                }}
              >
                <Text style={styles.saveButtonText}>Purge Month (DB)</Text>
              </TouchableOpacity>
            </View>
          </Section>

          <Section title="Annual Summary">
            <SummaryRow label={`Annual Expenses (${currency})`} value={`${currency}${Number(annualTotals.exp).toLocaleString()}`} />
            <SummaryRow label={`Annual Revenue (${currency})`} value={`${currency}${Number(annualTotals.rev).toLocaleString()}`} />
            <SummaryRow label={`Final Annual Net (${currency})`} value={`${currency}${Number(finalAnnualNet).toLocaleString()}`} />
            <Text style={[styles.conclusionText, { marginTop: Spacing.sm }]}>
              {finalAnnualNet > 0 ? 'Conclusion: The business is doing well.' : finalAnnualNet < 0 ? 'Conclusion: The business is operating at a loss.' : 'Conclusion: Break-even year.'}
            </Text>
          </Section>
      </ScrollView>
      )}
      {toast.visible && (
        <View
          style={[
            styles.toast,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
          ]}
        >
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
      {busy.visible && (
        <View
          style={[styles.toast, styles.toastInfo, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}
        >
          <ActivityIndicator color={Colors.white} size="small" />
          <Text style={styles.toastText}>{busy.message}</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

  const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.lg },
  backButton: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: Colors.gray[200], alignSelf: 'flex-start' },
  backButtonText: { color: Colors.text, fontWeight: '600' },
  title: { fontSize: Fonts.sizes.xl, fontWeight: Fonts.weights.bold, color: Colors.text, marginTop: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary },
  scrollContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xl },
  section: { backgroundColor: Colors.surface, borderRadius: 12, padding: Spacing.lg, marginBottom: Spacing.md, shadowColor: Colors.black, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.1, shadowRadius: 6, elevation: 3 },
  sectionTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.semiBold, color: Colors.text },
  sectionSubtitle: { fontSize: Fonts.sizes.md, color: Colors.text, marginBottom: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.gray[200], marginVertical: Spacing.sm },
  monthsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.gray[300], marginRight: 8, marginBottom: 8 },
  monthChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  monthChipText: { color: Colors.textSecondary },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  summaryLabel: { color: Colors.textSecondary },
  summaryValue: { color: Colors.text, fontWeight: '700' },
  formRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: Spacing.sm },
  formChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.gray[300] },
  formChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  formChipText: { color: Colors.textSecondary },
  input: { backgroundColor: Colors.background, borderRadius: 10, borderWidth: 1, borderColor: Colors.gray[300], paddingHorizontal: 12, paddingVertical: 10, color: Colors.text },
  currencyRow: { alignItems: 'center' },
  currencyChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: Colors.gray[300], marginRight: 8 },
  currencyChipActive: { backgroundColor: Colors.success, borderColor: Colors.success },
  currencyChipText: { color: Colors.textSecondary },
  saveButton: { backgroundColor: Colors.success, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  purgeButton: { backgroundColor: Colors.error, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginTop: Spacing.sm, minHeight: 44, justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 24, left: 16, right: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, alignItems: 'center', shadowColor: Colors.black, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 2 },
    toastSuccess: { backgroundColor: Colors.success },
    toastError: { backgroundColor: Colors.error },
    toastInfo: { backgroundColor: Colors.primary },
    toastText: { color: Colors.white, fontWeight: '800' },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText: { color: Colors.white, fontWeight: '800' },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textSecondary },
  expenseRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  expenseText: { color: Colors.textSecondary },
  expenseAmount: { color: Colors.text, fontWeight: '700' },
  dailyGridHeader: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  dailyHeaderCell: { color: Colors.textSecondary },
  dailyRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 6 },
  dailyCell: { color: Colors.textSecondary },
    dailyInput: { flex: 1, textAlign: 'right' },
    entrySaveButton: { backgroundColor: Colors.primary, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginLeft: 8 },
    entrySaveText: { color: Colors.white, fontWeight: '700' },
    conclusionText: { color: Colors.text, fontWeight: '700' },
  });

export default FinancialCalculatorScreen;