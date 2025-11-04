import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, SafeAreaView, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { createInvoice } from '../utils/api';
import { Linking } from 'react-native';

const emptyItem = { description: '', qty: '1', price: '0' };

const CreateInvoiceScreen = ({ navigation }) => {
  const [invoice, setInvoice] = useState({
    customerName: '',
    customerAddress: '',
    contact: '',
    invoiceDate: new Date(),
    dueDate: new Date(),
  });
  const [items, setItems] = useState([ { ...emptyItem } ]);
  const [loading, setLoading] = useState(false);
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  const updateInvoice = (field, value) => setInvoice(prev => ({ ...prev, [field]: value }));
  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((it, i) => i === index ? { ...it, [field]: value } : it));
  };
  const addItem = () => setItems(prev => [ ...prev, { ...emptyItem } ]);
  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const stored = await AsyncStorage.getItem('companyData');
      const companyData = stored ? JSON.parse(stored) : null;
      if (!companyData?.companyId) {
        Alert.alert('Not logged in', 'Please login to your company account');
        return;
      }
      const payload = {
        companyId: companyData.companyId,
        invoiceDate: invoice.invoiceDate?.toISOString().slice(0, 10),
        dueDate: invoice.dueDate?.toISOString().slice(0, 10),
        customer: {
          name: invoice.customerName,
          address: invoice.customerAddress,
          contact: invoice.contact,
        },
        items: items.map(it => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
      };
      const res = await createInvoice(payload);
      if (res?.success && res?.pdfUrl) {
        Alert.alert('Invoice Generated', 'Opening Invoice PDF...');
        Linking.openURL(res.pdfUrl);
      } else {
        Alert.alert('Failed', res?.message || 'Could not generate invoice');
      }
    } catch (err) {
      Alert.alert('Error', 'Invoice generation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Create Invoice</Text>
        <Text style={styles.subtitle}>Generate a downloadable A4 invoice</Text>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.sectionTitle}>Customer</Text>
        <TextInput style={styles.input} placeholder="Name" placeholderTextColor={Colors.textSecondary} value={invoice.customerName} onChangeText={(t) => updateInvoice('customerName', t)} />
        <TextInput style={[styles.input, styles.textArea]} placeholder="Address" placeholderTextColor={Colors.textSecondary} value={invoice.customerAddress} onChangeText={(t) => updateInvoice('customerAddress', t)} multiline />
        <TextInput style={styles.input} placeholder="Email or Phone (optional)" placeholderTextColor={Colors.textSecondary} value={invoice.contact} onChangeText={(t) => updateInvoice('contact', t)} />

        <Text style={styles.sectionTitle}>Invoice Details</Text>
        <View style={styles.dateRow}>
          <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowInvoiceDatePicker(true)}>
            <Text style={styles.dateText}>Issuance Date: {invoice.invoiceDate?.toISOString().slice(0,10)}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.input, styles.dateInput]} onPress={() => setShowDueDatePicker(true)}>
            <Text style={styles.dateText}>Due Date: {invoice.dueDate?.toISOString().slice(0,10)}</Text>
          </TouchableOpacity>
        </View>
        {showInvoiceDatePicker && (
          <DateTimePicker value={invoice.invoiceDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowInvoiceDatePicker(false); if (d) updateInvoice('invoiceDate', d); }} />
        )}
        {showDueDatePicker && (
          <DateTimePicker value={invoice.dueDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowDueDatePicker(false); if (d) updateInvoice('dueDate', d); }} />
        )}

        <Text style={styles.sectionTitle}>Items</Text>
        {items.map((it, idx) => (
          <View key={idx} style={styles.itemRow}>
            <TextInput style={[styles.input, styles.itemDesc]} placeholder="Description" placeholderTextColor={Colors.textSecondary} value={it.description} onChangeText={(t) => updateItem(idx, 'description', t)} />
            <TextInput style={[styles.input, styles.itemQty]} placeholder="Qty" placeholderTextColor={Colors.textSecondary} keyboardType="number-pad" value={it.qty} onChangeText={(t) => updateItem(idx, 'qty', t)} />
            <TextInput style={[styles.input, styles.itemPrice]} placeholder="Price" placeholderTextColor={Colors.textSecondary} keyboardType="decimal-pad" value={it.price} onChangeText={(t) => updateItem(idx, 'price', t)} />
            <TouchableOpacity style={styles.removeButton} onPress={() => removeItem(idx)}>
              <Text style={styles.removeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addButton} onPress={addItem}><Text style={styles.addButtonText}>+ Add Item</Text></TouchableOpacity>
        <TouchableOpacity style={[styles.generateButton, loading && styles.generateButtonDisabled]} disabled={loading} onPress={handleGenerate}>
          <Text style={styles.generateButtonText}>{loading ? 'Generating...' : 'Generate Invoice'}</Text>
        </TouchableOpacity>
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primary, paddingTop: Spacing.md, paddingBottom: Spacing.xl, paddingHorizontal: Spacing.lg },
  backButton: { alignSelf: 'flex-start', marginBottom: Spacing.md },
  backButtonText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.medium },
  title: { fontSize: Fonts.sizes.title, fontWeight: Fonts.weights.bold, color: Colors.white, marginBottom: Spacing.sm },
  subtitle: { fontSize: Fonts.sizes.md, color: Colors.white, opacity: 0.9 },
  content: { padding: Spacing.lg, paddingBottom: Spacing.xl },
  sectionTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.semiBold, color: Colors.text, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  input: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, fontSize: Fonts.sizes.md, color: Colors.text, marginBottom: Spacing.sm },
  textArea: { height: 80, textAlignVertical: 'top' },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateInput: { flex: 1 },
  dateText: { color: Colors.text, fontSize: Fonts.sizes.md },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemDesc: { flex: 2 },
  itemQty: { flex: 0.7 },
  itemPrice: { flex: 1 },
  removeButton: { marginLeft: 8, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.error, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  removeButtonText: { color: Colors.error, fontWeight: Fonts.weights.bold },
  addButton: { backgroundColor: Colors.white, borderColor: Colors.secondary, borderWidth: 1, borderRadius: 8, padding: Spacing.md, alignSelf: 'flex-start', marginVertical: Spacing.sm },
  addButtonText: { color: Colors.secondary, fontWeight: Fonts.weights.semiBold },
  generateButton: { backgroundColor: Colors.primary, paddingVertical: Spacing.lg, borderRadius: 8, alignItems: 'center', marginTop: Spacing.lg },
  generateButtonDisabled: { opacity: 0.6 },
  generateButtonText: { color: Colors.white, fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold },
});

export default CreateInvoiceScreen;