import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, ActivityIndicator, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { updateCompany, getApiBaseUrl } from '../utils/api'; // Ensure getApiBaseUrl is imported
import { WebView } from 'react-native-webview';

const SubscriptionScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(false);
    const [companyData, setCompanyData] = useState(null);
    const [paymentLink, setPaymentLink] = useState(null);
    const [showGateway, setShowGateway] = useState(false);

    useEffect(() => {
        (async () => {
            try {
                const stored = await AsyncStorage.getItem('companyData');
                if (stored) setCompanyData(JSON.parse(stored));
            } catch (_) { }
        })();
    }, []);

    const handleSubscribe = async () => {
        if (!companyData?.companyId) return;
        setLoading(true);
        try {
            // Call API to initiate payment
            const response = await fetch(`${getApiBaseUrl()}/api/pay/initiate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: companyData.companyId,
                    userEmail: companyData.email || 'customer@example.com',
                    currency: companyData.currencyCode || 'USD',
                    amount: '5'
                })
            });
            const data = await response.json();

            if (data.success && data.link) {
                setPaymentLink(data.link);
                setShowGateway(true);
            } else {
                Alert.alert('Error', data.message || 'Could not initiate payment.');
            }
        } catch (err) {
            Alert.alert('Error', 'Payment initiation failed. Network error.');
        } finally {
            setLoading(false);
        }
    };

    const handleWebViewNavigation = async (navState) => {
        const { url } = navState;
        if (!url) return;

        // Check for success callback
        // The server redirects to https://ymobooks.com/payment-callback?status=successful&tx_ref=...
        if (url.includes('payment-callback')) {
            setShowGateway(false);
            if (url.includes('status=successful') || url.includes('status=completed')) {
                // Payment successful!
                await upgradeToPremium();
            } else {
                Alert.alert('Payment Cancelled', 'The transaction was not completed.');
            }
        }
    };

    const upgradeToPremium = async () => {
        setLoading(true);
        try {
            // Double check with server or just trust the redirect for UX speed + webhook backup
            const res = await updateCompany({ companyId: companyData.companyId, isPremium: true });

            if (res?.success) {
                const updated = { ...companyData, isPremium: true };
                await AsyncStorage.setItem('companyData', JSON.stringify(updated));
                setCompanyData(updated);
                Alert.alert('Success', 'Welcome to Pro! You now have access to premium templates and the financial calculator.', [
                    { text: 'OK', onPress: () => navigation.goBack() }
                ]);
            } else {
                Alert.alert('Error', 'Payment recorded but failed to update status locally. Please restart app.');
            }
        } catch (e) {
            Alert.alert('Error', 'Error updating subscription status.');
        } finally {
            setLoading(false);
        }
    };

    const getPriceDisplay = () => {
        const code = companyData?.currencyCode || 'USD';
        const symbol = companyData?.currencySymbol || '$';

        let amount = '5.00';
        switch (code) {
            case 'NGN': amount = '8,000'; break;
            case 'GBP': amount = '4.00'; break;
            case 'EUR': amount = '4.60'; break;
            case 'GHS': amount = '80.00'; break;
            case 'KES': amount = '750'; break;
            default: amount = '5.00'; break;
        }
        return `${symbol}${amount}`;
    };

    const isSuperAdmin = ['pbmsrvr', 'pbmsrv'].includes(companyData?.companyId?.toLowerCase());
    const isPro = companyData?.isPremium || isSuperAdmin;

    if (isPro) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={[styles.header, { backgroundColor: Colors.primary }]}>
                    <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                        <Ionicons name="close" size={24} color="#fff" />
                    </TouchableOpacity>
                    <Text style={[styles.headerTitle, { color: '#fff' }]}>PRO Account</Text>
                </View>
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <Ionicons name="checkmark-circle" size={80} color="#10B981" />
                    <Text style={{ fontSize: 24, fontWeight: 'bold', marginTop: 16 }}>You are a Pro User</Text>
                    <Text style={{ textAlign: 'center', color: '#64748B', marginTop: 8 }}>
                        {isSuperAdmin
                            ? 'Superadmin Access: All features are unlocked for testing.'
                            : 'Thank you for your subscription! All premium features are unlocked.'}
                    </Text>
                    <TouchableOpacity
                        style={{ backgroundColor: Colors.primary, paddingVertical: 16, paddingHorizontal: 32, borderRadius: 12, marginTop: 32, width: '100%', alignItems: 'center' }}
                        onPress={() => navigation.goBack()}
                    >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>Back to Dashboard</Text>
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Ionicons name="close" size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Upgrade to Pro</Text>
            </View>

            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.hero}>
                    <View style={styles.iconContainer}>
                        <Ionicons name="diamond" size={48} color={Colors.accent} />
                    </View>
                    <Text style={styles.heroTitle}>Unlock Premium Features</Text>
                    <Text style={styles.heroSubtitle}>Take your business to the next level with professional tools.</Text>
                </View>

                <View style={styles.featuresCard}>
                    <View style={styles.featureRow}>
                        <Ionicons name="documents-outline" size={24} color={Colors.primary} />
                        <View style={styles.featureText}>
                            <Text style={styles.featureTitle}>4 Premium Invoice Templates</Text>
                            <Text style={styles.featureDesc}>Access Modern, Minimal, Bold, and Compact designs.</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.featureRow}>
                        <Ionicons name="calculator-outline" size={24} color={Colors.primary} />
                        <View style={styles.featureText}>
                            <Text style={styles.featureTitle}>Financial Calculator</Text>
                            <Text style={styles.featureDesc}>Track expenses, revenue, and daily profit/loss automatically.</Text>
                        </View>
                    </View>
                    <View style={styles.divider} />
                    <View style={styles.featureRow}>
                        <Ionicons name="checkmark-circle-outline" size={24} color={Colors.primary} />
                        <View style={styles.featureText}>
                            <Text style={styles.featureTitle}>One-Time Payment</Text>
                            <Text style={styles.featureDesc}>Pay once, own it forever. No monthly fees.</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.priceContainer}>
                    <Text style={styles.priceLabel}>Total Price</Text>
                    <Text style={styles.priceValue}>{getPriceDisplay()}</Text>
                </View>

                <TouchableOpacity
                    style={[styles.payButton, loading && styles.disabledBtn]}
                    onPress={handleSubscribe}
                    disabled={loading}
                >
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.payButtonText}>Pay Now & Upgrade</Text>}
                </TouchableOpacity>

                <Text style={styles.disclaimer}>
                    By continuing, you agree to our Terms of Service. Payment is processed securely via Flutterwave.
                </Text>
            </ScrollView>

            <Modal visible={showGateway} onRequestClose={() => setShowGateway(false)}>
                <SafeAreaView style={{ flex: 1 }}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Secure Payment</Text>
                        <TouchableOpacity onPress={() => setShowGateway(false)}>
                            <Ionicons name="close" size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>
                    {paymentLink && (
                        <WebView
                            source={{ uri: paymentLink }}
                            onNavigationStateChange={handleWebViewNavigation}
                            startInLoadingState
                            renderLoading={() => <ActivityIndicator size="large" color={Colors.primary} style={{ flex: 1 }} />}
                        />
                    )}
                </SafeAreaView>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', backgroundColor: '#fff' },
    closeButton: { position: 'absolute', left: 16, padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.text },
    content: { padding: 24, alignItems: 'center' },
    hero: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
    iconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
    heroTitle: { fontSize: 24, fontWeight: '800', color: Colors.text, textAlign: 'center', marginBottom: 8 },
    heroSubtitle: { fontSize: 14, color: Colors.textSecondary, textAlign: 'center', maxWidth: 280, lineHeight: 20 },
    featuresCard: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 2, marginBottom: 24 },
    featureRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12 },
    featureText: { marginLeft: 16, flex: 1 },
    featureTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 4 },
    featureDesc: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
    divider: { height: 1, backgroundColor: '#F1F5F9', width: '100%' },
    priceContainer: { marginBottom: 24, alignItems: 'center' },
    priceLabel: { fontSize: 14, color: Colors.textSecondary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 },
    priceValue: { fontSize: 36, fontWeight: '800', color: Colors.primary },
    payButton: { width: '100%', backgroundColor: Colors.primary, paddingVertical: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 },
    disabledBtn: { opacity: 0.7 },
    payButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    disclaimer: { marginTop: 16, fontSize: 11, color: Colors.textSecondary, textAlign: 'center', maxWidth: 260 },
    modalHeader: { padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    modalTitle: { fontSize: 16, fontWeight: 'bold' }
});

export default SubscriptionScreen;
