import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, Modal, TextInput, Image } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
import { updateCompany } from '../utils/api';

const TEMPLATES = [
  { key: 'classic', title: 'Classic', emoji: '📄' },
  { key: 'modern', title: 'Modern', emoji: '✨' },
  { key: 'minimal', title: 'Minimal', emoji: '🧼' },
  { key: 'bold', title: 'Bold', emoji: '🔥' },
  { key: 'compact', title: 'Compact', emoji: '📦' },
];

const shadeColor = (hex, percent) => {
  try {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    r = Math.min(255, Math.max(0, Math.round(r + (percent / 100) * 255)));
    g = Math.min(255, Math.max(0, Math.round(g + (percent / 100) * 255)));
    b = Math.min(255, Math.max(0, Math.round(b + (percent / 100) * 255)));
    return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  } catch (_) {
    return hex;
  }
};

const getThemeFor = (tpl, brandColor) => {
  switch (tpl) {
    case 'modern':
      return { primary: brandColor || Colors.primary, accent: brandColor ? shadeColor(brandColor, -20) : Colors.accent, border: Colors.border, text: Colors.text };
    case 'minimal':
      return { primary: brandColor || Colors.secondary, accent: brandColor ? shadeColor(brandColor, 70) : Colors.gray[300], border: Colors.gray[300], text: Colors.text };
    case 'bold':
      return { primary: brandColor || Colors.error, accent: brandColor ? shadeColor(brandColor, -30) : Colors.warning, border: Colors.border, text: Colors.text };
    case 'compact':
      return { primary: brandColor || Colors.success, accent: brandColor ? shadeColor(brandColor, 60) : Colors.gray[200], border: Colors.border, text: Colors.text };
    case 'classic':
    default:
      return { primary: brandColor || Colors.secondary, accent: brandColor ? shadeColor(brandColor, -10) : Colors.accent, border: Colors.border, text: Colors.text };
  }
};

const TemplatePreview = ({ companyName, template, brandColor }) => {
  const theme = useMemo(() => getThemeFor(template, brandColor), [template, brandColor]);
  return (
    <View style={[styles.previewCard, { borderColor: theme.border }]}> 
      <View style={[styles.previewHeader, { backgroundColor: theme.primary }]}> 
        <Text style={styles.previewTitle} numberOfLines={1}>{companyName || 'Your Company'}</Text>
        <Text style={styles.previewType}>INVOICE</Text>
      </View>
      <View style={[styles.previewAccentBar, { backgroundColor: theme.accent }]} />
      <View style={styles.previewTableHeader}>
        <Text style={[styles.previewTh, { color: theme.text }]}>Item</Text>
        <Text style={[styles.previewTh, { color: theme.text }]}>Qty</Text>
        <Text style={[styles.previewTh, { color: theme.text }]}>Amount</Text>
      </View>
      <View style={styles.previewHintRow}>
        <Text style={styles.previewHint}>Preview is indicative; final PDF reflects full data.</Text>
      </View>
    </View>
  );
};

