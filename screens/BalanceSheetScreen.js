import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    ActivityIndicator,
    RefreshControl,
    Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { fetchBalanceSheet } from '../utils/api';

const BalanceSheetScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [companyData, setCompanyData] = useState(null);
    const [data, setData] = useState(null);

    useEffect(() => {
        loadCompany();
    }, []);

    useEffect(() => {
        if (companyData) loadData();
    }, [companyData]);

    const loadCompany = async () => {
        try {
            const stored = await AsyncStorage.getItem('companyData');
            if (stored) setCompanyData(JSON.parse(stored));
        } catch (e) {
            console.error(e);
        }
    };

    const loadData = async () => {
        if (!companyData?.companyId) return;
        setLoading(true);
        try {
            const res = await fetchBalanceSheet(companyData.companyId);
            if (res && res.success) {
                setData(res.balanceSheet);
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
    }, [companyData]);

    if (loading && !data) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    const { assets = {}, liabilities = {}, equity = {}, currency = {} } = data || {};
    const sym = currency.symbol || '$';

    const AssetRow = ({ label, value, sub }) => (
        <View style={styles.row}>
            <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{label}</Text>
                {sub && <Text style={styles.rowSub}>{sub}</Text>}
            </View>
            <Text style={styles.rowValue}>{sym}{Number(value || 0).toLocaleString()}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <View>
                    <Text style={styles.headerTitle}>Balance Sheet</Text>
                    <Text style={styles.headerSubtitle}>Financial Position & Wealth</Text>
                </View>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                style={styles.content}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Total Wealth Header */}
                <View style={styles.wealthCard}>
                    <Text style={styles.wealthLabel}>Total Net Worth (Equity)</Text>
                    <Text style={styles.wealthValue}>{sym}{Number(equity.netWorth || 0).toLocaleString()}</Text>
                </View>

                {/* Assets Section */}
                <View style={styles.sectionHeader}>
                    <Ionicons name="wallet-outline" size={20} color={Colors.primary} />
                    <Text style={styles.sectionTitle}>ASSETS (What we own)</Text>
                </View>
                <View style={styles.card}>
                    <AssetRow
                        label="Inventory"
                        value={assets.inventoryValue}
                        sub="Stock of Raw Materials & Finished Goods"
                    />
                    <View style={styles.divider} />
                    <AssetRow
                        label="Accounts Receivable"
                        value={assets.accountsReceivable}
                        sub="Money owed by customers (Unpaid Invoices)"
                    />
                    <View style={styles.divider} />
                    <AssetRow
                        label="Cash & Bank"
                        value={assets.cashAtBank}
                        sub="Available liquidity (Sales - Expenses)"
                    />
                    <View style={[styles.divider, { backgroundColor: Colors.primary, height: 2 }]} />
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Total Assets</Text>
                        <Text style={styles.totalValue}>{sym}{Number(assets.totalAssets || 0).toLocaleString()}</Text>
                    </View>
                </View>

                {/* Liabilities Section */}
                <View style={styles.sectionHeader}>
                    <Ionicons name="alert-circle-outline" size={20} color="#DC2626" />
                    <Text style={styles.sectionTitle}>LIABILITIES (What we owe)</Text>
                </View>
                <View style={styles.card}>
                    <AssetRow
                        label="Short-term Debt"
                        value={liabilities.shortTermDebt || 0}
                        sub="Suppliers & other payables"
                    />
                    <View style={[styles.divider, { backgroundColor: '#DC2626', height: 2 }]} />
                    <View style={styles.totalRow}>
                        <Text style={[styles.totalLabel, { color: '#DC2626' }]}>Total Liabilities</Text>
                        <Text style={[styles.totalValue, { color: '#DC2626' }]}>{sym}{Number(liabilities.totalLiabilities || 0).toLocaleString()}</Text>
                    </View>
                </View>

                {/* Summary Note */}
                <View style={styles.infoNote}>
                    <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
                    <Text style={styles.infoNoteText}>
                        This statement represents the current wealth of the company based on stock value, pending payments, and cash flows.
                    </Text>
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
        padding: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        gap: 16
    },
    headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
    headerSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
    backBtn: { padding: 4 },
    content: { flex: 1, padding: 16 },
    wealthCard: {
        backgroundColor: Colors.primary,
        borderRadius: 20,
        padding: 30,
        alignItems: 'center',
        marginBottom: 24,
        elevation: 8,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 15
    },
    wealthLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    wealthValue: { color: '#fff', fontSize: 36, fontWeight: 'bold', marginTop: 8 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8 },
    sectionTitle: { fontSize: 13, fontWeight: '800', color: Colors.textSecondary, letterSpacing: 0.5 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        elevation: 2
    },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    rowLabel: { fontSize: 15, fontWeight: '600', color: Colors.text },
    rowSub: { fontSize: 11, color: Colors.textSecondary, marginTop: 2 },
    rowValue: { fontSize: 16, fontWeight: '700', color: Colors.text },
    divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
    totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12 },
    totalLabel: { fontSize: 16, fontWeight: '800', color: Colors.primary },
    totalValue: { fontSize: 20, fontWeight: '800', color: Colors.primary },
    infoNote: { flexDirection: 'row', gap: 12, backgroundColor: '#EFF6FF', padding: 16, borderRadius: 12, alignItems: 'center' },
    infoNoteText: { flex: 1, fontSize: 12, color: '#1E40AF', fontStyle: 'italic', lineHeight: 18 }
});

export default BalanceSheetScreen;
