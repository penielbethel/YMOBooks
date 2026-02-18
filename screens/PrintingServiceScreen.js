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

const PrintingServiceScreen = ({ navigation, route }) => {
    const { service } = route.params; // 'large_format', 'di_printing', 'dtf_prints'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [companyData, setCompanyData] = useState(null);
    const [stats, setStats] = useState({
        revenue: 0,
        jobCount: 0,
        avgValue: 0,
        net: 0,
    });

    const serviceInfo = useMemo(() => {
        switch (service) {
            case 'large_format':
                return {
                    title: 'Large Format Printing',
                    shortTitle: 'Large Format',
                    icon: 'image-outline',
                    color: '#8B5CF6',
                    gradient: '#A78BFA',
                    description: 'Banners, Flex, Stickers & Mesh'
                };
            case 'di_printing':
                return {
                    title: 'DI Printing',
                    shortTitle: 'DI Printing',
                    icon: 'print-outline',
                    color: '#EC4899',
                    gradient: '#F472B6',
                    description: 'Small Format & High-Speed Prints'
                };
            case 'dtf_prints':
                return {
                    title: 'DTF Prints',
                    shortTitle: 'DTF Prints',
                    icon: 'shirt-outline',
                    color: '#F97316',
                    gradient: '#FB923C',
                    description: 'Apparel Heat Transfer & Films'
                };
            case 'photo_frames':
                return {
                    title: 'Photo Frame Production',
                    shortTitle: 'Photo Frames',
                    icon: 'image-outline',
                    color: '#10B981',
                    gradient: '#34D399',
                    description: 'Custom Frames, Mounting & Portraits'
                };
            default:
                return {
                    title: 'Printing Service',
                    shortTitle: 'Service',
                    icon: 'print-outline',
                    color: Colors.primary,
                    gradient: Colors.primary,
                    description: 'Service Analytics'
                };
        }
    }, [service]);

    // The 3 core functions each service gets
    const actionItems = useMemo(() => [
        {
            id: 'create_invoice',
            title: 'Create Invoice',
            description: `New ${serviceInfo.shortTitle} invoice`,
            icon: 'document-text-outline',
            tint: serviceInfo.color,
            onPress: () => navigation.navigate('TemplatePicker', { category: service }),
        },
        {
            id: 'invoice_history',
            title: 'Invoice History',
            description: `View ${serviceInfo.shortTitle} invoices`,
            icon: 'albums-outline',
            tint: '#10B981',
            onPress: () => navigation.navigate('InvoiceHistory', { category: service, serviceTitle: serviceInfo.shortTitle }),
        },
        {
            id: 'profit_loss',
            title: 'Profit & Loss',
            description: `${serviceInfo.shortTitle} profitability`,
            icon: 'bar-chart-outline',
            tint: '#6366F1',
            onPress: () => navigation.navigate('ProfitLoss', { category: service, serviceTitle: serviceInfo.shortTitle }),
        },
    ], [serviceInfo, service, navigation]);

    useEffect(() => {
        loadData();
    }, [service]);

    const loadData = async () => {
        setLoading(true);
        try {
            const stored = await AsyncStorage.getItem('companyData');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCompanyData(parsed);

                // Fetch real data from server
                const currentMonth = dayjs().format('YYYY-MM');
                const res = await fetchFinanceSummary(parsed.companyId, currentMonth, service);
                if (res && res.success && res.summary) {
                    setStats({
                        revenue: res.summary.revenue || 0,
                        jobCount: res.summary.jobCount || 0,
                        avgValue: res.summary.avgValue || 0,
                        net: res.summary.net || 0,
                    });
                }
            }
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        loadData().finally(() => setRefreshing(false));
    }, []);

    if (loading && !companyData) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={serviceInfo.color} />
            </View>
        );
    }

    const currency = companyData?.currencySymbol || '$';

    return (
        <SafeAreaView style={styles.container}>
            <View style={[styles.header, { backgroundColor: serviceInfo.color }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>{serviceInfo.title}</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={styles.contentContainer}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Hero Section */}
                <View style={[styles.heroCard, { backgroundColor: serviceInfo.color }]}>
                    <View style={styles.heroOverlay}>
                        <Ionicons name={serviceInfo.icon} size={80} color="rgba(255,255,255,0.15)" style={styles.heroIcon} />
                        <Text style={styles.heroLabel}>This Month's Revenue</Text>
                        <Text style={styles.heroValue}>{currency}{stats.revenue.toLocaleString()}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginTop: 10, marginBottom: 5 }}>
                            <Ionicons name={stats.net >= 0 ? "trending-up" : "trending-down"} size={16} color="#fff" style={{ marginRight: 6 }} />
                            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>Est. Net Profit: {currency}{stats.net.toLocaleString()}</Text>
                        </View>
                        <Text style={styles.heroSub}>{serviceInfo.description}</Text>
                    </View>
                </View>

                {/* Quick Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Ionicons name="receipt-outline" size={22} color={serviceInfo.color} style={{ marginBottom: 4 }} />
                        <Text style={styles.statLabel}>Total Jobs</Text>
                        <Text style={styles.statValue}>{stats.jobCount}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Ionicons name="cash-outline" size={22} color={serviceInfo.color} style={{ marginBottom: 4 }} />
                        <Text style={styles.statLabel}>Avg. Job Value</Text>
                        <Text style={styles.statValue}>{currency}{stats.avgValue.toFixed(0)}</Text>
                    </View>
                </View>

                {/* Service Functions - The 3 Core Action Tiles */}
                <Text style={styles.sectionTitle}>{serviceInfo.shortTitle} Functions</Text>

                <View style={styles.actionsGrid}>
                    {actionItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.actionTile}
                            onPress={item.onPress}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.actionIconWrapper, { backgroundColor: item.tint + '15' }]}>
                                <Ionicons name={item.icon} size={28} color={item.tint} />
                            </View>
                            <Text style={styles.actionTitle}>{item.title}</Text>
                            <Text style={styles.actionDesc}>{item.description}</Text>
                            <Ionicons
                                name="chevron-forward"
                                size={18}
                                color={Colors.textSecondary || '#94A3B8'}
                                style={styles.actionArrow}
                            />
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.infoIconContainer}>
                        <Ionicons name="information-circle-outline" size={24} color={serviceInfo.color} />
                    </View>
                    <View style={styles.infoTextContainer}>
                        <Text style={styles.infoTitle}>How It Works</Text>
                        <Text style={styles.infoDesc}>
                            All invoices, receipts, and financial reports created here are tagged
                            specifically for <Text style={{ fontWeight: '700' }}>{serviceInfo.shortTitle}</Text>.
                            Your data stays separate from other printing services.
                        </Text>
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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    backBtn: { padding: 4 },
    content: { flex: 1 },
    contentContainer: { paddingBottom: 20 },
    heroCard: {
        margin: 16,
        borderRadius: 24,
        overflow: 'hidden',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
    },
    heroOverlay: {
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    heroIcon: {
        position: 'absolute',
        top: -10,
        right: -10,
    },
    heroLabel: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    heroValue: { color: '#fff', fontSize: 42, fontWeight: '800', marginVertical: 8 },
    heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 20,
    },
    statBox: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center',
        elevation: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
    },
    statLabel: {
        fontSize: 12,
        color: '#64748B',
        fontWeight: 'bold',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    statValue: { fontSize: 22, fontWeight: '700', color: '#1E293B' },

    sectionTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#1E293B',
        paddingHorizontal: 20,
        marginBottom: 12,
    },

    actionsGrid: {
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 20,
    },
    actionTile: {
        backgroundColor: '#fff',
        borderRadius: 18,
        padding: 20,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#E2E8F0',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
    },
    actionIconWrapper: {
        width: 52,
        height: 52,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    actionTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
        flex: 1,
    },
    actionDesc: {
        display: 'none', // hide on small screens, use as accessibility label
    },
    actionArrow: {
        marginLeft: 8,
    },

    infoCard: {
        margin: 16,
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 20,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    infoIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16,
    },
    infoTextContainer: { flex: 1 },
    infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
    infoDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },
});

export default PrintingServiceScreen;