function renderFullInvoicePreview(company, template, brandColor) {
  const theme = getThemeFor(template, brandColor);
  const name = company?.companyName || 'Your Company';
  const address = company?.address || 'Company Address';
  const email = company?.email || 'info@example.com';
  const phone = company?.phoneNumber || '+000 000 0000';
  const bankName = company?.bankName || '';
  const accountName = company?.bankAccountName || '';
  const accountNumber = company?.bankAccountNumber || '';
  const issuanceDate = new Date();
  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // Common sample rows
  const sampleRows = [
    { desc: 'Consulting Services', qty: 8, price: 120, total: 960 },
    { desc: 'Design & Branding', qty: 1, price: 450, total: 450 },
    { desc: 'Hosting (12 months)', qty: 1, price: 199, total: 199 },
  ];

  const subtotal = sampleRows.reduce((s, r) => s + r.total, 0);
  const tax = Math.round(subtotal * 0.075 * 100) / 100;
  const grand = Math.round((subtotal + tax) * 100) / 100;

  const amountInWords = (() => {
    const ones = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine'];
    const teens = ['Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const chunk = (n) => {
      let s = '';
      if (n >= 100) { s += `${ones[Math.floor(n/100)]} Hundred`; n %= 100; if (n) s += ' '; }
      if (n >= 20) { s += tens[Math.floor(n/10)]; n %= 10; if (n) s += `-${ones[n]}`; }
      else if (n >= 10) { s += teens[n-10]; }
      else if (n > 0) { s += ones[n]; }
      else if (!s) { s = 'Zero'; }
      return s;
    };
    const whole = Math.floor(grand);
    const decimals = Math.round((grand - whole) * 100);
    const groups = [
      { v: 1_000_000_000, l: 'Billion' },
      { v: 1_000_000, l: 'Million' },
      { v: 1_000, l: 'Thousand' },
    ];
    let rem = whole; const parts = [];
    for (const g of groups) { if (rem >= g.v) { const c = Math.floor(rem / g.v); parts.push(`${chunk(c)} ${g.l}`); rem %= g.v; } }
    if (rem > 0 || parts.length === 0) parts.push(chunk(rem));
    return `${parts.join(' ')}${decimals ? ` and ${decimals}/100` : ''}`;
  })();

  switch (template) {
    case 'modern':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={[styles.fullHeader, { backgroundColor: theme.primary }]}> 
            <Text style={[styles.fullTitle, { color: Colors.white }]}>INVOICE</Text>
            <View>
              <Text style={[styles.fullCompany, { color: Colors.white }]} numberOfLines={1}>{name}</Text>
              <Text style={[styles.fullMeta, { color: Colors.white }]}>INV-001 • {new Date().toLocaleDateString()}</Text>
            </View>
          </View>
          <View style={[styles.fullAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={styles.fullSection}>BILL TO</Text>
              <Text style={styles.fullText}>Sample Client LLC</Text>
              <Text style={styles.fullText}>123 Client Street</Text>
              <Text style={styles.fullText}>Client City, State</Text>
              <Text style={styles.fullText}>client@email.com</Text>
            </View>
            <View style={[styles.fullInfoBox, { borderColor: theme.border }]}> 
              {!!company?.logo && (
                <Image source={{ uri: company.logo }} style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 6 }} />
              )}
              <Text style={styles.fullText}>{address}</Text>
              <Text style={styles.fullText}>Email: {email}</Text>
              <Text style={styles.fullText}>Phone: {phone}</Text>
              {(bankName || accountName || accountNumber) && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.fullSection}>Bank Details</Text>
                  {!!bankName && (<Text style={styles.fullText}>Bank: {bankName}</Text>)}
                  {!!accountName && (<Text style={styles.fullText}>Account Name: {accountName}</Text>)}
                  {!!accountNumber && (<Text style={styles.fullText}>Account Number: {accountNumber}</Text>)}
                </View>
              )}
            </View>
          </View>
          <View style={[styles.fullRow, { paddingTop: 6 }]}> 
            <Text style={styles.fullMeta}>Issuance Date: {issuanceDate.toISOString().slice(0,10)}</Text>
            <Text style={styles.fullMeta}>Due Date: {dueDate.toISOString().slice(0,10)}</Text>
          </View>
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {sampleRows.map((r, i) => (
            <View key={i} style={[styles.fullRowCard, { borderColor: theme.border }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.fullTotalsRight}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>${subtotal.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax (7.5%)</Text><Text style={styles.fullMeta}>${tax.toFixed(2)}</Text></View>
            <View style={[styles.fullTotalRow, styles.fullGrand]}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>${grand.toFixed(2)}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>Layout: modern, card rows, right-aligned totals</Text>
        </View>
      );
    case 'minimal':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={styles.fullCompany}>{name}</Text>
              <Text style={styles.fullText}>{address}</Text>
              <Text style={styles.fullText}>Email: {email} • {phone}</Text>
              {(bankName || accountName || accountNumber) && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.fullSection}>Bank Details</Text>
                  {!!bankName && (<Text style={styles.fullText}>Bank: {bankName}</Text>)}
                  {!!accountName && (<Text style={styles.fullText}>Account Name: {accountName}</Text>)}
                  {!!accountNumber && (<Text style={styles.fullText}>Account Number: {accountNumber}</Text>)}
                </View>
              )}
            </View>
            <Text style={styles.fullTitle}>INVOICE</Text>
          </View>
          <View style={styles.fullSeparator} />
          <View style={styles.fullRow}> 
             <View style={{ flex: 1 }}>
               <Text style={styles.fullSection}>BILL TO</Text>
               <Text style={styles.fullText}>Sample Client LLC</Text>
               <Text style={styles.fullText}>client@email.com</Text>
               <Text style={styles.fullText}>+1 (555) 555-5555</Text>
             </View>
             <View style={{ alignItems: 'flex-end' }}>
               <Text style={styles.fullMeta}>INV-001</Text>
               <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
               <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
             </View>
           </View>
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {sampleRows.map((r, i) => (
            <View key={i} style={styles.fullTableRow}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.fullSeparator} />
          <View style={styles.fullTotalsLeft}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>${subtotal.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax (7.5%)</Text><Text style={styles.fullMeta}>${tax.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>${grand.toFixed(2)}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>Layout: minimal, separators, left totals</Text>
        </View>
      );
    case 'bold':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <Text style={[styles.fullTitle, { color: theme.primary }]}>INVOICE</Text>
          <View style={[styles.fullAccent, { backgroundColor: theme.accent, height: 8 }]} />
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={styles.fullCompany}>{name}</Text>
              <Text style={styles.fullText}>{address}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fullMeta}>INV-001</Text>
              <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
              <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
            </View>
          </View>
          <View style={[styles.fullTableHeader, { backgroundColor: Colors.gray[100] }]}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {sampleRows.map((r, i) => (
            <View key={i} style={[styles.fullTableRow, { borderBottomWidth: 2 }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={[styles.fullTotalsRight, { backgroundColor: Colors.gray[100], padding: Spacing.md, borderRadius: 8 }]}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>${subtotal.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax (7.5%)</Text><Text style={styles.fullMeta}>${tax.toFixed(2)}</Text></View>
            <View style={[styles.fullTotalRow, styles.fullGrand]}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>${grand.toFixed(2)}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>Layout: bold, thick separators, boxed totals</Text>
        </View>
      );
    case 'compact':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <Text style={styles.fullTitleSm}>INVOICE</Text>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <Text style={styles.fullMeta}>INV-001</Text>
              <Text style={styles.fullMeta}>{new Date().toLocaleDateString()}</Text>
            </View>
          </View>
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={styles.fullCompany}>{name}</Text>
              <Text style={styles.fullText}>Email: {email}</Text>
              {(bankName || accountName || accountNumber) && (
                <View style={{ marginTop: 6 }}>
                  <Text style={styles.fullSection}>Bank Details</Text>
                  {!!bankName && (<Text style={styles.fullText}>Bank: {bankName}</Text>)}
                  {!!accountName && (<Text style={styles.fullText}>Account Name: {accountName}</Text>)}
                  {!!accountNumber && (<Text style={styles.fullText}>Account Number: {accountNumber}</Text>)}
                </View>
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullSection}>BILL TO</Text>
              <Text style={styles.fullText}>Sample Client LLC</Text>
              <Text style={styles.fullText}>client@email.com</Text>
              <Text style={styles.fullText}>+1 (555) 555-5555</Text>
            </View>
          </View>
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Item</Text>
            <Text style={[styles.fullTh, { flex: 0.6, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {sampleRows.map((r, i) => (
            <View key={i} style={[styles.fullTableRow, { paddingVertical: 6 }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.6, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.fullTotalsRight}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>${subtotal.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax</Text><Text style={styles.fullMeta}>${tax.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>${grand.toFixed(2)}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>Layout: compact, tight spacing, two-column header</Text>
        </View>
      );
    case 'classic':
    default:
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <Text style={[styles.fullCompany]}>{name}</Text>
            <Text style={styles.fullTitle}>INVOICE</Text>
          </View>
          <View style={styles.fullSeparator} />
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={styles.fullSection}>BILL TO</Text>
              <Text style={styles.fullText}>Sample Client LLC</Text>
              <Text style={styles.fullText}>123 Client Street</Text>
              <Text style={styles.fullText}>client@email.com</Text>
              <Text style={styles.fullText}>+1 (555) 555-5555</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fullMeta}>INV-001</Text>
              <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
              <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
            </View>
          </View>
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {sampleRows.map((r, i) => (
            <View key={i} style={styles.fullTableRow}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.fullTotalsRight}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>${subtotal.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax (7.5%)</Text><Text style={styles.fullMeta}>${tax.toFixed(2)}</Text></View>
            <View style={styles.fullTotalRow}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>${grand.toFixed(2)}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>Layout: classic, balanced header and table</Text>
        </View>
      );
  }
}

export default function TemplatePickerScreen({ navigation }) {
  const [company, setCompany] = useState(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState('classic');
  const [brandColor, setBrandColor] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem('companyData');
        if (data) {
          const parsed = JSON.parse(data);
          setCompany(parsed);
          setInvoiceTemplate(parsed.invoiceTemplate || 'classic');
          setBrandColor(parsed.brandColor || Colors.primary);
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load company data');
      }
    })();
  }, []);

  const saveSelection = async () => {
    if (!company?.companyId) return Alert.alert('Not Found', 'Company ID missing. Please login again.');
    setSaving(true);
    try {
      // Save receiptTemplate equal to invoiceTemplate as requested
      const res = await updateCompany(company.companyId, { invoiceTemplate, receiptTemplate: invoiceTemplate, brandColor });
      if (res?.success) {
        const updated = { ...company, invoiceTemplate, receiptTemplate: invoiceTemplate, brandColor };
        await AsyncStorage.setItem('companyData', JSON.stringify(updated));
        Alert.alert('Saved', 'Template preferences updated successfully. New invoices will use your selected style.');
        navigation.goBack();
      } else {
        Alert.alert('Error', res?.message || 'Failed to save templates');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to save templates');
    } finally {
      setSaving(false);
    }
  };

  const renderTemplate = (tplKey, title, emoji, selected, onSelect) => (
    <TouchableOpacity
      style={[styles.templateCard, selected && styles.templateSelected]}
      onPress={() => onSelect(tplKey)}
    >
      <Text style={styles.templateEmoji}>{emoji}</Text>
      <Text style={styles.templateTitle}>{title}</Text>
      <Text style={styles.templateSubtitle}>{selected ? 'Selected' : 'Tap to select'}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Pick Your Invoice Template</Text>
          <Text style={styles.subtitle}>Choose how your invoice looks. Tap preview for full layout.</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Template</Text>
          <View style={styles.grid}>
            {TEMPLATES.map((t) => (
              <View key={`inv-${t.key}`} style={styles.gridItem}>
                {renderTemplate(t.key, t.title, t.emoji, invoiceTemplate === t.key, setInvoiceTemplate)}
              </View>
            ))}
          </View>
          <View style={styles.previewContainer}>
            <Text style={styles.previewLabel}>Preview</Text>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setPreviewVisible(true)}>
              <TemplatePreview companyName={company?.companyName} template={invoiceTemplate} brandColor={brandColor} />
              <Text style={styles.tapHint}>Tap to view full layout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Brand Color Picker */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Brand Color</Text>
          <Text style={styles.subtitle}>Pick a color that matches your brand. It applies to header and accents.</Text>
          <View style={styles.swatchGrid}>
            {['#1f6feb','#10b981','#d97706','#ef4444','#7c3aed','#14b8a6','#0ea5e9','#f43f5e','#3b82f6','#22c55e','#eab308','#6b7280'].map((c) => (
              <TouchableOpacity key={c} style={[styles.swatch, { backgroundColor: c }, brandColor === c && styles.swatchSelected]} onPress={() => setBrandColor(c)} />
            ))}
          </View>
          <View style={styles.colorInputRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="#RRGGBB"
              placeholderTextColor={Colors.textSecondary}
              value={brandColor}
              onChangeText={(t) => setBrandColor(t.startsWith('#') ? t : `#${t}`)}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={[styles.colorPreviewBox, { backgroundColor: brandColor || Colors.primary }]} />
          </View>
        </View>

        <TouchableOpacity style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={saveSelection} disabled={saving}>
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Preference'}</Text>
        </TouchableOpacity>

        {/* Full-screen preview modal */}
        <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
          <SafeAreaView style={[styles.container, { backgroundColor: Colors.gray[100] }]}> 
            <View style={styles.modalHeader}>
              <TouchableOpacity style={styles.backButton} onPress={() => setPreviewVisible(false)}>
                <Text style={styles.backButtonText}>← Close</Text>
              </TouchableOpacity>
              <Text style={styles.title}>Invoice Preview — {invoiceTemplate.charAt(0).toUpperCase() + invoiceTemplate.slice(1)}</Text>
            </View>
            <ScrollView contentContainerStyle={{ padding: Spacing.lg }}>
              {renderFullInvoicePreview(company, invoiceTemplate, brandColor)}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { padding: Spacing.lg },
  header: { marginBottom: Spacing.md },
  backButton: { paddingVertical: 8, paddingHorizontal: 12 },
  backButtonText: { color: Colors.primary, fontSize: 16, fontFamily: Fonts.medium },
  title: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text, marginTop: Spacing.xs },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  section: { marginTop: Spacing.lg },
  sectionTitle: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text, marginBottom: Spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -Spacing.sm },
  gridItem: { width: '50%', paddingHorizontal: Spacing.sm, marginBottom: Spacing.sm },
  templateCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  templateSelected: {
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
  },
  templateEmoji: { fontSize: 28 },
  templateTitle: { fontSize: 15, fontFamily: Fonts.semiBold, color: Colors.text, marginTop: 8 },
  templateSubtitle: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  tapHint: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center', marginTop: 6 },
  previewContainer: { marginTop: Spacing.md },
  previewLabel: { fontSize: 13, color: Colors.textSecondary, marginBottom: Spacing.xs },
  previewCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    paddingBottom: Spacing.md,
    overflow: 'hidden',
  },
  previewHeader: {
    height: 40,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: { color: Colors.white, fontSize: 14, fontFamily: Fonts.semiBold, maxWidth: '70%' },
  previewType: { color: Colors.white, fontSize: 12, fontFamily: Fonts.medium },
  previewAccentBar: { height: 6, width: '100%' },
  previewTableHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
  },
  previewTh: { fontSize: 12, fontFamily: Fonts.medium },
  previewHintRow: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  previewHint: { fontSize: 11, color: Colors.textSecondary },
  modalHeader: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  // Full preview styles
  fullCard: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  fullHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fullTitle: { fontSize: 20, fontFamily: Fonts.bold, color: Colors.text },
  fullTitleSm: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  fullCompany: { fontSize: 16, fontFamily: Fonts.semiBold, color: Colors.text },
  fullMeta: { fontSize: 12, color: Colors.textSecondary },
  fullAccent: { height: 6, width: '100%' },
  fullRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  fullInfoBox: {
    minWidth: 160,
    borderWidth: 1,
    borderRadius: 8,
    padding: Spacing.sm,
  },
  fullSection: { fontSize: 12, color: Colors.textSecondary, marginBottom: 4 },
  fullText: { fontSize: 12, color: Colors.text },
  fullSeparator: { height: 1, backgroundColor: Colors.border, marginHorizontal: Spacing.lg, marginTop: Spacing.md },
  fullTableHeader: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.border,
    marginTop: Spacing.md,
  },
  fullTh: { fontSize: 12, fontFamily: Fonts.semiBold, color: Colors.text },
  fullTableRow: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderColor: Colors.border,
  },
  fullRowCard: {
    flexDirection: 'row',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  fullTd: { fontSize: 12, color: Colors.text },
  fullTotalsRight: {
    alignSelf: 'flex-end',
    width: 260,
    marginTop: Spacing.md,
    marginRight: Spacing.lg,
  },
  fullTotalsLeft: {
    alignSelf: 'flex-start',
    width: 260,
    marginTop: Spacing.md,
    marginLeft: Spacing.lg,
  },
  fullTotalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  fullGrand: { borderTopWidth: 1, borderColor: Colors.border, paddingTop: 6, marginTop: 6 },
  fullHint: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  // Color picker styles
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.sm },
  swatch: { width: 32, height: 32, borderRadius: 6, marginRight: 8, marginBottom: 8, borderWidth: 2, borderColor: Colors.border },
  swatchSelected: { borderColor: Colors.primary, elevation: 2 },
  colorInputRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  colorPreviewBox: { width: 40, height: 40, borderRadius: 8, marginLeft: Spacing.sm, borderWidth: 1, borderColor: Colors.border },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.xl,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.semiBold },
});