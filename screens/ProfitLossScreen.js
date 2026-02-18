import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Dimensions,
    Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import dayjs from 'dayjs';
import { Colors } from '../constants/Colors';
import { fetchFinanceSummary } from '../utils/api';

const { width } = Dimensions.get('window');

const ProfitLossScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [companyData, setCompanyData] = useState(null);
    const [month, setMonth] = useState(dayjs().format('YYYY-MM'));
    const [summary, setSummary] = useState(null);

    useEffect(() => {
        loadCompany();
    }, []);

    useEffect(() => {
        if (companyData) loadData();
    }, [companyData, month]);

    const loadCompany = async () => {
        try {
            const stored = await AsyncStorage.getItem('companyData');
            if (stored) {
                setCompanyData(JSON.parse(stored));
            }
        } catch (e) {
            console.error(e);
        }
    };

    const loadData = async () => {
        if (!companyData?.companyId) return;
        setLoading(true);
        try {
            const res = await fetchFinanceSummary(companyData.companyId, month);
            if (res && res.success) {
                setSummary(res.summary);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadData();
        setRefreshing(false);
    }, [companyData, month]);

    const monthsOptions = useMemo(() => {
        const arr = [];
        const start = dayjs();
        for (let i = 0; i < 12; i++) {
            const m = start.subtract(i, 'month');
            arr.push({ key: m.format('YYYY-MM'), label: m.format('MMM YYYY') });
        }
        return arr;
    }, []);

    const currency = companyData?.currencySymbol || '$';

    if (loading && !summary) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    const {
        revenue = 0,
        expenses = { productionCost: 0, runningExpenses: 0, totalExpenses: 0 },
        net = 0
    } = summary || {};

    const grossProfit = revenue - expenses.productionCost;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (net / revenue) * 100 : 0;

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Profit & Loss Statement</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Period Selector */}
                <View style={styles.periodSection}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
                        {monthsOptions.map((m) => (
                            <TouchableOpacity
                                key={m.key}
                                style={[styles.monthChip, month === m.key && styles.activeMonthChip]}
                                onPress={() => setMonth(m.key)}
                            >
                                <Text style={[styles.monthText, month === m.key && styles.activeMonthText]}>
                                    {m.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Primary Metric - Net Profit */}
                <View style={[styles.mainCard, net >= 0 ? styles.cardSuccess : styles.cardError]}>
                    <Text style={styles.mainLabel}>Net Profit</Text>
                    <Text style={styles.mainValue}>{currency}{Math.abs(net).toLocaleString()}</Text>
                    <View style={styles.marginBadge}>
                        <Text style={styles.marginText}>Net Margin: {netMargin.toFixed(1)}%</Text>
                    </View>
                </View>

                {/* Revenue Section */}
                <View style={styles.sectionCard}>
                    <View style={styles.row}>
                        <View style={styles.iconBoxRev}>
                            <Ionicons name="trending-up" size={20} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionLabel}>Total Revenue</Text>
                            <Text style={styles.sectionValue}>{currency}{revenue.toLocaleString()}</Text>
                        </View>
                    </View>
                </View>

                {/* COGS & Gross Profit */}
                <View style={styles.sectionCard}>
                    <View style={styles.row}>
                        <View style={styles.iconBoxExp}>
                            <Ionicons name="construct-outline" size={20} color="#DC2626" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionLabel}>Cost of Goods Sold (COGS)</Text>
                            <Text style={styles.sectionValue}>{currency}{expenses.productionCost.toLocaleString()}</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.subLabel}>Gross Profit</Text>
                            <Text style={styles.subValue}>{currency}{grossProfit.toLocaleString()}</Text>
                        </View>
                        <View style={styles.percentageBox}>
                            <Text style={styles.percentageText}>{grossMargin.toFixed(1)}% Margin</Text>
                        </View>
                    </View>
                </View>

                {/* Operating Expenses */}
                <View style={styles.sectionCard}>
                    <View style={styles.row}>
                        <View style={styles.iconBoxMisc}>
                            <Ionicons name="receipt-outline" size={20} color="#4B5563" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.sectionLabel}>Operating Expenses</Text>
                            <Text style={styles.sectionValue}>{currency}{expenses.runningExpenses.toLocaleString()}</Text>
                        </View>
                    </View>
                </View>

                {/* Visual Breakdown Bar */}
                <View style={styles.breakdownCard}>
                    <Text style={styles.breakdownTitle}>Spending Breakdown</Text>
                    <View style={styles.barContainer}>
                        <View style={[styles.barProduction, { flex: Math.max(expenses.productionCost, 1) }]} />
                        <View style={[styles.barRunning, { flex: Math.max(expenses.runningExpenses, 1) }]} />
                        <View style={[styles.barNet, { flex: Math.max(net > 0 ? net : 0, 1) }]} />
                    </View>
                    <View style={styles.legend}>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                            <Text style={styles.legendText}>COGS</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#6366F1' }]} />
                            <Text style={styles.legendText}>OpEx</Text>
                        </View>
                        <View style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
                            <Text style={styles.legendText}>Profit</Text>
                        </View>
                    </View>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    header: {
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 20
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    backBtn: { padding: 4 },
    content: { flex: 1 },
    periodSection: { backgroundColor: '#fff', paddingVertical: 12, elevation: 1 },
    monthScroll: { paddingHorizontal: 16 },
    monthChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: '#F1F5F9',
        marginRight: 10
    },
    activeMonthChip: { backgroundColor: Colors.primary },
    monthText: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    activeMonthText: { color: '#fff' },
    mainCard: {
        margin: 16,
        padding: 24,
        borderRadius: 16,
        alignItems: 'center',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8
    },
    cardSuccess: { backgroundColor: '#10B981' },
    cardError: { backgroundColor: '#EF4444' },
    mainLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', textTransform: 'uppercase' },
    mainValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginVertical: 8 },
    marginBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
    marginText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    sectionCard: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginBottom: 12,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    iconBoxRev: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' },
    iconBoxExp: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
    iconBoxMisc: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center' },
    sectionLabel: { fontSize: 13, color: Colors.textSecondary, fontWeight: '600' },
    sectionValue: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    subLabel: { fontSize: 12, color: Colors.textSecondary },
    subValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
    percentageBox: { backgroundColor: '#F0F9FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
    percentageText: { fontSize: 12, color: '#0369A1', fontWeight: 'bold' },
    breakdownCard: {
        backgroundColor: '#fff',
        margin: 16,
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    breakdownTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.text, marginBottom: 16 },
    barContainer: { height: 24, flexDirection: 'row', borderRadius: 12, overflow: 'hidden', backgroundColor: '#F1F5F9' },
    barProduction: { backgroundColor: '#F59E0B' },
    barRunning: { backgroundColor: '#6366F1' },
    barNet: { backgroundColor: '#10B981' },
    legend: { flexDirection: 'row', justifyContent: 'center', gap: 20, marginTop: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '500' }
});

export default ProfitLossScreen;
