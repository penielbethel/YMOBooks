import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    ScrollView,
    TextInput,
    Modal,
    Alert,
    ActivityIndicator,
    FlatList,
    RefreshControl
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { createStock, fetchStock, updateStock, deleteStock } from '../utils/api';

const StockManagementScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [companyId, setCompanyId] = useState(null);
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [activeTab, setActiveTab] = useState('raw_material'); // 'raw_material' or 'finished_good'

    const [stockItems, setStockItems] = useState([]);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        quantity: '',
        unit: 'pcs',
        costPrice: '',
        sellingPrice: '',
        minStockLevel: '',
        description: ''
    });

    useEffect(() => {
        loadCompanyAndStock();
    }, []);

    useEffect(() => {
        if (companyId) loadStock();
    }, [activeTab, companyId]);

    const loadCompanyAndStock = async () => {
        try {
            const stored = await AsyncStorage.getItem('companyData');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCompanyId(parsed.companyId);
                setCurrencySymbol(parsed.currencySymbol || '$');
                await loadStock(parsed.companyId);
            }
        } catch (e) {
            console.error('Failed to load company', e);
        } finally {
            setLoading(false);
        }
    };

    const loadStock = async (cId = companyId) => {
        if (!cId) return;
        setRefreshing(true);
        try {
            // Fetch specifically active tab type
            const res = await fetchStock(cId, activeTab);
            if (res && res.success) {
                setStockItems(res.items || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setRefreshing(false);
        }
    };

    const handleSave = async () => {
        if (!formData.name) return Alert.alert('Error', 'Item name is required');
        if (!companyId) return Alert.alert('Error', 'Company ID missing');

        const payload = {
            ...formData,
            companyId,
            type: activeTab
        };

        setLoading(true);
        try {
            let res;
            if (editItem) {
                // Update
                res = await updateStock(editItem._id, formData);
            } else {
                // Create
                res = await createStock(payload);
            }

            if (res && res.success) {
                setModalVisible(false);
                setEditItem(null);
                resetForm();
                loadStock(); // Reload list
                Alert.alert('Success', `Item ${editItem ? 'updated' : 'added'} successfully`);
            } else {
                Alert.alert('Error', res?.message || 'Operation failed');
            }
        } catch (e) {
            Alert.alert('Error', 'Network request failed');
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id) => {
        Alert.alert('Confirm Delete', 'Are you sure you want to delete this item?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    setLoading(true);
                    try {
                        await deleteStock(id);
                        setStockItems(prev => prev.filter(i => i._id !== id));
                    } catch (e) {
                        Alert.alert('Error', 'Failed to delete item');
                    } finally {
                        setLoading(false);
                    }
                }
            }
        ]);
    };

    const openAddModal = () => {
        setEditItem(null);
        resetForm();
        setModalVisible(true);
    };

    const openEditModal = (item) => {
        setEditItem(item);
        setFormData({
            name: item.name,
            quantity: String(item.quantity || 0),
            unit: item.unit || 'pcs',
            costPrice: String(item.costPrice || 0),
            sellingPrice: String(item.sellingPrice || 0),
            minStockLevel: String(item.minStockLevel || 0),
            description: item.description || ''
        });
        setModalVisible(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            quantity: '',
            unit: 'pcs',
            costPrice: '',
            sellingPrice: '',
            minStockLevel: '',
            description: ''
        });
    };

    const adjustQuantity = async (item, delta) => {
        const newQty = (item.quantity || 0) + delta;
        if (newQty < 0) return;

        // Optimistic update
        setStockItems(prev => prev.map(i => i._id === item._id ? { ...i, quantity: newQty } : i));

        try {
            await updateStock(item._id, { quantity: newQty });
        } catch (e) {
            // Revert if fail
            loadStock();
        }
    };

    const renderItem = ({ item }) => (
        <View style={styles.card}>
            <View style={styles.cardHeader}>
                <View style={styles.headerLeft}>
                    <Text style={styles.itemName}>{item.name}</Text>
                    <Text style={styles.itemMeta}>{item.unit} • Min: {item.minStockLevel}</Text>
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity onPress={() => openEditModal(item)} style={styles.iconBtn}>
                        <Ionicons name="create-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(item._id)} style={styles.iconBtn}>
                        <Ionicons name="trash-outline" size={20} color={Colors.error} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={styles.cardBody}>
                <View style={styles.statRow}>
                    <Text style={styles.statLabel}>Cost Price</Text>
                    <Text style={styles.statValue}>{currencySymbol}{item.costPrice?.toFixed(2)}</Text>
                </View>
                {activeTab === 'finished_good' && (
                    <View style={styles.statRow}>
                        <Text style={styles.statLabel}>Selling Price</Text>
                        <Text style={styles.statValue}>{currencySymbol}{item.sellingPrice?.toFixed(2)}</Text>
                    </View>
                )}
            </View>

            <View style={styles.cardFooter}>
                <View style={styles.stockControl}>
                    <TouchableOpacity onPress={() => adjustQuantity(item, -1)} style={styles.qtyBtn}>
                        <Ionicons name="remove" size={16} color="#fff" />
                    </TouchableOpacity>
                    <Text style={[styles.stockValue, item.quantity <= (item.minStockLevel || 0) && styles.lowStock]}>
                        {item.quantity}
                    </Text>
                    <TouchableOpacity onPress={() => adjustQuantity(item, 1)} style={styles.qtyBtn}>
                        <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                </View>
                <Text style={styles.totalValue}>
                    Val: {currencySymbol}{((item.quantity || 0) * (item.costPrice || 0)).toFixed(2)}
                </Text>
            </View>
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Ionicons name="arrow-back" size={24} color={Colors.white} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Stock Management</Text>
                <TouchableOpacity onPress={openAddModal} style={styles.addBtn}>
                    <Ionicons name="add" size={24} color={Colors.white} />
                </TouchableOpacity>
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'raw_material' && styles.activeTab]}
                    onPress={() => setActiveTab('raw_material')}
                >
                    <Text style={[styles.tabText, activeTab === 'raw_material' && styles.activeTabText]}>
                        Raw Materials
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'finished_good' && styles.activeTab]}
                    onPress={() => setActiveTab('finished_good')}
                >
                    <Text style={[styles.tabText, activeTab === 'finished_good' && styles.activeTabText]}>
                        Finished Goods
                    </Text>
                </TouchableOpacity>
            </View>

            {loading && stockItems.length === 0 ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={stockItems}
                    renderItem={renderItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadStock()} />}
                    ListHeaderComponent={() => {
                        // Calculate summary stats
                        const totalValue = stockItems.reduce((acc, i) => acc + ((i.quantity || 0) * (i.costPrice || 0)), 0);
                        const lowStockCount = stockItems.filter(i => (i.quantity || 0) <= (i.minStockLevel || 0)).length;
                        const totalItems = stockItems.reduce((acc, i) => acc + (i.quantity || 0), 0);

                        return (
                            <View style={styles.summaryContainer}>
                                <View style={styles.summaryCard}>
                                    <Text style={styles.summaryLabel}>Total Stock Value</Text>
                                    <Text style={styles.summaryValueBig}>{currencySymbol}{totalValue.toFixed(2)}</Text>
                                    <View style={styles.summaryRow}>
                                        <Text style={styles.summarySub}>Items: {totalItems}</Text>
                                        <Text style={styles.summarySub}>•</Text>
                                        <Text style={[styles.summarySub, lowStockCount > 0 && { color: Colors.error, fontWeight: 'bold' }]}>
                                            Low Stock: {lowStockCount}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <Ionicons name="cube-outline" size={48} color={Colors.textSecondary} />
                            <Text style={styles.emptyText}>No items found. Tap (+) to add.</Text>
                        </View>
                    }
                />
            )}

            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>
                            {editItem ? 'Edit Item' : 'Add New Stock Item'}
                        </Text>
                        <ScrollView>
                            <Text style={styles.label}>Name</Text>
                            <TextInput
                                style={styles.input}
                                value={formData.name}
                                onChangeText={t => setFormData({ ...formData, name: t })}
                                placeholder="e.g. Flour, Cement, Bread"
                            />

                            <View style={styles.row}>
                                <View style={[styles.col, { marginRight: 8 }]}>
                                    <Text style={styles.label}>Quantity</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={formData.quantity}
                                        onChangeText={t => setFormData({ ...formData, quantity: t })}
                                        keyboardType="numeric"
                                        placeholder="0"
                                    />
                                </View>
                                <View style={[styles.col, { marginLeft: 8 }]}>
                                    <Text style={styles.label}>Unit</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={formData.unit}
                                        onChangeText={t => setFormData({ ...formData, unit: t })}
                                        placeholder="kg, pcs"
                                    />
                                </View>
                            </View>

                            <View style={styles.row}>
                                <View style={[styles.col, { marginRight: 8 }]}>
                                    <Text style={styles.label}>Cost Price ({currencySymbol})</Text>
                                    <TextInput
                                        style={styles.input}
                                        value={formData.costPrice}
                                        onChangeText={t => setFormData({ ...formData, costPrice: t })}
                                        keyboardType="numeric"
                                        placeholder="0.00"
                                    />
                                </View>
                                {activeTab === 'finished_good' && (
                                    <View style={[styles.col, { marginLeft: 8 }]}>
                                        <Text style={styles.label}>Selling Price ({currencySymbol})</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={formData.sellingPrice}
                                            onChangeText={t => setFormData({ ...formData, sellingPrice: t })}
                                            keyboardType="numeric"
                                            placeholder="0.00"
                                        />
                                    </View>
                                )}
                            </View>

                            <Text style={styles.label}>Min Stock Level (Alert)</Text>
                            <TextInput
                                style={styles.input}
                                value={formData.minStockLevel}
                                onChangeText={t => setFormData({ ...formData, minStockLevel: t })}
                                keyboardType="numeric"
                                placeholder="e.g. 10"
                            />
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
                                <Text style={styles.saveBtnText}>Save</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F8FAFC' },
    header: {
        backgroundColor: Colors.primary,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        paddingTop: 40 // Safe area
    },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    backBtn: { padding: 4 },
    addBtn: { padding: 4 },
    tabs: { flexDirection: 'row', backgroundColor: '#fff', elevation: 2 },
    tab: { flex: 1, padding: 16, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: Colors.primary },
    tabText: { color: Colors.textSecondary, fontWeight: '600' },
    activeTabText: { color: Colors.primary },
    listContent: { padding: 16 },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        marginBottom: 12,
        padding: 16,
        elevation: 2,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1
    },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
    itemName: { fontSize: 16, fontWeight: 'bold', color: Colors.text },
    itemMeta: { fontSize: 12, color: Colors.textSecondary },
    headerRight: { flexDirection: 'row', gap: 12 },
    cardBody: { flexDirection: 'row', gap: 16, marginBottom: 12 },
    statRow: {},
    statLabel: { fontSize: 10, color: Colors.textSecondary, textTransform: 'uppercase' },
    statValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    stockControl: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qtyBtn: { backgroundColor: Colors.primary, borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
    stockValue: { fontSize: 16, fontWeight: 'bold', minWidth: 24, textAlign: 'center' },
    lowStock: { color: Colors.error },
    totalValue: { fontSize: 14, fontWeight: 'bold', color: Colors.primary },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 20, maxHeight: '80%' },
    modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
    label: { fontSize: 14, fontWeight: '600', marginBottom: 6, color: Colors.text },
    input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 16 },
    row: { flexDirection: 'row' },
    col: { flex: 1 },
    modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
    cancelBtn: { flex: 1, padding: 14, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, alignItems: 'center' },
    saveBtn: { flex: 1, padding: 14, borderRadius: 8, backgroundColor: Colors.primary, alignItems: 'center' },
    cancelBtnText: { fontWeight: '600', color: Colors.text },
    saveBtnText: { fontWeight: '600', color: '#fff' },

    emptyContainer: { alignItems: 'center', marginTop: 40, opacity: 0.6 },
    emptyText: { marginTop: 12, fontSize: 16, color: Colors.textSecondary },

    // Summary Styles
    summaryContainer: { marginBottom: 16 },
    summaryCard: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        padding: 20,
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6
    },
    summaryLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
    summaryValueBig: { color: '#fff', fontSize: 32, fontWeight: '800', marginVertical: 4 },
    summaryRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
    summarySub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' }
});

export default StockManagementScreen;
