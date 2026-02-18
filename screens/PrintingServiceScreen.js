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
        materialsUsed: []
    });

    const serviceInfo = useMemo(() => {
        switch (service) {
            case 'large_format':
                return {
                    title: 'Large Format Printing',
                    icon: 'image-outline',
                    color: '#8B5CF6',
                    description: 'Banners, Flex, Stickers & Mesh'
                };
            case 'di_printing':
                return {
                    title: 'DI Printing',
                    icon: 'print-outline',
                    color: '#EC4899',
                    description: 'Small Format & High-Speed Prints'
                };
            case 'dtf_prints':
                return {
                    title: 'DTF Prints',
                    icon: 'shirt-outline',
                    color: '#F97316',
                    description: 'Apparel Heat Transfer & Films'
                };
            default:
                return {
                    title: 'Printing Service',
                    icon: 'print-outline',
                    color: Colors.primary,
                    description: 'Service Analytics'
                };
        }
    }, [service]);

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
                        materialsUsed: []
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
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            >
                {/* Hero Section */}
                <View style={[styles.heroCard, { backgroundColor: serviceInfo.color }]}>
                    <View style={styles.heroOverlay}>
                        <Ionicons name={serviceInfo.icon} size={80} color="rgba(255,255,255,0.2)" style={styles.heroIcon} />
                        <Text style={styles.heroLabel}>Total Revenue</Text>
                        <Text style={styles.heroValue}>{currency}{stats.revenue.toLocaleString()}</Text>
                        <Text style={styles.heroSub}>{serviceInfo.description}</Text>
                    </View>
                </View>

                {/* Quick Stats */}
                <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Total Jobs</Text>
                        <Text style={styles.statValue}>{stats.jobCount}</Text>
                    </View>
                    <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Avg. Job Value</Text>
                        <Text style={styles.statValue}>{currency}{stats.avgValue.toFixed(2)}</Text>
                    </View>
                </View>

                {/* Info Card */}
                <View style={styles.infoCard}>
                    <View style={styles.infoIconContainer}>
                        <Ionicons name="flash-outline" size={24} color={serviceInfo.color} />
                    </View>
                    <View style={styles.infoTextContainer}>
                        <Text style={styles.infoTitle}>Service Active</Text>
                        <Text style={styles.infoDesc}>
                            This service is being tracked under your Printing Press company.
                            Create invoices tagged with this category to see detailed analytics.
                        </Text>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.actionBtn, { backgroundColor: serviceInfo.color }]}
                    onPress={() => navigation.navigate('TemplatePicker', { category: service })}
                >
                    <Text style={styles.actionBtnText}>Create {serviceInfo.title} Invoice</Text>
                    <Ionicons name="arrow-forward" size={20} color="#fff" />
                </TouchableOpacity>

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
        paddingTop: Platform.OS === 'android' ? 40 : 20
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    backBtn: { padding: 4 },
    content: { flex: 1 },
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
    heroLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    heroValue: { color: '#fff', fontSize: 42, fontWeight: '800', marginVertical: 8 },
    heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },
    statsRow: {
        flexDirection: 'row',
        paddingHorizontal: 16,
        gap: 12,
        marginBottom: 16
    },
    statBox: {
        flex: 1,
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        alignItems: 'center'
    },
    statLabel: { fontSize: 12, color: '#64748B', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: 4 },
    statValue: { fontSize: 20, fontWeight: '700', color: '#1E293B' },
    infoCard: {
        margin: 16,
        backgroundColor: '#fff',
        padding: 20,
        borderRadius: 20,
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: '#E2E8F0'
    },
    infoIconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#F1F5F9',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 16
    },
    infoTextContainer: { flex: 1 },
    infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
    infoDesc: { fontSize: 14, color: '#64748B', lineHeight: 20 },
    actionBtn: {
        margin: 16,
        padding: 18,
        borderRadius: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
    },
    actionBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' }
});

export default PrintingServiceScreen;
