import React, { useEffect, useMemo, useState, useCallback, memo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, TextInput, Alert, ActivityIndicator, RefreshControl, Platform, KeyboardAvoidingView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import dayjs from 'dayjs';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { fetchRevenueDaily, fetchExpensesDaily, saveExpenseDaily, deleteExpenses } from '../utils/api';

// --- Sub-components extracted outside to prevent re-render focus loss ---

const Section = memo(({ title, children, icon }) => (
  <View style={styles.section}>
    <View style={styles.sectionHeader}>
      {icon && <Ionicons name={icon} size={20} color={Colors.primary} style={{ marginRight: 8 }} />}
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
    <View style={styles.divider} />
    {children}
  </View>
));

const SummaryRow = memo(({ label, value, isNet }) => (
  <View style={styles.summaryRow}>
    <Text style={styles.summaryLabel}>{label}</Text>
    <Text style={[styles.summaryValue, isNet && { color: value.includes('-') ? Colors.error : Colors.success }]}>{value}</Text>
  </View>
));

const DailyRow = memo(({ index, dayName, expenseValue, revenueValue, currency, onExpenseChange, onSave }) => {
  return (
    <View style={styles.dailyRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.dateDayText}>Day {index + 1}</Text>
        <Text style={styles.dayNameText}>{dayName}</Text>
      </View>

      <View style={{ flex: 1.2 }}>
        <TextInput
          style={styles.dailyInput}
          placeholder="0"
          placeholderTextColor={Colors.textSecondary}
          keyboardType="numeric"
          value={expenseValue}
          onChangeText={(t) => onExpenseChange(index, t)}
          returnKeyType="done"
          selectTextOnFocus
        />
      </View>

      <TouchableOpacity style={styles.miniSaveBtn} onPress={() => onSave(index)}>
        <Ionicons name="save-outline" size={16} color={Colors.white} />
      </TouchableOpacity>

      <View style={{ flex: 1, alignItems: 'flex-end' }}>
        <Text style={styles.dailyRevenueText}>
          {currency}{Number(revenueValue || 0).toLocaleString()}
        </Text>
      </View>
    </View>
  );
});

// --- Main Screen ---

const FinancialCalculatorScreen = ({ navigation }) => {
  const [companyData, setCompanyData] = useState(null);
  const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
  const [loading, setLoading] = useState(true);

  const [year, setYear] = useState(dayjs().year());
  const [revenueDaily, setRevenueDaily] = useState(Array.from({ length: 31 }, () => 0));
  const [expensesDaily, setExpensesDaily] = useState(Array.from({ length: 31 }, () => 0));
  const [expensesDailyInput, setExpensesDailyInput] = useState(Array.from({ length: 31 }, () => '0'));

  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('expense'); // 'expense' or 'production'
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' });
  const [busy, setBusy] = useState({ visible: false, message: '' });

  const showBusy = useCallback((message) => setBusy({ visible: true, message }), []);
  const hideBusy = useCallback(() => setBusy({ visible: false, message: '' }), []);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const stored = await AsyncStorage.getItem('companyData');
          const c = stored ? JSON.parse(stored) : null;
          setCompanyData(c);
        } catch (_) { }
      })();
    }, [])
  );

  const loadData = useCallback(async () => {
    if (!companyData?.companyId) return;
    setLoading(true);
    try {
      const [revDailyRes, expDailyRes] = await Promise.all([
        fetchRevenueDaily(companyData.companyId, month, activeCategory),
        fetchExpensesDaily(companyData.companyId, month, activeCategory),
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
  }, [companyData, month, activeCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  const monthsOptions = useMemo(() => {
    const arr = [];
    const start = dayjs(month);
    for (let i = 0; i < 6; i++) { // Limit to 6 recent months for cleaner UI
      const m = start.subtract(i, 'month');
      arr.push({ key: m.format('YYYY-MM'), label: m.format('MMM YYYY') });
    }
    return arr;
  }, [month]);

  const daysInSelectedMonth = 31;
  const currency = companyData?.currencySymbol || '$';

  const dayNamesForMonth = useMemo(() => {
    const base = dayjs(month);
    const dim = base.daysInMonth();
    return Array.from({ length: 31 }, (_, i) => {
      const dayNum = i + 1;
      return dayNum <= dim ? base.date(dayNum).format('ddd') : '-';
    });
  }, [month]);

  const updateDailyExpenseInput = useCallback((dayIndex, text) => {
    setExpensesDailyInput((prev) => {
      const next = [...prev];
      next[dayIndex] = text;
      return next;
    });
  }, []);

  const persistDailyExpense = useCallback(async (dayIndex) => {
    if (!companyData?.companyId) return;
    const valText = expensesDailyInput?.[dayIndex] ?? '0';
    const num = parseFloat(valText);
    const safe = isNaN(num) ? 0 : num;
    try {
      showBusy('Saving...');
      const oldVal = Number(expensesDaily?.[dayIndex] || 0);
      await saveExpenseDaily(companyData.companyId, month, dayIndex + 1, safe, activeCategory);
      setExpensesDaily((prev) => {
        const next = [...prev];
        next[dayIndex] = safe;
        return next;
      });
      if (dayjs(month).year() === year) {
        setAnnualTotals((prev) => ({ ...prev, exp: prev.exp + (safe - oldVal) }));
      }
      showToast('Saved', 'success');
    } catch (_) {
      Alert.alert('Error', 'Failed to save entry');
    } finally {
      hideBusy();
    }
  }, [companyData, month, expensesDaily, expensesDailyInput, year, showBusy, hideBusy, showToast, activeCategory]);

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
      } catch (_) { }
    }
    setAnnualTotals({ exp, rev });
  }, [companyData, year]);

  useEffect(() => {
    computeAnnualTotals();
  }, [computeAnnualTotals]);

  const finalAnnualNet = useMemo(() => annualTotals.rev - annualTotals.exp, [annualTotals]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={Colors.white} />
        </TouchableOpacity>
        <View>
          <Text style={styles.title}>Financials</Text>
          <Text style={styles.subtitle}>Profit & Loss Calculator</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await loadData(); await computeAnnualTotals(); setRefreshing(false); }} />}
          >
            {/* Month Selector */}
            <Section title="Select Period" icon="calendar">
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

              {(companyData?.businessType === 'manufacturing' || companyData?.businessType === 'printing_press') && (
                <View style={[styles.categoryRow, { flexWrap: 'wrap' }]}>
                  <TouchableOpacity
                    style={[styles.categoryTab, activeCategory === 'expense' && styles.categoryTabActive]}
                    onPress={() => setActiveCategory('expense')}
                  >
                    <Ionicons name="receipt-outline" size={14} color={activeCategory === 'expense' ? '#fff' : Colors.textSecondary} />
                    <Text style={[styles.categoryTabText, activeCategory === 'expense' && { color: '#fff' }]}>Operating</Text>
                  </TouchableOpacity>

                  {companyData?.businessType === 'manufacturing' ? (
                    <TouchableOpacity
                      style={[styles.categoryTab, activeCategory === 'production' && styles.categoryTabActive]}
                      onPress={() => setActiveCategory('production')}
                    >
                      <Ionicons name="construct-outline" size={14} color={activeCategory === 'production' ? '#fff' : Colors.textSecondary} />
                      <Text style={[styles.categoryTabText, activeCategory === 'production' && { color: '#fff' }]}>Production</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.categoryTab, activeCategory === 'large_format' && styles.categoryTabActive]}
                        onPress={() => setActiveCategory('large_format')}
                      >
                        <Ionicons name="image-outline" size={14} color={activeCategory === 'large_format' ? '#fff' : Colors.textSecondary} />
                        <Text style={[styles.categoryTabText, activeCategory === 'large_format' && { color: '#fff' }]}>Large Format</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.categoryTab, activeCategory === 'di_printing' && styles.categoryTabActive]}
                        onPress={() => setActiveCategory('di_printing')}
                      >
                        <Ionicons name="print-outline" size={14} color={activeCategory === 'di_printing' ? '#fff' : Colors.textSecondary} />
                        <Text style={[styles.categoryTabText, activeCategory === 'di_printing' && { color: '#fff' }]}>DI Printing</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.categoryTab, activeCategory === 'dtf_prints' && styles.categoryTabActive]}
                        onPress={() => setActiveCategory('dtf_prints')}
                      >
                        <Ionicons name="shirt-outline" size={14} color={activeCategory === 'dtf_prints' ? '#fff' : Colors.textSecondary} />
                        <Text style={[styles.categoryTabText, activeCategory === 'dtf_prints' && { color: '#fff' }]}>DTF Prints</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <Ionicons name="information-circle-outline" size={16} color={Colors.secondary} />
                <Text style={styles.infoText}>
                  {activeCategory === 'expense'
                    ? 'Operating costs (Rent, Salary, etc). Revenue is tracked from receipts.'
                    : `Enter costs specifically for ${activeCategory.replace('_', ' ')} on each day.`}
                </Text>
              </View>
            </Section>

            {/* Daily Entries Grid */}
            <Section title={`Daily Ledger: ${dayjs(month).format('MMMM')}`} icon="list">
              <View style={styles.dailyGridHeader}>
                <Text style={[styles.dailyHeaderCell, { flex: 1 }]}>Day</Text>
                <Text style={[styles.dailyHeaderCell, { flex: 1.2 }]}>Expense Input</Text>
                <View style={{ width: 32 }} />
                <Text style={[styles.dailyHeaderCell, { flex: 1, textAlign: 'right' }]}>Revenue</Text>
              </View>

              {Array.from({ length: daysInSelectedMonth }).map((_, i) => (
                <DailyRow
                  key={i}
                  index={i}
                  dayName={dayNamesForMonth[i]}
                  expenseValue={expensesDailyInput?.[i] || ''}
                  revenueValue={revenueDaily?.[i] || 0}
                  currency={currency}
                  onExpenseChange={updateDailyExpenseInput}
                  onSave={persistDailyExpense}
                />
              ))}

              <View style={styles.divider} />
              <Text style={styles.sectionSubtitle}>Monthly Summary</Text>
              <SummaryRow label={`Total Expenses`} value={`${currency}${Number(monthlyTotals.exp).toLocaleString()}`} />
              <SummaryRow label={`Total Revenue`} value={`${currency}${Number(monthlyTotals.rev).toLocaleString()}`} />
              <SummaryRow label={`Net Profit/Loss`} value={`${currency}${Number(monthlyTotals.net).toLocaleString()}`} isNet />

              <TouchableOpacity style={styles.purgeButton} onPress={() => {
                Alert.alert('Clear Month?', 'This will optimize the database by removing zero-value expense records for this month.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Optimize', onPress: async () => {
                      await deleteExpenses(companyData.companyId, month);
                      loadData();
                      showToast('Optimized', 'success');
                    }
                  }
                ]);
              }}>
                <Text style={styles.purgeText}>Optimize Database Records</Text>
              </TouchableOpacity>
            </Section>

            {/* Annual Summary */}
            <Section title={`Annual Overview: ${year}`} icon="stats-chart">
              <View style={styles.yearSelector}>
                <TouchableOpacity onPress={() => setYear(year - 1)}><Ionicons name="chevron-back" size={20} color={Colors.text} /></TouchableOpacity>
                <Text style={styles.yearText}>{year}</Text>
                <TouchableOpacity onPress={() => setYear(year + 1)}><Ionicons name="chevron-forward" size={20} color={Colors.text} /></TouchableOpacity>
              </View>

              <SummaryRow label={`Annual Expenses`} value={`${currency}${Number(annualTotals.exp).toLocaleString()}`} />
              <SummaryRow label={`Annual Revenue`} value={`${currency}${Number(annualTotals.rev).toLocaleString()}`} />
              <SummaryRow label={`Annual Net Profit`} value={`${currency}${Number(finalAnnualNet).toLocaleString()}`} isNet />

              <View style={[styles.conclusionBox, finalAnnualNet >= 0 ? styles.conclusionGood : styles.conclusionBad]}>
                <Ionicons name={finalAnnualNet >= 0 ? "trending-up" : "trending-down"} size={24} color={finalAnnualNet >= 0 ? Colors.success : Colors.error} />
                <Text style={[styles.conclusionText, { color: finalAnnualNet >= 0 ? Colors.success : Colors.error }]}>
                  {finalAnnualNet > 0 ? 'Business is profitable.' : finalAnnualNet < 0 ? 'Operating at a loss.' : 'Break-even.'}
                </Text>
              </View>
            </Section>

          </ScrollView>
        </KeyboardAvoidingView>
      )}

      {toast.visible && (
        <View style={[styles.toast, toast.type === 'success' ? styles.toastSuccess : styles.toastError]}>
          <Text style={styles.toastText}>{toast.message}</Text>
        </View>
      )}
      {busy.visible && (
        <View style={styles.toast}>
          <ActivityIndicator color={Colors.white} size="small" />
          <Text style={[styles.toastText, { marginLeft: 10 }]}>{busy.message}</Text>
        </View>
      )}
      {companyData && !companyData.isPremium && (
        <View style={styles.lockedOverlay}>
          <View style={styles.lockedCard}>
            <View style={styles.lockedIconBg}>
              <Ionicons name="lock-closed" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.lockedTitle}>Premium Feature</Text>
            <Text style={styles.lockedDesc}>
              The Financial Calculator is available for Pro users only. Track your daily expenses and revenue automatically.
            </Text>
            <TouchableOpacity style={styles.upgradeBtn} onPress={() => navigation.navigate('Subscription')}>
              <Text style={styles.upgradeBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelLink} onPress={() => navigation.goBack()}>
              <Text style={styles.cancelLinkText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  // ... existing styles ...

  // Premium Lock Styles
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240, 248, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
    padding: 24,
  },
  lockedCard: {
    backgroundColor: Colors.white,
    width: '100%',
    maxWidth: 340,
    padding: 32,
    borderRadius: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 5,
  },
  lockedIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  lockedDesc: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  upgradeBtn: {
    backgroundColor: Colors.primary,
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  upgradeBtnText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelLink: {
    padding: 8,
  },
  cancelLinkText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
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
  backButton: { marginRight: 15 },
  title: { fontSize: 20, fontWeight: 'bold', color: Colors.white },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },

  scrollContent: { padding: 16, paddingBottom: 40 },
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  section: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginBottom: 16 },

  monthsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: '#F1F5F9' },
  monthChipActive: { backgroundColor: Colors.primary },
  monthChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  infoText: { fontSize: 11, color: Colors.textSecondary, marginLeft: 6, fontStyle: 'italic' },
  categoryRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  categoryTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0'
  },
  categoryTabActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  categoryTabText: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary },

  dailyGridHeader: { flexDirection: 'row', marginBottom: 10, paddingHorizontal: 4 },
  dailyHeaderCell: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase' },

  dailyRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, backgroundColor: '#FAFAFA', padding: 8, borderRadius: 8 },
  dateDayText: { fontSize: 12, fontWeight: '700', color: Colors.text },
  dayNameText: { fontSize: 10, color: Colors.textSecondary },
  dailyInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: Colors.text,
    textAlign: 'right'
  },
  miniSaveBtn: { backgroundColor: Colors.primary, padding: 6, borderRadius: 6, marginLeft: 8 },
  dailyRevenueText: { fontSize: 13, fontWeight: '600', color: Colors.success },

  sectionSubtitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 10, marginTop: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  summaryLabel: { fontSize: 13, color: Colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: '700', color: Colors.text },

  purgeButton: { alignSelf: 'center', marginTop: 15 },
  purgeText: { fontSize: 12, color: Colors.textSecondary, textDecorationLine: 'underline' },

  yearSelector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  yearText: { fontSize: 18, fontWeight: '800', marginHorizontal: 20, color: Colors.text },

  conclusionBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 8, marginTop: 16, gap: 10 },
  conclusionGood: { backgroundColor: '#F0FDF4' },
  conclusionBad: { backgroundColor: '#FEF2F2' },
  conclusionText: { fontWeight: '700', fontSize: 14 },

  toast: { position: 'absolute', bottom: 30, backgroundColor: '#333', left: 20, right: 20, padding: 12, borderRadius: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  toastSuccess: { backgroundColor: Colors.success },
  toastError: { backgroundColor: Colors.error },
  toastText: { color: Colors.white, fontWeight: 'bold', fontSize: 13 }
});

export default FinancialCalculatorScreen;