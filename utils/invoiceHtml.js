import { resolveAssetUri } from './api';

export function buildInvoiceHtml(opts) {
  return buildDocumentHtml({ ...opts, type: 'invoice' });
}

export function buildReceiptHtml(opts) {
  return buildDocumentHtml({ ...opts, type: 'receipt' });
}

function buildDocumentHtml({
  company = {},
  invoice = {},
  items = [],
  template = 'classic',
  brandColor = '#1e3050',
  currencySymbol = '₦',
  type = 'invoice',
  receiptNumber = '',
  receiptDate = '',
  amountPaid = 0,
}) {
  const safe = (v) => (v == null ? '' : String(v));
  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const isReceipt = type === 'receipt';
  const name = safe(company.name || company.companyName || 'Your Company');
  const address = safe(company.address || '');
  const email = safe(company.email || '');
  const phone = safe(company.phone || company.phoneNumber || '');
  const logo = resolveAssetUri(safe(company.logo || ''));
  const signature = resolveAssetUri(safe(company.signature || ''));
  const terms = safe(company.termsAndConditions || company.terms || '');
  const bankName = safe(company.bankName || '');
  const accountName = safe(company.accountName || company.bankAccountName || '');
  const accountNumber = safe(company.accountNumber || company.bankAccountNumber || '');

  const primaryColor = isReceipt ? (brandColor || '#10b981') : (brandColor || '#1e3050');

  const docDate = type === 'receipt' ? safe(receiptDate || new Date().toISOString().slice(0, 10)) : safe(invoice.invoiceDate || new Date().toISOString().slice(0, 10));
  const dueDate = safe(invoice.dueDate || '');
  const docNumber = type === 'receipt' ? safe(receiptNumber || `RCT-${String(Date.now()).slice(-6)}`) : safe(invoice.invoiceNumber || `INV-${String(Date.now()).slice(-6)}`);
  const invoiceRef = safe(invoice.invoiceNumber || '');

  const customerName = safe(invoice.customerName || invoice?.customer?.name || '');
  const customerAddress = safe(invoice.customerAddress || invoice?.customer?.address || '');
  const customerContact = safe(invoice.customerContact || invoice?.customer?.contact || '');

  const rows = (items || []).map((it) => {
    const qty = Number(it.qty || 0);
    const price = Number(it.price || 0);
    const total = Math.round(qty * price * 100) / 100;
    return { desc: safe(it.description || it.desc || '-'), qty, price, total };
  });

  const subtotal = rows.reduce((s, r) => s + r.total, 0);
  const totalAmount = isReceipt ? Number(amountPaid || subtotal) : subtotal;
  const amountWords = amountToWordsWithCurrencyNameOnly(totalAmount, currencySymbol);

  const label_title = isReceipt ? 'OFFICIAL RECEIPT' : 'INVOICE';
  const label_recipient = isReceipt ? 'RECEIVED FROM' : 'BILL TO';
  const label_no = isReceipt ? 'Receipt No' : 'Invoice No';
  const label_date = isReceipt ? 'Receipt Date' : 'Invoice Date';
  const status_badge = isReceipt ? '<div class="badge-status paid">PAYMENT CONFIRMED</div>' : '';

  // Template Data Helpers
  const logoImg = logo ? `<img src="${logo}" class="logo-img" />` : `<div class="logo-placeholder" style="color:${primaryColor}">${name.charAt(0)}</div>`;
  const signatureImg = signature ? `<img src="${signature}" class="signature-img" />` : '';

  const tableHeaderLabel = isReceipt ? 'SERVICES/ITEMS PAID FOR' : 'ITEM DESCRIPTION';

  // Common Table Generator
  const generateTableHtml = (styleClass) => `
    <table class="${styleClass}">
      <thead>
        <tr>
          <th>${tableHeaderLabel}</th>
          <th class="center">Qty</th>
          <th class="right">Price</th>
          <th class="right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr class="${i % 2 === 1 ? 'alt-row' : ''}">
            <td class="col-desc">${escapeHtml(r.desc)}</td>
            <td class="col-qty center">${r.qty}</td>
            <td class="col-price right">${currencySymbol}${r.price.toFixed(2)}</td>
            <td class="col-total right"><strong>${currencySymbol}${r.total.toFixed(2)}</strong></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  let layoutHtml = '';

  if (template === 'modern') {
    layoutHtml = `
      <div class="modern-header" style="background: ${primaryColor}">
        <div class="row">
          <div class="col left">
             ${logo ? `<img src="${logo}" class="logo-white" />` : `<div class="logo-placeholder-white">${name.charAt(0)}</div>`}
             <div class="company-name-white">${escapeHtml(name)}</div>
          </div>
          <div class="col right align-right">
             <div class="doc-title-white">${label_title}</div>
             <div class="doc-meta-white">${label_no}: #${escapeHtml(docNumber)}</div>
             <div class="doc-meta-white">${label_date}: ${escapeHtml(docDate)}</div>
          </div>
        </div>
      </div>
      <div class="content-padding">
        <div class="row spacing-30">
          <div class="col">
            <div class="label-muted">${label_recipient}</div>
            <div class="client-name">${escapeHtml(customerName)}</div>
            <div class="client-meta">${escapeHtml(customerAddress)}</div>
            <div class="client-meta">${escapeHtml(customerContact)}</div>
          </div>
          <div class="col align-right">
            ${status_badge}
            ${!isReceipt && dueDate ? `<div class="label-muted">DUE DATE</div><div class="meta-val">${escapeHtml(dueDate)}</div>` : ''}
            ${isReceipt && invoiceRef ? `<div class="label-muted">INVOICE REFERENCE</div><div class="meta-val">#${escapeHtml(invoiceRef)}</div>` : ''}
          </div>
        </div>
        ${generateTableHtml('modern-table')}
      </div>
    `;
  } else if (template === 'bold') {
    layoutHtml = `
      <div class="bold-sidebar" style="background: ${primaryColor}"></div>
      <div class="content-padding">
        <div class="row">
          <div class="col">
            ${logoImg}
            <div class="company-title" style="color: ${primaryColor}">${escapeHtml(name)}</div>
            <div class="company-meta">${escapeHtml(address)}</div>
          </div>
          <div class="col align-right">
            <div class="huge-title" style="color: ${primaryColor}">${label_title}</div>
            <div class="bold-meta"><strong>${label_no}:</strong> #${escapeHtml(docNumber)}</div>
            <div class="bold-meta"><strong>${label_date}:</strong> ${escapeHtml(docDate)}</div>
            ${status_badge}
          </div>
        </div>
        <div class="horizontal-rule" style="background: ${primaryColor}"></div>
        <div class="row spacing-20">
          <div class="col">
            <div class="bold-label" style="color: ${primaryColor}">${label_recipient}</div>
            <div class="client-name-bold">${escapeHtml(customerName)}</div>
            <div class="client-meta">${escapeHtml(customerAddress)}</div>
          </div>
        </div>
        ${generateTableHtml('bold-table')}
      </div>
    `;
  } else if (template === 'minimal') {
    layoutHtml = `
      <div class="content-padding">
        <div class="minimal-header" style="border-bottom-color: ${primaryColor}">
           <div class="minimal-brand">${logoImg} <span style="color:${primaryColor}">${escapeHtml(name)}</span></div>
           <div class="minimal-title">${label_title}</div>
        </div>
        <div class="row spacing-40">
           <div class="col">
              <div class="min-label">CLIENT / CUSTOMER</div>
              <div class="min-name">${escapeHtml(customerName)}</div>
              <div class="min-meta">${escapeHtml(customerAddress)}</div>
           </div>
           <div class="col align-right">
              <div class="min-label">TRANSACTION DETAILS</div>
              <div class="min-meta">${label_no}: <strong>#${escapeHtml(docNumber)}</strong></div>
              <div class="min-meta">${label_date}: <strong>${escapeHtml(docDate)}</strong></div>
              ${status_badge}
           </div>
        </div>
        ${generateTableHtml('minimal-table')}
      </div>
    `;
  } else if (template === 'compact') {
    layoutHtml = `
      <div class="compact-header" style="border-left: 10px solid ${primaryColor}">
         <div class="row v-center">
            <div class="col flex-row">
               ${logoImg}
               <div class="compact-brand">
                  <div class="c-name">${escapeHtml(name)}</div>
                  <div class="c-meta">${escapeHtml(email)} | ${escapeHtml(phone)}</div>
               </div>
            </div>
            <div class="col align-right">
               <div class="c-title" style="color: ${primaryColor}">${label_title}</div>
               <div class="c-no">Ref: #${escapeHtml(docNumber)}</div>
               <div class="c-no">Date: ${escapeHtml(docDate)}</div>
            </div>
         </div>
      </div>
      <div class="content-padding">
         <div class="compact-strip" style="background: ${primaryColor}08; border-left: 3px solid ${primaryColor}">
            <strong>${label_recipient}:</strong> ${escapeHtml(customerName)} &bull; ${escapeHtml(customerAddress)}
         </div>
         ${status_badge}
         ${generateTableHtml('compact-table')}
      </div>
    `;
  } else {
    // Classic (Premium Default)
    layoutHtml = `
      <div class="content-padding">
        <div class="classic-header">
           <div class="classic-left">${logoImg}</div>
           <div class="classic-right align-right">
              <div class="classic-title" style="color: ${primaryColor}">${label_title}</div>
              <div class="classic-id">${label_no}: #${escapeHtml(docNumber)}</div>
              <div class="classic-date">${label_date}: ${escapeHtml(docDate)}</div>
              ${status_badge}
           </div>
        </div>
        <div class="classic-divider" style="border-color:${primaryColor}"></div>
        <div class="row spacing-30">
           <div class="col">
              <div class="company-name-classic" style="color:${primaryColor}">${escapeHtml(name)}</div>
              <div class="company-meta">${escapeHtml(address)}</div>
              <div class="company-meta">${escapeHtml(email)}</div>
              <div class="company-meta">${escapeHtml(phone)}</div>
           </div>
           <div class="col align-right">
              <div class="label-muted">PREPARED FOR</div>
              <div class="client-name-classic">${escapeHtml(customerName)}</div>
              <div class="client-meta">${escapeHtml(customerAddress)}</div>
              <div class="client-meta">${escapeHtml(customerContact)}</div>
           </div>
        </div>
        ${generateTableHtml('classic-table')}
      </div>
    `;
  }

  // Common Footer & Totals Section
  const totalsHtml = `
    <div class="content-padding total-section-wrapper">
      <div class="row total-row-main">
        <div class="col bottom-left">
           <div class="amount-in-words">
              <div class="label-muted">AMOUNT IN WORDS</div>
              <div class="words-val">${escapeHtml(amountWords)}</div>
           </div>
           ${!isReceipt && (bankName || accountNumber) ? `
           <div class="bank-details-box">
              <div class="label-muted">PAYMENT INFORMATION</div>
              <div class="bank-val"><strong>Bank:</strong> ${escapeHtml(bankName)}</div>
              <div class="bank-val"><strong>A/C Name:</strong> ${escapeHtml(accountName)}</div>
              <div class="bank-val"><strong>A/C No:</strong> ${escapeHtml(accountNumber)}</div>
           </div>
           ` : ''}
           ${terms ? `<div class="terms-label">Notes / Terms</div><div class="terms-val">${escapeHtml(terms)}</div>` : ''}
        </div>
        <div class="col bottom-right align-right">
           <div class="total-card" style="border-top: 4px solid ${primaryColor}">
              <div class="t-row"><span>Total Amount</span><span>${currencySymbol}${subtotal.toFixed(2)}</span></div>
              <div class="t-row grand" style="color: ${primaryColor}"><span>${isReceipt ? 'TOTAL PAID' : 'GRAND TOTAL'}</span><span>${currencySymbol}${totalAmount.toFixed(2)}</span></div>
           </div>
           <div class="signature-area">
              ${signatureImg}
              <div class="sig-line"></div>
              <div class="sig-text">Authorized Signature</div>
           </div>
        </div>
      </div>
      <div class="legal-footer">
        ${template === 'classic'
      ? `This document is legally binding and generated via YMOBooks Accounting &bull; Copyright &copy; ${new Date().getFullYear()}`
      : `This document is legally binding and generated by ${escapeHtml(name)}. Any alteration renders this ${type} invalid &bull; Copyright &copy; ${new Date().getFullYear()}`
    }
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
    <title>${label_title} ${docNumber}</title>
    <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">
    <style>
      :root {
        --primary: ${primaryColor};
        --text: #1e293b;
        --muted: #64748b;
        --border: #e2e8f0;
      }
      * { box-sizing: border-box; }
      body { 
        margin: 0; padding: 0; 
        font-family: 'Plus Jakarta Sans', sans-serif; 
        background-color: #f8fafc; 
        color: var(--text);
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      @page { size: A4; margin: 0; }
      
      .page-container {
        width: 210mm;
        min-height: 297mm;
        margin: 20px auto;
        background: white;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 50px rgba(0,0,0,0.1);
      }

      @media screen and (max-width: 210mm) {
        body { background: white; }
        .page-container { 
          width: 100%; 
          margin: 0; 
          box-shadow: none;
          transform-origin: top left;
        }
      }

      @media print {
        body { background: white; padding: 0; }
        .page-container { width: 100%; height: 100%; margin: 0; box-shadow: none; border-radius: 0; }
      }

      /* SHARED STYLES */
      .content-padding { padding: 45px; }
      .row { display: flex; justify-content: space-between; }
      .col { display: flex; flex-direction: column; }
      .align-right { text-align: right; }
      .center { text-align: center; }
      .right { text-align: right; }
      .spacing-20 { margin-top: 20px; }
      .spacing-30 { margin-top: 30px; }
      .spacing-40 { margin-top: 40px; }
      .label-muted { font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 6px; }
      
      img.logo-img { max-width: 160px; max-height: 90px; object-fit: contain; margin-bottom: 12px; }
      .logo-placeholder { background: #f1f5f9; width: 70px; height: 70px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px; font-weight: 800; margin-bottom: 12px; }
      
      .badge-status.paid { 
        background: #10b981; color: white; padding: 8px 18px; border-radius: 6px; 
        font-weight: 800; font-size: 13px; display: inline-block; margin: 15px 0;
        box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.2);
      }

      table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 35px 0; }
      th { padding: 15px; text-align: left; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid var(--border); }
      td { padding: 15px; border-bottom: 1px solid var(--border); font-size: 14px; color: #334155; }
      .alt-row { background-color: #f8fafc; }

      .total-section-wrapper { margin-top: auto; border-top: 1px solid #f1f5f9; background: #fafafa; padding-bottom: 30px; }
      .total-card { background: white; padding: 25px; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); min-width: 280px; }
      .t-row { display: flex; justify-content: space-between; font-size: 15px; margin-bottom: 10px; color: var(--muted); }
      .t-row.grand { font-size: 22px; font-weight: 800; margin-top: 15px; padding-top: 15px; border-top: 1px dashed #e2e8f0; }
      
      .amount-in-words { margin-bottom: 30px; padding: 15px; background: white; border-radius: 8px; border-left: 4px solid var(--primary); }
      .words-val { font-size: 13px; font-style: italic; color: #475569; font-weight: 600; text-transform: capitalize; }
      
      .bank-details-box { background: #fdfdfd; padding: 18px; border-radius: 10px; border: 1px solid #e2e8f0; margin-bottom: 25px; font-size: 12px; color: #475569; }
      .bank-val { margin-bottom: 4px; }
      .terms-label { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; }
      .terms-val { font-size: 11px; line-height: 1.6; color: #64748b; white-space: pre-wrap; }

      .signature-area { margin-top: 35px; display: flex; flex-direction: column; align-items: flex-end; }
      img.signature-img { max-width: 160px; max-height: 70px; margin-bottom: 8px; }
      .sig-line { width: 200px; border-bottom: 2px solid #1e293b; margin-bottom: 6px; }
      .sig-text { font-size: 11px; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }

      .legal-footer { text-align: center; font-size: 10px; color: #94a3b8; padding: 30px 45px 0 45px; border-top: 1px solid #f1f5f9; margin-top: 25px; }

      /* TEMPLATE SPECIFICS */
      
      /* MODERN */
      .modern-header { padding: 45px; color: white; }
      .logo-white { height: 65px; }
      .logo-placeholder-white { background: rgba(255,255,255,0.2); width: 60px; height: 60px; border-radius: 12px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-bottom: 12px; font-size: 28px; }
      .company-name-white { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
      .doc-title-white { font-size: 36px; font-weight: 900; letter-spacing: -1.5px; margin-bottom: 10px; }
      .doc-meta-white { font-size: 14px; font-weight: 500; opacity: 0.9; }
      .modern-table th { background: transparent; color: var(--primary); }

      /* BOLD */
      .bold-sidebar { position: absolute; left: 0; top: 0; bottom: 0; width: 20px; }
      .huge-title { font-size: 55px; font-weight: 900; line-height: 1; margin-bottom: 20px; opacity: 0.08; position: absolute; right: 45px; top: 45px; pointer-events: none; }
      .company-title { font-size: 28px; font-weight: 900; margin-top: 15px; }
      .bold-table th { border-radius: 0; border-bottom: 3px solid var(--primary); }

      /* MINIMAL */
      .minimal-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #000; padding-bottom: 25px; margin-bottom: 45px; }
      .minimal-brand { display: flex; align-items: center; gap: 18px; font-weight: 900; font-size: 22px; }
      .minimal-title { font-size: 20px; font-weight: 300; letter-spacing: 12px; text-transform: uppercase; }
      .min-name { font-size: 20px; font-weight: 800; }
      .min-meta { font-size: 14px; color: var(--muted); }

      /* COMPACT */
      .compact-header { padding: 25px 45px; background: #fff; }
      .flex-row { flex-direction: row !important; align-items: center; gap: 18px; }
      .compact-brand .c-name { font-size: 20px; font-weight: 900; }
      .compact-brand .c-meta { font-size: 13px; color: var(--muted); }
      .c-title { font-size: 24px; font-weight: 900; }
      .compact-strip { padding: 15px 25px; font-size: 13px; border-radius: 8px; margin: 25px 0; }

      /* CLASSIC */
      .classic-title { font-family: 'Playfair Display', serif; font-size: 44px; font-weight: 900; margin-bottom: 5px; }
      .classic-divider { height: 6px; border-top: 2px solid #000; border-bottom: 1px solid #000; margin: 15px 0 45px 0; }
      .company-name-classic { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 900; margin-bottom: 8px; }
      .client-name-classic { font-size: 18px; font-weight: 800; margin-bottom: 5px; }
    </style>
    <script>
      function adjustScale() {
        const container = document.querySelector('.page-container');
        const width = window.innerWidth;
        const targetWidth = 210 * 3.7795275591; 
        if (width < targetWidth) {
          const scale = (width - 20) / targetWidth;
          container.style.transform = 'scale(' + scale + ')';
          container.style.transformOrigin = 'top center';
          container.style.width = targetWidth + 'px';
          container.style.margin = '10px auto';
        } else {
          container.style.transform = 'none';
          container.style.margin = '20px auto';
        }
      }
      window.onload = adjustScale;
      window.onresize = adjustScale;
    </script>
  </head>
  <body>
    <div class="page-container">
      ${layoutHtml}
      ${totalsHtml}
    </div>
  </body>
  </html>`;
}

function getThemeColors(tpl, primary) {
  const shade = (col, amt) => {
    let usePound = false;
    if (col[0] == "#") { col = col.slice(1); usePound = true; }
    let num = parseInt(col, 16);
    if (isNaN(num)) return col;
    let r = (num >> 16) + amt; r = Math.min(255, Math.max(0, r));
    let g = ((num >> 8) & 0x00FF) + amt; g = Math.min(255, Math.max(0, g));
    let b = (num & 0x0000FF) + amt; b = Math.min(255, Math.max(0, b));
    return (usePound ? "#" : "") + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  switch (tpl) {
    case 'modern': return { primary, accent: shade(primary, -30) };
    case 'bold': return { primary, accent: '#E5E7EB' };
    case 'minimal': return { primary: '#111827', accent: '#6B7280' };
    case 'compact': return { primary, accent: shade(primary, -20) };
    default: return { primary, accent: shade(primary, -20) };
  }
}

function currencyNameForSymbol(sym) {
  const s = String(sym || '').trim();
  switch (s) {
    case '₦': return 'Naira';
    case '$': return 'Dollars';
    case '€': return 'Euros';
    case '£': return 'Pounds';
    case '₵': return 'Cedis';
    case 'KSh': return 'Shillings';
    default: return s || 'Currency';
  }
}

function amountToWordsWithCurrencyNameOnly(amount, currencySymbol) {
  const n = Math.floor(Math.abs(Number(amount || 0)));
  if (n === 0) return 'Zero ' + currencyNameForSymbol(currencySymbol) + ' Only';
  return numberToWords(n) + ' ' + currencyNameForSymbol(currencySymbol) + ' Only';
}

function numberToWords(num) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

  let words = '';
  let scaleIndex = 0;
  let n = num;

  while (n > 0) {
    let chunk = n % 1000;
    if (chunk > 0) {
      let chunkStr = '';
      if (chunk >= 100) {
        chunkStr += ones[Math.floor(chunk / 100)] + ' Hundred ';
        chunk %= 100;
      }
      if (chunk >= 20) {
        chunkStr += tens[Math.floor(chunk / 10)] + ' ';
        chunk %= 10;
      }
      if (chunk > 0) {
        chunkStr += ones[chunk] + ' ';
      }
      words = chunkStr + scales[scaleIndex] + ' ' + words;
    }
    n = Math.floor(n / 1000);
    scaleIndex++;
  }
  return words.trim();
}