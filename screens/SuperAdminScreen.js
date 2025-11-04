import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Alert, FlatList, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { adminFetchCompanies, adminDeleteCompany, adminFetchStats } from '../utils/api';

const SuperAdminScreen = ({ navigation }) => {
  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cRes, sRes] = await Promise.all([adminFetchCompanies(), adminFetchStats()]);
      setCompanies(cRes?.companies || []);
      setStats(sRes?.stats || null);
    } catch (err) {
      Alert.alert('Error', 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (companyId) => {
    Alert.alert('Confirm Delete', `Delete company ${companyId}? This will remove all invoices.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await adminDeleteCompany(companyId);
            if (res?.success) {
              setCompanies((prev) => prev.filter((c) => c.companyId !== companyId));
              Alert.alert('Deleted', `Company ${companyId} deleted`);
              const sRes = await adminFetchStats();
              setStats(sRes?.stats || null);
            } else {
              Alert.alert('Error', res?.message || 'Delete failed');
            }
          } catch (err) {
            Alert.alert('Error', 'Delete request failed');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }) => (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.companyName}>{item.name}</Text>
        <Text style={styles.companyMeta}>{item.companyId}</Text>
        <Text style={styles.companyMeta}>{item.email || 'no-email'} · {item.phone || 'no-phone'}</Text>
      </View>
      <TouchableOpacity style={styles.deleteButton} onPress={() => handleDelete(item.companyId)}>
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Super Admin</Text>
        <Text style={styles.subtitle}>Developer panel for maintenance tasks</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.refreshButton} onPress={loadData} disabled={loading}>
          <Text style={styles.refreshText}>{loading ? 'Loading...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>

      {stats && (
        <View style={styles.stats}>
          <Text style={styles.statText}>Companies: {stats.totalCompanies}</Text>
          <Text style={styles.statText}>Invoices: {stats.totalInvoices}</Text>
          <Text style={styles.statText}>New (30d): {stats.recentCompanies}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.loading}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <FlatList
          data={companies}
          keyExtractor={(item) => item.companyId}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
        />
      )}
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
  actions: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  refreshButton: { backgroundColor: Colors.primary, borderRadius: 8, paddingVertical: Spacing.md, alignItems: 'center' },
  refreshText: { color: Colors.white, fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold },
  stats: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  statText: { color: Colors.text, fontSize: Fonts.sizes.md, marginBottom: Spacing.xs },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 8, padding: Spacing.md, marginBottom: Spacing.md },
  companyName: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.text },
  companyMeta: { color: Colors.textSecondary, fontSize: Fonts.sizes.sm },
  deleteButton: { backgroundColor: '#b00020', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: 6 },
  deleteText: { color: Colors.white, fontWeight: Fonts.weights.bold },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

export default SuperAdminScreen;