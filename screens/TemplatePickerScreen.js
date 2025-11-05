import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, ScrollView, Alert, Modal, TextInput, Image, Platform, Linking, KeyboardAvoidingView } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as FileSystem from 'expo-file-system';
import * as FileSystemLegacy from 'expo-file-system/legacy';
import { createInvoice } from '../utils/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../constants/Colors';
import { Fonts } from '../constants/Fonts';
import { Spacing } from '../constants/Spacing';
// removed updateCompany; preferences are not saved here anymore

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

function renderFullInvoicePreview(company, template, brandColor, liveInvoice) {
  const theme = getThemeFor(template, brandColor);
  const name = company?.companyName || 'Your Company';
  const address = company?.address || 'Company Address';
  const email = company?.email || 'info@example.com';
  const phone = company?.phoneNumber || '+000 000 0000';
  const bankName = company?.bankName || '';
  const accountName = company?.bankAccountName || '';
  const accountNumber = company?.bankAccountNumber || '';
  const issuanceDate = liveInvoice?.invoiceDate ? new Date(liveInvoice.invoiceDate) : new Date();
  const dueDate = liveInvoice?.dueDate ? new Date(liveInvoice.dueDate) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const curr = (liveInvoice?.currencySymbol || company?.currencySymbol || '$');
  const currencyName = (() => {
    switch ((curr || '').trim()) {
      case '₦': return 'Naira';
      case '£': return 'Pounds';
      case '€': return 'Euros';
      case '₵': return 'Cedis';
      case 'KSh': return 'Shillings';
      case '$':
      default: return 'Dollars';
    }
  })();

  // Rows from live invoice (fallback to samples)
  const rows = (liveInvoice?.items && liveInvoice.items.length > 0)
    ? liveInvoice.items.map((it) => ({
        desc: it.description || it.desc || '-',
        qty: Number(it.qty || 0),
        price: Number(it.price || 0),
        total: Number(it.qty || 0) * Number(it.price || 0),
      }))
    : [
        { desc: 'Consulting Services', qty: 8, price: 120, total: 960 },
        { desc: 'Design & Branding', qty: 1, price: 450, total: 450 },
        { desc: 'Hosting (12 months)', qty: 1, price: 199, total: 199 },
      ];

  const taxRate = typeof liveInvoice?.taxPercent === 'number' ? (liveInvoice.taxPercent / 100) : 0.0;
  const subtotal = rows.reduce((s, r) => s + r.total, 0);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
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
    const centsName = (() => {
      switch ((curr || '').trim()) {
        case '₦': return 'kobo';
        case '£': return 'pence';
        case '€': return 'cents';
        case '₵': return 'pesewas';
        case 'KSh': return 'cents';
        case '$':
        default: return 'cents';
      }
    })();
    return `${parts.join(' ')} ${currencyName}${decimals ? ` and ${decimals}/100 ${centsName}` : ''}`;
  })();

  switch (template) {
    case 'modern':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={[styles.fullHeader, { backgroundColor: theme.primary, justifyContent: 'space-between' }]}> 
            <Text style={[styles.fullCompany, { color: Colors.white }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.fullTitle, { color: Colors.white }]}>INVOICE</Text>
          </View>
          <View style={[styles.fullAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.fullRow}> 
            <View style={[styles.fullInfoBox, { flex: 1, borderColor: theme.border, marginRight: 8 }]}> 
              <Text style={[styles.fullSection, { color: theme.primary }]}>BILL TO</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerName || 'Sample Client LLC'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerAddress || '123 Client Street'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerContact || 'client@email.com / +1 (555) 555-5555'}</Text>
            </View>
            <View style={[styles.fullInfoBox, { flex: 1, borderColor: theme.border, marginLeft: 8 }]}> 
              <Text style={[styles.fullSection, { color: theme.primary }]}>Invoice</Text>
              <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
              <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
            </View>
          </View>
          <View style={[styles.fullInfoBox, { borderColor: theme.border, marginHorizontal: Spacing.lg }]}> 
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
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={[styles.fullRowCard, { borderColor: theme.border }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.price.toFixed(2)}`}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.total.toFixed(2)}`}</Text>
            </View>
          ))}
          <View style={styles.fullTotalsRight}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>{`${curr}${subtotal.toFixed(2)}`}</Text></View>
            {tax > 0 && (
              <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax</Text><Text style={styles.fullMeta}>{`${curr}${tax.toFixed(2)}`}</Text></View>
            )}
            <View style={[styles.fullTotalRow, styles.fullGrand]}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>{`${curr}${grand.toFixed(2)}`}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>{`This invoice is generated electronically by ${name} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}`}</Text>
        </View>
      );
    case 'minimal':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              {!!company?.logo && (
                <Image source={{ uri: company.logo }} style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 6 }} />
              )}
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
            <Text style={[styles.fullTitle, { color: theme.primary }]}>INVOICE</Text>
          </View>
          <View style={styles.fullSeparator} />
          <View style={styles.fullRow}> 
             <View style={{ flex: 1 }}>
               <Text style={[styles.fullSection, { color: theme.primary }]}>BILL TO</Text>
               <Text style={styles.fullText}>{liveInvoice?.customerName || 'Sample Client LLC'}</Text>
               <Text style={styles.fullText}>{liveInvoice?.customerAddress || '123 Client Street'}</Text>
               <Text style={styles.fullText}>{liveInvoice?.customerContact || 'client@email.com / +1 (555) 555-5555'}</Text>
             </View>
             <View style={{ alignItems: 'flex-end', flex: 1 }}>
               <Text style={[styles.fullSection, { color: theme.primary }]}>Invoice</Text>
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
          {rows.map((r, i) => (
            <View key={i} style={styles.fullTableRow}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.price.toFixed(2)}`}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.total.toFixed(2)}`}</Text>
            </View>
          ))}
          <View style={styles.fullSeparator} />
          <View style={styles.fullTotalsLeft}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>{`${curr}${subtotal.toFixed(2)}`}</Text></View>
            {tax > 0 && (
              <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax</Text><Text style={styles.fullMeta}>{`${curr}${tax.toFixed(2)}`}</Text></View>
            )}
            <View style={styles.fullTotalRow}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>{`${curr}${grand.toFixed(2)}`}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>{`This invoice is generated electronically by ${name} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}`}</Text>
        </View>
      );
    case 'bold':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <Text style={[styles.fullTitle, { color: theme.primary }]}>INVOICE</Text>
          <View style={[styles.fullAccent, { backgroundColor: theme.accent, height: 8 }]} />
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              {!!company?.logo && (
                <Image source={{ uri: company.logo }} style={{ width: 64, height: 64, borderRadius: 8, marginBottom: 6 }} />
              )}
              <Text style={styles.fullCompany}>{name}</Text>
              <Text style={styles.fullText}>{address}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
              <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
            </View>
          </View>
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={[styles.fullSection, { color: theme.primary }]}>BILL TO</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerName || 'Sample Client LLC'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerAddress || '123 Client Street'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerContact || 'client@email.com / +1 (555) 555-5555'}</Text>
            </View>
          </View>
          <View style={[styles.fullTableHeader, { backgroundColor: Colors.gray[100] }]}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={[styles.fullTableRow, { borderBottomWidth: 2 }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.price.toFixed(2)}`}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.total.toFixed(2)}`}</Text>
            </View>
          ))}
          <View style={[styles.fullTotalsRight, { backgroundColor: Colors.gray[100], padding: Spacing.md, borderRadius: 8 }]}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>{`${curr}${subtotal.toFixed(2)}`}</Text></View>
            {tax > 0 && (
              <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax</Text><Text style={styles.fullMeta}>{`${curr}${tax.toFixed(2)}`}</Text></View>
            )}
            <View style={[styles.fullTotalRow, styles.fullGrand]}><Text style={styles.fullTitleSm}>Total</Text><Text style={styles.fullTitleSm}>{`${curr}${grand.toFixed(2)}`}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>{`This invoice is generated electronically by ${name} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}`}</Text>
        </View>
      );
    case 'compact':
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <Text style={[styles.fullTitleSm, { color: theme.primary }]}>INVOICE</Text>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
              <Text style={styles.fullMeta}>{new Date().toLocaleDateString()}</Text>
            </View>
          </View>
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              {!!company?.logo && (
                <Image source={{ uri: company.logo }} style={{ width: 56, height: 56, borderRadius: 8, marginBottom: 6 }} />
              )}
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
              <Text style={[styles.fullSection, { color: theme.primary }]}>BILL TO</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerName || 'Sample Client LLC'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerAddress || '123 Client Street'}</Text>
              <Text style={styles.fullText}>{liveInvoice?.customerContact || 'client@email.com / +1 (555) 555-5555'}</Text>
            </View>
          </View>
          <View style={styles.fullTableHeader}> 
            <Text style={[styles.fullTh, { flex: 2, fontWeight: '700' }]}>Item</Text>
            <Text style={[styles.fullTh, { flex: 0.6, textAlign: 'center', fontWeight: '700' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right', fontWeight: '700' }]}>Total</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={[styles.fullTableRow, { paddingVertical: 6 }]}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.6, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.price.toFixed(2)}`}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>{`${curr}${r.total.toFixed(2)}`}</Text>
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
          <Text style={[styles.fullHint, { marginTop: 12 }]}>{`This invoice is generated electronically by ${name} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}`}</Text>
        </View>
      );
    case 'classic':
    default:
      return (
        <View style={[styles.fullCard, { borderColor: theme.border }]}> 
          <View style={styles.fullRow}> 
            <Text style={[styles.fullCompany]}>{name}</Text>
            <Text style={[styles.fullTitle, { color: theme.primary }]}>INVOICE</Text>
          </View>
          <View style={[styles.fullAccent, { backgroundColor: theme.accent }]} />
          <View style={styles.fullSeparator} />
          <View style={styles.fullRow}> 
            <View style={{ flex: 1 }}>
              <Text style={[styles.fullSection, { color: theme.primary }]}>BILL TO</Text>
        <Text style={styles.fullText}>{liveInvoice?.customerName || 'Sample Client LLC'}</Text>
        <Text style={styles.fullText}>{liveInvoice?.customerAddress || '123 Client Street'}</Text>
        <Text style={styles.fullText}>{liveInvoice?.customerContact || 'client@email.com / +1 (555) 555-5555'}</Text>
            <View style={{ marginTop: 8 }}>
              <Text style={[styles.fullSection, { color: theme.primary }]}>Invoice</Text>
              <Text style={styles.fullMeta}>Issuance: {issuanceDate.toISOString().slice(0,10)}</Text>
              <Text style={styles.fullMeta}>Due: {dueDate.toISOString().slice(0,10)}</Text>
            </View>
          </View>
            <View style={{ alignItems: 'flex-end', flex: 1 }}>
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
          </View>
          <View style={[styles.fullTableHeader, { borderColor: theme.border }]}> 
            <Text style={[styles.fullTh, { flex: 2 }]}>Description</Text>
            <Text style={[styles.fullTh, { flex: 0.7, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Price</Text>
            <Text style={[styles.fullTh, { flex: 1, textAlign: 'right' }]}>Total</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={styles.fullTableRow}> 
              <Text style={[styles.fullTd, { flex: 2 }]}>{r.desc}</Text>
              <Text style={[styles.fullTd, { flex: 0.7, textAlign: 'center' }]}>{r.qty}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.price.toFixed(2)}</Text>
              <Text style={[styles.fullTd, { flex: 1, textAlign: 'right' }]}>${r.total.toFixed(2)}</Text>
            </View>
          ))}
          <View style={styles.fullTotalsRight}> 
            <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Subtotal</Text><Text style={styles.fullMeta}>{`${curr}${subtotal.toFixed(2)}`}</Text></View>
            {tax > 0 && (
              <View style={styles.fullTotalRow}><Text style={styles.fullMeta}>Tax</Text><Text style={styles.fullMeta}>{`${curr}${tax.toFixed(2)}`}</Text></View>
            )}
            <View style={styles.fullTotalRow}><Text style={[styles.fullTitleSm, { color: theme.primary }]}>Total</Text><Text style={[styles.fullTitleSm, { color: theme.primary }]}>{`${curr}${grand.toFixed(2)}`}</Text></View>
            <Text style={[styles.fullMeta, { marginTop: 6 }]}>Amount in words: {amountInWords}</Text>
          </View>
          {!!company?.signature && (
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.md }}>
              <Text style={styles.fullMeta}>Authorized Signature</Text>
              <Image source={{ uri: company.signature }} style={{ width: 140, height: 70, resizeMode: 'contain' }} />
            </View>
          )}
          <Text style={[styles.fullHint, { marginTop: 12 }]}>{`This invoice is generated electronically by ${name} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}`}</Text>
        </View>
      );
  }
}

