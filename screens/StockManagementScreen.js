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
import { createStock, fetchStock, updateStock, deleteStock, recordProduction, fetchProductionHistory } from '../utils/api';

const StockManagementScreen = ({ navigation }) => {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [companyId, setCompanyId] = useState(null);
    const [currencySymbol, setCurrencySymbol] = useState('$');
    const [activeTab, setActiveTab] = useState('raw_material'); // 'raw_material', 'finished_good', 'history'

    const [stockItems, setStockItems] = useState([]);
    const [productionLogs, setProductionLogs] = useState([]);

    // Modal State
    const [modalVisible, setModalVisible] = useState(false);
    const [productionModalVisible, setProductionModalVisible] = useState(false);
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

    const [productionForm, setProductionForm] = useState({
        finishedGoodId: '',
        quantityProduced: '',
        materialsUsed: [], // { materialId, quantity }
        notes: ''
    });

    useEffect(() => {
        loadCompanyAndStock();
    }, []);

    useEffect(() => {
        if (companyId) {
            if (activeTab === 'history') {
                loadProductionHistory();
            } else {
                loadStock();
            }
        }
    }, [activeTab, companyId]);

    const loadCompanyAndStock = async () => {
        try {
            const stored = await AsyncStorage.getItem('companyData');
            if (stored) {
                const parsed = JSON.parse(stored);
                setCompanyId(parsed.companyId);
                setCurrencySymbol(parsed.currencySymbol || '$');
                if (activeTab === 'history') {
                    await loadProductionHistory(parsed.companyId);
                } else {
                    await loadStock(parsed.companyId);
                }
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
            const res = await fetchStock(cId, activeTab === 'history' ? undefined : activeTab);
            if (res && res.success) {
                setStockItems(res.items || []);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setRefreshing(false);
        }
    };

    const loadProductionHistory = async (cId = companyId) => {
        if (!cId) return;
        setRefreshing(true);
        try {
            const res = await fetchProductionHistory(cId);
            if (res && res.success) {
                setProductionLogs(res.logs || []);
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

    const handleProductionSave = async () => {
        if (!productionForm.finishedGoodId) return Alert.alert('Error', 'Finished good is required');
        if (!productionForm.quantityProduced || Number(productionForm.quantityProduced) <= 0) {
            return Alert.alert('Error', 'Production quantity must be greater than zero');
        }

        setLoading(true);
        try {
            const res = await recordProduction({
                ...productionForm,
                companyId
            });

            if (res && res.success) {
                setProductionModalVisible(false);
                resetProductionForm();
                loadStock(); // Reload stock levels
                Alert.alert('Success', 'Production recorded successfully');
            } else {
                Alert.alert('Error', res?.message || 'Failed to record production');
            }
        } catch (e) {
            Alert.alert('Error', 'Network request failed');
        } finally {
            setLoading(false);
        }
    };

    const resetProductionForm = () => {
        setProductionForm({
            finishedGoodId: '',
            quantityProduced: '',
            materialsUsed: [],
            notes: ''
        });
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

    const renderProductionItem = ({ item }) => (
        <View style={styles.logCard}>
            <View style={styles.logHeader}>
                <Text style={styles.logTitle}>{item.finishedGoodId?.name || 'Unknown Product'}</Text>
                <Text style={styles.logDate}>{new Date(item.productionDate).toLocaleDateString()}</Text>
            </View>
            <Text style={styles.logDetail}>
                Produced: {item.quantityProduced} {item.finishedGoodId?.unit || ''}
            </Text>
            {item.materialsUsed && item.materialsUsed.length > 0 && (
                <View style={styles.materialsSection}>
                    <Text style={styles.materialsLabel}>Materials Used:</Text>
                    {item.materialsUsed.map((m, idx) => (
                        <Text key={idx} style={styles.materialText}>
                            • {m.materialId?.name || 'Unknown Material'}: {m.quantity} {m.materialId?.unit || ''}
                        </Text>
                    ))}
                </View>
            )}
            {item.notes ? <Text style={styles.logNotes}>Note: {item.notes}</Text> : null}
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
                <TouchableOpacity
                    style={[styles.tab, activeTab === 'history' && styles.activeTab]}
                    onPress={() => setActiveTab('history')}
                >
                    <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
                        History
                    </Text>
                </TouchableOpacity>
            </View>

            {activeTab === 'finished_good' && (
                <TouchableOpacity
                    style={styles.productionBtn}
                    onPress={() => setProductionModalVisible(true)}
                >
                    <Ionicons name="hammer-outline" size={20} color="#fff" />
                    <Text style={styles.productionBtnText}>Record Production</Text>
                </TouchableOpacity>
            )}

            {loading && (activeTab === 'history' ? productionLogs.length === 0 : stockItems.length === 0) ? (
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
            ) : (
                <FlatList
                    data={activeTab === 'history' ? productionLogs : stockItems}
                    renderItem={activeTab === 'history' ? renderProductionItem : renderItem}
                    keyExtractor={item => item._id}
                    contentContainerStyle={styles.listContent}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => activeTab === 'history' ? loadProductionHistory() : loadStock()} />}
                    ListHeaderComponent={() => {
                        if (activeTab === 'history') return null;
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
                            <Ionicons name={activeTab === 'history' ? "list-outline" : "cube-outline"} size={48} color={Colors.textSecondary} />
                            <Text style={styles.emptyText}>
                                {activeTab === 'history' ? "No production records yet." : "No items found. Tap (+) to add."}
                            </Text>
                        </View>
                    }
                />
            )}

            <Modal visible={modalVisible} animationType="slide" transparent={true}>
                {/* ... existing stock modal ... */}
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

            <Modal visible={productionModalVisible} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.productionModalContent}>
                        <Text style={styles.modalTitle}>Record Production</Text>
                        <ScrollView>
                            <Text style={styles.label}>Select Product</Text>
                            <View style={styles.pickerWrapper}>
                                {stockItems.filter(i => i.type === 'finished_good').map(item => (
                                    <TouchableOpacity
                                        key={item._id}
                                        style={[styles.pickerItem, productionForm.finishedGoodId === item._id && styles.pickerItemActive]}
                                        onPress={() => setProductionForm({ ...productionForm, finishedGoodId: item._id })}
                                    >
                                        <Text style={[styles.pickerItemText, productionForm.finishedGoodId === item._id && styles.pickerItemTextActive]}>
                                            {item.name} ({item.unit})
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={styles.label}>Quantity Produced</Text>
                            <TextInput
                                style={styles.input}
                                value={productionForm.quantityProduced}
                                onChangeText={t => setProductionForm({ ...productionForm, quantityProduced: t })}
                                keyboardType="numeric"
                                placeholder="0"
                            />

                            <Text style={styles.label}>Materials Used (Optional)</Text>
                            <View style={styles.materialsUsageSection}>
                                {productionForm.materialsUsed.map((m, idx) => {
                                    const material = stockItems.find(i => i._id === m.materialId);
                                    return (
                                        <View key={idx} style={styles.materialUsedRow}>
                                            <Text style={styles.materialNameText}>{material?.name || 'Item'}</Text>
                                            <TextInput
                                                style={styles.smallInput}
                                                value={m.quantity}
                                                onChangeText={qty => {
                                                    const newMaterials = [...productionForm.materialsUsed];
                                                    newMaterials[idx].quantity = qty;
                                                    setProductionForm({ ...productionForm, materialsUsed: newMaterials });
                                                }}
                                                keyboardType="numeric"
                                                placeholder="Qty"
                                            />
                                            <TouchableOpacity
                                                onPress={() => {
                                                    const newMaterials = productionForm.materialsUsed.filter((_, i) => i !== idx);
                                                    setProductionForm({ ...productionForm, materialsUsed: newMaterials });
                                                }}
                                            >
                                                <Ionicons name="close-circle" size={20} color={Colors.error} />
                                            </TouchableOpacity>
                                        </View>
                                    );
                                })}

                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.materialPickerScroll}>
                                    {stockItems.filter(i => i.type === 'raw_material' && !productionForm.materialsUsed.find(m => m.materialId === i._id)).map(item => (
                                        <TouchableOpacity
                                            key={item._id}
                                            style={styles.addMaterialChip}
                                            onPress={() => {
                                                const newMaterials = [...productionForm.materialsUsed, { materialId: item._id, quantity: '' }];
                                                setProductionForm({ ...productionForm, materialsUsed: newMaterials });
                                            }}
                                        >
                                            <Text style={styles.addMaterialChipText}>+ {item.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </ScrollView>
                            </View>

                            <Text style={styles.label}>Notes</Text>
                            <TextInput
                                style={styles.input}
                                value={productionForm.notes}
                                onChangeText={t => setProductionForm({ ...productionForm, notes: t })}
                                placeholder="e.g. Morning batch"
                            />
                        </ScrollView>
                        <View style={styles.modalActions}>
                            <TouchableOpacity onPress={() => setProductionModalVisible(false)} style={styles.cancelBtn}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleProductionSave} style={styles.saveBtn}>
                                <Text style={styles.saveBtnText}>Record</Text>
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
    summarySub: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '500' },
    productionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#10B981', // Emerald
        marginHorizontal: 16,
        marginTop: 8,
        paddingVertical: 12,
        borderRadius: 8,
        elevation: 2,
    },
    productionBtnText: {
        color: '#fff',
        fontWeight: 'bold',
        marginLeft: 8,
    },
    logCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    logTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.text,
    },
    logDate: {
        fontSize: 12,
        color: Colors.textSecondary,
    },
    logDetail: {
        fontSize: 14,
        color: Colors.text,
        fontWeight: '500',
    },
    materialsSection: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: '#f1f1f1',
    },
    materialsLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textSecondary,
        marginBottom: 4,
    },
    materialText: {
        fontSize: 12,
        color: Colors.text,
    },
    logNotes: {
        fontSize: 12,
        fontStyle: 'italic',
        color: Colors.textSecondary,
        marginTop: 8,
    },
    productionModalContent: {
        backgroundColor: '#fff',
        width: '90%',
        maxHeight: '80%',
        borderRadius: 16,
        padding: 20,
        elevation: 5,
    },
    pickerWrapper: {
        marginBottom: 16,
    },
    pickerItem: {
        padding: 12,
        borderRadius: 8,
        backgroundColor: '#f8f8f8',
        marginBottom: 8,
    },
    pickerItemActive: {
        backgroundColor: Colors.primary + '20',
        borderColor: Colors.primary,
        borderWidth: 1,
    },
    pickerItemText: {
        fontSize: 14,
        color: Colors.text,
    },
    pickerItemTextActive: {
        color: Colors.primary,
        fontWeight: 'bold',
    },
    materialsUsageSection: {
        marginBottom: 16,
        padding: 12,
        backgroundColor: '#f8f8f8',
        borderRadius: 8,
    },
    materialUsedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 10,
        backgroundColor: '#fff',
        padding: 8,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#eee',
    },
    materialNameText: {
        flex: 1,
        fontSize: 14,
        color: Colors.text,
    },
    smallInput: {
        width: 60,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 4,
        padding: 4,
        fontSize: 14,
        textAlign: 'center',
    },
    materialPickerScroll: {
        marginTop: 8,
    },
    addMaterialChip: {
        backgroundColor: Colors.primary + '15',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        marginRight: 8,
        borderWidth: 1,
        borderColor: Colors.primary + '30',
    },
    addMaterialChipText: {
        fontSize: 12,
        color: Colors.primary,
        fontWeight: '600',
    },
});

export default StockManagementScreen;
