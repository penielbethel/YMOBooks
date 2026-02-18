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

const ProfitLossScreen = ({ navigation, route }) => {
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
            const category = route?.params?.category;
            const res = await fetchFinanceSummary(companyData.companyId, month, category);
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
        net = 0,
        breakdown = {}
    } = summary || {};

    const grossProfit = revenue - expenses.productionCost;
    const grossMargin = revenue > 0 ? (grossProfit / revenue) * 100 : 0;
    const netMargin = revenue > 0 ? (net / revenue) * 100 : 0;

    const getServiceDetails = (key) => {
        switch (key) {
            case 'large_format': return { label: 'Large Format', color: '#8B5CF6', icon: 'image-outline' };
            case 'di_printing': return { label: 'DI Printing', color: '#EC4899', icon: 'print-outline' };
            case 'dtf_prints': return { label: 'DTF Prints', color: '#F97316', icon: 'shirt-outline' };
            case 'photo_frames': return { label: 'Photo Frames', color: '#10B981', icon: 'image-outline' };
            default: return { label: 'Other / General', color: '#64748B', icon: 'document-outline' };
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{route?.params?.serviceTitle ? `${route.params.serviceTitle} P&L` : 'Overall Profit & Loss'}</Text>
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
                <View style={[styles.mainCard, { backgroundColor: net >= 0 ? '#059669' : '#DC2626' }]}>
                    <View style={styles.mainCardHeader}>
                        <Ionicons name={net >= 0 ? "trending-up" : "trending-down"} size={24} color="rgba(255,255,255,0.7)" />
                        <Text style={styles.mainLabel}>Monthly Net Profit</Text>
                    </View>
                    <Text style={styles.mainValue}>{currency}{Math.abs(net).toLocaleString()}</Text>
                    <View style={styles.marginBadge}>
                        <Text style={styles.marginText}>NET MARGIN: {netMargin.toFixed(1)}%</Text>
                    </View>
                </View>

                {/* Summary Rows */}
                <View style={styles.summaryGrid}>
                    <View style={styles.miniCard}>
                        <Text style={styles.miniLabel}>Total Revenue</Text>
                        <Text style={[styles.miniValue, { color: '#059669' }]}>{currency}{revenue.toLocaleString()}</Text>
                    </View>
                    <View style={styles.miniCard}>
                        <Text style={styles.miniLabel}>Total Expenses</Text>
                        <Text style={[styles.miniValue, { color: '#DC2626' }]}>{currency}{expenses.totalExpenses.toLocaleString()}</Text>
                    </View>
                </View>

                {/* Service Breakdown - ONLY show on Overall P&L */}
                {!route?.params?.category && Object.keys(breakdown).length > 0 && (
                    <View style={styles.breakdownSection}>
                        <Text style={styles.sectionTitle}>Service Performance</Text>
                        <View style={styles.serviceList}>
                            {Object.entries(breakdown).sort((a, b) => b[1].revenue - a[1].revenue).map(([key, data]) => {
                                const details = getServiceDetails(key);
                                const margin = data.revenue > 0 ? ((data.net / data.revenue) * 100).toFixed(1) : 0;
                                return (
                                    <View key={key} style={styles.serviceCard}>
                                        <View style={[styles.serviceIconBg, { backgroundColor: details.color + '15' }]}>
                                            <Ionicons name={details.icon} size={20} color={details.color} />
                                        </View>
                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                            <Text style={styles.serviceName}>{details.label}</Text>
                                            <Text style={styles.serviceMeta}>Rev: {currency}{data.revenue.toLocaleString()}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={[styles.serviceNet, { color: data.net >= 0 ? '#059669' : '#DC2626' }]}>
                                                {data.net >= 0 ? '+' : ''}{currency}{data.net.toLocaleString()}
                                            </Text>
                                            <Text style={styles.serviceMargin}>{margin}% margin</Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* Detailed Breakdown */}
                <View style={styles.detailsSection}>
                    <Text style={styles.sectionTitle}>Financial Analysis</Text>

                    {/* COGS & Gross Profit */}
                    <View style={styles.infoRow}>
                        <View style={styles.infoRowTop}>
                            <Text style={styles.infoRowLabel}>Gross Profit (Revenue - COGS)</Text>
                            <Text style={styles.infoRowValue}>{currency}{grossProfit.toLocaleString()}</Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressBar, { width: `${Math.min(grossMargin, 100)}%`, backgroundColor: '#10B981' }]} />
                        </View>
                        <Text style={styles.infoRowSub}>Gross Margin: {grossMargin.toFixed(1)}%</Text>
                    </View>

                    {/* Operating Costs */}
                    <View style={styles.infoRow}>
                        <View style={styles.infoRowTop}>
                            <Text style={styles.infoRowLabel}>Operational Efficiency</Text>
                            <Text style={styles.infoRowValue}>{currency}{expenses.runningExpenses.toLocaleString()}</Text>
                        </View>
                        <View style={styles.progressTrack}>
                            <View style={[styles.progressBar, { width: `${Math.min((expenses.runningExpenses / (revenue || 1)) * 100, 100)}%`, backgroundColor: '#6366F1' }]} />
                        </View>
                        <Text style={styles.infoRowSub}>OpEx is {(expenses.runningExpenses / (revenue || 1) * 100).toFixed(1)}% of Revenue</Text>
                    </View>
                </View>

                {/* Visual Component Bar */}
                <View style={styles.breakdownCard}>
                    <Text style={styles.breakdownTitle}>Capital Allocation</Text>
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
                            <Text style={styles.legendText}>Net Profit</Text>
                        </View>
                    </View>
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>

            {companyData && !companyData.isPremium && !['pbmsrvr', 'pbmsrv'].includes(companyData?.companyId?.toLowerCase()) && (
                <View style={styles.lockedOverlay}>
                    <View style={styles.lockedCard}>
                        <View style={styles.lockedIconBg}>
                            <Ionicons name="lock-closed" size={40} color={Colors.primary} />
                        </View>
                        <Text style={styles.lockedTitle}>Premium Feature</Text>
                        <Text style={styles.lockedDesc}>
                            The {route?.params?.serviceTitle || 'Financial Analysis'} is available for Pro users only. Track your profitability with advanced insights.
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
    periodSection: { backgroundColor: '#fff', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
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
        borderRadius: 24,
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.15,
        shadowRadius: 15,
    },
    mainCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    mainLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginLeft: 8 },
    mainValue: { color: '#fff', fontSize: 42, fontWeight: '900', letterSpacing: -1 },
    marginBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 12 },
    marginText: { color: '#fff', fontSize: 11, fontWeight: '900' },

    summaryGrid: { flexDirection: 'row', paddingHorizontal: 16, gap: 12, marginBottom: 24 },
    miniCard: { flex: 1, backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#F1F5F9', elevation: 2 },
    miniLabel: { fontSize: 11, color: Colors.textSecondary, fontWeight: '700', textTransform: 'uppercase', marginBottom: 4 },
    miniValue: { fontSize: 18, fontWeight: '800' },

    breakdownSection: { paddingHorizontal: 16, marginBottom: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1E293B', marginBottom: 12, letterSpacing: -0.5 },
    serviceList: { gap: 10 },
    serviceCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        padding: 12,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    serviceIconBg: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    serviceName: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
    serviceMeta: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
    serviceNet: { fontSize: 14, fontWeight: '800' },
    serviceMargin: { fontSize: 10, color: Colors.textSecondary, fontWeight: '600', marginTop: 2 },

    detailsSection: { marginHorizontal: 16, marginBottom: 24, padding: 20, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#F1F5F9' },
    infoRow: { marginBottom: 20 },
    infoRowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    infoRowLabel: { fontSize: 13, fontWeight: '600', color: '#64748B' },
    infoRowValue: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
    infoRowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 4, fontWeight: '500' },
    progressTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, overflow: 'hidden' },
    progressBar: { height: '100%', borderRadius: 3 },

    breakdownCard: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#F1F5F9'
    },
    breakdownTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B', marginBottom: 16 },
    barContainer: { height: 16, flexDirection: 'row', borderRadius: 8, overflow: 'hidden', backgroundColor: '#F1F5F9' },
    barProduction: { backgroundColor: '#F59E0B' },
    barRunning: { backgroundColor: '#6366F1' },
    barNet: { backgroundColor: '#10B981' },
    legend: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 16 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },

    // Premium Lock Styles
    lockedOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(248, 250, 252, 0.98)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: 24,
    },
    lockedCard: {
        backgroundColor: '#fff',
        width: '100%',
        maxWidth: 400,
        padding: 32,
        borderRadius: 24,
        alignItems: 'center',
        elevation: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
    },
    lockedIconBg: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    lockedTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#1E293B',
        marginBottom: 12,
    },
    lockedDesc: {
        fontSize: 15,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    upgradeBtn: {
        backgroundColor: Colors.primary,
        width: '100%',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    upgradeBtnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
    cancelLink: {
        paddingVertical: 8,
    },
    cancelLinkText: {
        color: '#64748B',
        fontSize: 14,
        fontWeight: '600',
    }
});

export default ProfitLossScreen;