export default function TemplatePickerScreen({ navigation }) {
  const [company, setCompany] = useState(null);
  const [invoiceTemplate, setInvoiceTemplate] = useState('classic');
  const [brandColor, setBrandColor] = useState('');
  const [currencySymbol, setCurrencySymbol] = useState('₦');
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showInvoiceDatePicker, setShowInvoiceDatePicker] = useState(false);
  const [showDueDatePicker, setShowDueDatePicker] = useState(false);

  // Live invoice editor state (auto-generate invoice number on server, minimal fields here)
  const [invoice, setInvoice] = useState({
    customerName: '',
    customerAddress: '',
    customerContact: '', // email or phone
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  const [items, setItems] = useState([
    { description: 'Service 1', qty: '1', price: '100' },
  ]);
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);

  const updateInvoice = (patch) => setInvoice((prev) => ({ ...prev, ...patch }));
  const updateItem = (index, patch) => setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  const addItem = () => setItems((prev) => [...prev, { description: '', qty: '1', price: '0' }]);
  const removeItem = (index) => setItems((prev) => prev.filter((_, i) => i !== index));

  useEffect(() => {
    (async () => {
      try {
        const data = await AsyncStorage.getItem('companyData');
        if (data) {
          const parsed = JSON.parse(data);
          setCompany(parsed);
          setInvoiceTemplate(parsed.invoiceTemplate || 'classic');
          setBrandColor(parsed.brandColor || Colors.primary);
          setCurrencySymbol(parsed.currencySymbol || '₦');
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load company data');
      }
    })();
  }, []);

  // No preference saving on this screen anymore per new flow

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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 80}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Pick Your Invoice Template</Text>
          <Text style={styles.subtitle}>Choose how your invoice looks. Tap preview for full layout.</Text>
          <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: Colors.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
            <Text style={{ color: Colors.white, fontWeight: '700' }}>Currency: {currencySymbol} {currencySymbol === '₦' ? 'Naira' : currencySymbol === '$' ? 'Dollar' : currencySymbol}</Text>
          </View>
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

        {/* Live Invoice Editor */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <Text style={styles.subtitle}>Only customer and items are required. Template applies automatically.</Text>
          <View style={{ gap: 10 }}>
            <TextInput style={styles.input} placeholder="Customer Name" placeholderTextColor={Colors.textSecondary} value={invoice.customerName} onChangeText={(t) => updateInvoice({ customerName: t })} />
            <TextInput style={styles.input} placeholder="Customer Address" placeholderTextColor={Colors.textSecondary} value={invoice.customerAddress} onChangeText={(t) => updateInvoice({ customerAddress: t })} />
            <TextInput style={styles.input} placeholder="Email or Phone (optional)" placeholderTextColor={Colors.textSecondary} value={invoice.customerContact} onChangeText={(t) => updateInvoice({ customerContact: t })} autoCapitalize="none" />
          </View>
          <View style={{ marginTop: 10 }}>
            <Text style={styles.fullMeta}>Currency</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
              {[
                { sym: '₦', name: 'Naira' },
                { sym: '$', name: 'Dollar' },
                { sym: '£', name: 'Pounds' },
                { sym: '€', name: 'Euros' },
                { sym: '₵', name: 'Cedis' },
                { sym: 'KSh', name: 'Shillings' },
              ].map(({ sym, name }) => (
                <TouchableOpacity
                  key={sym}
                  onPress={() => setCurrencySymbol(sym)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingHorizontal: 16,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: sym === currencySymbol ? Colors.primary : Colors.gray[300],
                    backgroundColor: sym === currencySymbol ? Colors.primary : Colors.gray[100],
                  }}
                >
                  <Text style={{ color: sym === currencySymbol ? Colors.white : Colors.text, fontWeight: '700', fontSize: 16 }}>{sym}</Text>
                  <Text style={{ color: sym === currencySymbol ? Colors.white : Colors.textSecondary, fontWeight: '600' }}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={() => setShowInvoiceDatePicker(true)}>
              <Text style={styles.dateText}>Issuance Date: {invoice.invoiceDate?.toISOString().slice(0,10)}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.input, { flex: 1, justifyContent: 'center' }]} onPress={() => setShowDueDatePicker(true)}>
              <Text style={styles.dateText}>Due Date: {invoice.dueDate?.toISOString().slice(0,10)}</Text>
            </TouchableOpacity>
          </View>
          {showInvoiceDatePicker && (
            <DateTimePicker value={invoice.invoiceDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowInvoiceDatePicker(false); if (d) updateInvoice({ invoiceDate: d }); }} />
          )}
          {showDueDatePicker && (
            <DateTimePicker value={invoice.dueDate || new Date()} mode="date" display="default" onChange={(e, d) => { setShowDueDatePicker(false); if (d) updateInvoice({ dueDate: d }); }} />
          )}

          <Text style={[styles.sectionTitle, { marginTop: Spacing.md }]}>Items</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6, paddingHorizontal: 2 }}>
            <Text style={[styles.fullMeta, { flex: 2 }]}>Item Description</Text>
            <Text style={[styles.fullMeta, { flex: 0.6, textAlign: 'center' }]}>Qty</Text>
            <Text style={[styles.fullMeta, { flex: 1, textAlign: 'right' }]}>Price ({currencySymbol})</Text>
            <Text style={[styles.fullMeta, { flex: 1, textAlign: 'right' }]}>Total ({currencySymbol})</Text>
          </View>
          {items.map((it, i) => {
            const qty = Number(it.qty || 0);
            const price = Number(it.price || 0);
            const total = Math.round(qty * price * 100) / 100;
            return (
              <View key={i} style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                <TextInput style={[styles.input, { flex: 2 }]} placeholder="Description" placeholderTextColor={Colors.textSecondary} value={it.description} onChangeText={(t) => updateItem(i, { description: t })} />
                <TextInput style={[styles.input, { flex: 0.6, textAlign: 'center' }]} placeholder="Qty" placeholderTextColor={Colors.textSecondary} value={it.qty} onChangeText={(t) => updateItem(i, { qty: t })} keyboardType="numeric" />
                <TextInput style={[styles.input, { flex: 1, textAlign: 'right' }]} placeholder="Price" placeholderTextColor={Colors.textSecondary} value={it.price} onChangeText={(t) => updateItem(i, { price: t })} keyboardType="decimal-pad" />
                <Text style={[styles.fullText, { flex: 1, textAlign: 'right' }]}>{`${currencySymbol}${total.toFixed(2)}`}</Text>
                <TouchableOpacity onPress={() => removeItem(i)} style={[styles.iconButton, { backgroundColor: Colors.error }]}>
                  <Text style={styles.iconButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={addItem} style={[styles.secondaryButton, { flex: 1 }]}>
              <Text style={styles.secondaryButtonText}>+ Add Item</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setPreviewVisible(true)} style={[styles.primaryHollowButton, { flex: 1 }]}>
              <Text style={styles.primaryHollowButtonText}>Preview</Text>
            </TouchableOpacity>
          </View>
        </View>


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
              {renderFullInvoicePreview(company, invoiceTemplate, brandColor, {
                customerName: invoice.customerName,
                customerAddress: invoice.customerAddress,
                customerContact: invoice.customerContact,
                invoiceDate: invoice.invoiceDate?.toISOString().slice(0,10),
                dueDate: invoice.dueDate?.toISOString().slice(0,10),
                items,
                currencySymbol,
              })}
              <View style={{ height: 12 }} />
              <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: Spacing.lg }}>
                <TouchableOpacity onPress={async () => {
                  if (!company?.companyId) return Alert.alert('Error', 'Missing company ID. Please login again.');
                  try {
                    setDownloading(true);
                    console.log('[TemplatePicker] Download clicked');
                    const payload = {
                      companyId: company.companyId,
                      invoiceDate: invoice.invoiceDate?.toISOString().slice(0,10),
                      dueDate: invoice.dueDate?.toISOString().slice(0,10),
                      customer: {
                        name: invoice.customerName,
                        address: invoice.customerAddress,
                        contact: invoice.customerContact,
                      },
                      items: items.map((it) => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
                      template: invoiceTemplate,
                      brandColor,
                      currencySymbol,
                      companyOverride: {
                        name: company?.companyName,
                        companyName: company?.companyName,
                        address: company?.address,
                        email: company?.email,
                        phone: company?.phoneNumber,
                        logo: company?.logo,
                        signature: company?.signature,
                        bankName: company?.bankName,
                        accountName: company?.bankAccountName,
                        accountNumber: company?.bankAccountNumber,
                      },
                    };
                    console.log('[TemplatePicker] Payload:', payload);
                    const res = await createInvoice(payload);
                    if (!res?.pdfUrl) throw new Error(res?.message || 'Failed to generate PDF');
                    console.log('[TemplatePicker] Server pdfUrl:', res.pdfUrl);
                    if (Platform.OS === 'web') {
                      console.log('[TemplatePicker][Web] Opening remote PDF URL');
                      await Linking.openURL(res.pdfUrl);
                      return;
                    }
                    const filename = `invoice-${Date.now()}.pdf`;
                    let baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory || null;
                    if (!baseDir && FileSystem.documentDirectory) {
                      // Create a temporary dir under documentDirectory
                      const tmpDir = `${FileSystem.documentDirectory}tmp/`;
                      try {
                        await FileSystem.makeDirectoryAsync(tmpDir, { intermediates: true });
                        baseDir = tmpDir;
                      } catch (mkErr) {
                        console.warn('[TemplatePicker] makeDirectory tmp failed:', mkErr?.message || mkErr);
                      }
                    }
                    if (!baseDir) {
                      console.warn('[TemplatePicker] No writable temp directory available, opening remote URL');
                      await Linking.openURL(res.pdfUrl);
                      return;
                    }
                    const tempUri = `${baseDir}${filename}`;
                    console.log('[TemplatePicker] tempUri:', tempUri);
                    const dl = await FileSystemLegacy.downloadAsync(res.pdfUrl, tempUri);
                    console.log('[TemplatePicker] Downloaded to temp:', dl?.uri);
                    if (Platform.OS === 'android') {
                      try {
                        const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                        console.log('[TemplatePicker][Android] SAF permission:', perm);
                        if (perm.granted && perm.directoryUri) {
                          const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(perm.directoryUri, filename, 'application/pdf');
                          console.log('[TemplatePicker][Android] SAF fileUri:', fileUri);
                          const base64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
                          await FileSystem.StorageAccessFramework.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
                          Alert.alert('Saved', 'Invoice PDF saved to selected folder.');
                        } else {
                          // Fallback: open file from cache
                          console.log('[TemplatePicker][Android] SAF not granted, opening from cache');
                          const contentUri = await FileSystem.getContentUriAsync(dl.uri);
                          console.log('[TemplatePicker][Android] contentUri:', contentUri);
                          await Linking.openURL(contentUri);
                        }
                      } catch (e) {
                        // Fallback open
                        console.warn('[TemplatePicker][Android] SAF write failed:', e?.message || e);
                        try {
                          const contentUri = await FileSystem.getContentUriAsync(dl.uri);
                          console.log('[TemplatePicker][Android] Fallback contentUri:', contentUri);
                          await Linking.openURL(contentUri);
                        } catch (openErr) {
                          console.error('[TemplatePicker][Android] Fallback open failed:', openErr?.message || openErr);
                        }
                      }
                    } else {
                      console.log('[TemplatePicker][iOS/Web] Opening temp file');
                      await Linking.openURL(dl.uri);
                    }
                  } catch (err) {
                    console.error('[TemplatePicker] Download failed:', err?.message || err);
                    Alert.alert('Download failed', String(err?.message || err));
                  } finally {
                    setDownloading(false);
                  }
                }} style={[styles.primaryButton, downloading && { opacity: 0.7 }]} disabled={downloading}>
                  <Text style={styles.primaryButtonText}>{downloading ? 'Downloading…' : 'Download'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={async () => {
                  if (!company?.companyId) return Alert.alert('Error', 'Missing company ID. Please login again.');
                  try {
                    setPrinting(true);
                    const payload = {
                      companyId: company.companyId,
                      invoiceDate: invoice.invoiceDate?.toISOString().slice(0,10),
                      dueDate: invoice.dueDate?.toISOString().slice(0,10),
                      customer: {
                        name: invoice.customerName,
                        address: invoice.customerAddress,
                        contact: invoice.customerContact,
                      },
                      items: items.map((it) => ({ description: it.description, qty: Number(it.qty || 0), price: Number(it.price || 0) })),
                      template: invoiceTemplate,
                      brandColor,
                      currencySymbol,
                    };
                    const res = await createInvoice(payload);
                    if (!res?.pdfUrl) throw new Error(res?.message || 'Failed to generate PDF');
                    await Linking.openURL(res.pdfUrl);
                  } catch (err) {
                    Alert.alert('Print failed', String(err?.message || err));
                  } finally {
                    setPrinting(false);
                  }
                }} style={[styles.secondaryButton, printing && { opacity: 0.7 }]} disabled={printing}>
                  <Text style={styles.secondaryButtonText}>{printing ? 'Opening…' : 'Print (Web)'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </ScrollView>
      </KeyboardAvoidingView>
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
  dateText: { color: Colors.text, fontSize: 12 },
  // Editor styles
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: { color: Colors.white, fontFamily: Fonts.bold },
  primaryButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryButtonText: { color: Colors.white, fontSize: 14, fontFamily: Fonts.semiBold, textAlign: 'center' },
  secondaryButton: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  secondaryButtonText: { color: Colors.text, fontSize: 14, fontFamily: Fonts.semiBold, textAlign: 'center' },
  primaryHollowButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryHollowButtonText: { color: Colors.primary, fontSize: 14, fontFamily: Fonts.semiBold },
});