// Generates an HTML invoice that mirrors the in-app preview layout
// This HTML is designed to be rendered by expo-print (client) and Puppeteer/wkhtmltopdf (server) for parity

export function buildInvoiceHtml({ company = {}, invoice = {}, items = [], template = 'classic', brandColor = '#6C63FF', currencySymbol = '₦' }) {
  const safe = (v) => (v == null ? '' : String(v));
  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const name = safe(company.companyName || company.name || 'Your Company');
  const address = safe(company.address || '');
  const email = safe(company.email || '');
  const phone = safe(company.phoneNumber || company.phone || '');
  const bankName = safe(company.bankName || '');
  const accountName = safe(company.bankAccountName || company.accountName || '');
  const accountNumber = safe(company.bankAccountNumber || company.accountNumber || '');
  const logo = safe(company.logo || '');
  const signature = safe(company.signature || '');
  const terms = safe(company.termsAndConditions || company.terms || '');

  const brand = brandColor || '#6C63FF';
  const theme = getThemeFor(template, brand);

  const issuanceDate = safe(invoice.invoiceDate || new Date().toISOString().slice(0, 10));
  const dueDate = safe(invoice.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const invoiceNumber = safe(invoice.invoiceNumber || `INV-${String(Date.now()).slice(-6)}`);
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
  const tax = 0; // Tax logic can be added here
  const grand = subtotal + tax;
  const amountWords = amountToWordsWithCurrencyNameOnly(grand, currencySymbol);

  // --- HTML Sub-components ---

  const bankDetailsBlock = (bankName || accountName || accountNumber) ? `
    <div class="bank-details">
      <div class="section-title">Bank Details</div>
      ${bankName ? `<div class="info-row"><span>Bank:</span> ${escapeHtml(bankName)}</div>` : ''}
      ${accountName ? `<div class="info-row"><span>Account Name:</span> ${escapeHtml(accountName)}</div>` : ''}
      ${accountNumber ? `<div class="info-row"><span>Account Number:</span> ${escapeHtml(accountNumber)}</div>` : ''}
    </div>
  ` : '';

  const signatureBlock = signature ? `
    <div class="signature-block">
      <img src="${signature}" alt="Signature" />
      <div class="line"></div>
      <div class="label">Authorized Signature</div>
    </div>
  ` : '';

  const itemsRows = rows.map((r, i) => `
    <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
      <td class="col-desc">${escapeHtml(r.desc)}</td>
      <td class="col-qty">${r.qty}</td>
      <td class="col-price">${currencySymbol}${r.price.toFixed(2)}</td>
      <td class="col-total">${currencySymbol}${r.total.toFixed(2)}</td>
    </tr>
  `).join('');

  // --- Template Specific Structures ---

  let contentHtml = '';

  if (template === 'modern') {
    contentHtml = `
      <div class="header-modern" style="background-color: ${theme.primary}; color: ${theme.headerText};">
        <div class="header-content">
          <div class="brand-area">
            ${logo ? `<img class="logo-img" src="${logo}" />` : ''}
            <div>
              <div class="company-name">${escapeHtml(name)}</div>
              <div class="company-meta">${escapeHtml(email)}</div>
              <div class="company-meta">${escapeHtml(phone)}</div>
            </div>
          </div>
          <div class="invoice-title-area">
            <div class="invoice-badge">INVOICE</div>
            <div class="invoice-number">#${escapeHtml(invoiceNumber)}</div>
          </div>
        </div>
      </div>
      
      <div class="body-content">
        <div class="meta-grid">
          <div class="meta-box">
            <div class="label">Bill To</div>
            <div class="value strong">${escapeHtml(customerName)}</div>
            <div class="value">${escapeHtml(customerAddress)}</div>
            <div class="value">${escapeHtml(customerContact)}</div>
          </div>
          <div class="meta-box align-right">
            <div class="info-pair">
              <span class="label">Date:</span>
              <span class="value">${escapeHtml(issuanceDate)}</span>
            </div>
            <div class="info-pair">
              <span class="label">Due Date:</span>
              <span class="value">${escapeHtml(dueDate)}</span>
            </div>
          </div>
        </div>

        <table class="modern-table">
          <thead>
            <tr>
              <th class="col-desc">Description</th>
              <th class="col-qty">Qty</th>
              <th class="col-price">Price</th>
              <th class="col-total">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="summary-section">
          <div class="left-area">
            <div class="amount-words"><strong>Amount in Words:</strong> ${escapeHtml(amountWords)}</div>
            ${bankDetailsBlock}
          </div>
          <div class="totals-area">
            <div class="total-row"><span>Subtotal</span> <span>${currencySymbol}${subtotal.toFixed(2)}</span></div>
            <div class="total-row grand-total" style="color: ${theme.primary}">
              <span>Total</span> <span>${currencySymbol}${grand.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div class="footer-area">
          <div class="signature-wrapper">${signatureBlock}</div>
          ${terms ? `<div class="terms"><strong>Terms:</strong> ${escapeHtml(terms)}</div>` : ''}
          <div class="footer-note">Thank you for your business!</div>
        </div>
      </div>
    `;
  } else if (template === 'bold') {
    contentHtml = `
      <div class="header-bold">
        <div class="top-bar" style="background-color: ${theme.primary}"></div>
        <div class="header-inner">
          <div class="company-info">
            ${logo ? `<img class="logo-img" src="${logo}" />` : ''}
            <div class="company-name" style="color: ${theme.primary}">${escapeHtml(name)}</div>
            <div class="company-address">${escapeHtml(address)}</div>
          </div>
          <div class="invoice-big-title" style="color: ${theme.accent}">INVOICE</div>
        </div>
      </div>

      <div class="body-content">
        <div class="client-grid">
          <div class="client-box" style="border-left: 4px solid ${theme.primary}">
            <div class="label">Invoiced To:</div>
            <div class="value big">${escapeHtml(customerName)}</div>
            <div class="value">${escapeHtml(customerAddress)}</div>
          </div>
          <div class="details-box">
             <div class="detail-row"><span class="label">Invoice No:</span> <span class="value">${escapeHtml(invoiceNumber)}</span></div>
             <div class="detail-row"><span class="label">Date:</span> <span class="value">${escapeHtml(issuanceDate)}</span></div>
             <div class="detail-row"><span class="label">Due Date:</span> <span class="value">${escapeHtml(dueDate)}</span></div>
          </div>
        </div>

        <table class="bold-table">
          <thead style="background-color: ${theme.primary}; color: white;">
            <tr>
              <th class="col-desc">Item Description</th>
              <th class="col-qty">Qty</th>
              <th class="col-price">Price</th>
              <th class="col-total">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="summary-section">
           <div class="left-area">
              <div class="amount-words" style="background-color: #f3f4f6; padding: 10px; border-radius: 4px;">
                <strong>In Words:</strong> ${escapeHtml(amountWords)}
              </div>
              ${bankDetailsBlock}
           </div>
           <div class="totals-area">
              <div class="total-row"><span>Subtotal</span> <span>${currencySymbol}${subtotal.toFixed(2)}</span></div>
              <div class="total-row grand-total" style="background-color: ${theme.primary}; color: white; padding: 10px;">
                <span>Total</span> <span>${currencySymbol}${grand.toFixed(2)}</span>
              </div>
           </div>
        </div>

        <div class="footer-area">
          <div class="signature-wrapper">${signatureBlock}</div>
          ${terms ? `<div class="terms" style="border-top: 2px solid ${theme.primary}; padding-top: 10px;">${escapeHtml(terms)}</div>` : ''}
        </div>
      </div>
    `;
  } else if (template === 'minimal') {
    contentHtml = `
      <div class="body-content minimal-layout">
        <div class="header-minimal">
          <div class="left">
            ${logo ? `<img class="logo-img" src="${logo}" />` : ''}
            <div class="company-name">${escapeHtml(name)}</div>
            <div class="company-meta">${escapeHtml(address)}</div>
            <div class="company-meta">${escapeHtml(email)} • ${escapeHtml(phone)}</div>
          </div>
          <div class="right">
            <div class="invoice-title">INVOICE</div>
            <div class="invoice-ref">#${escapeHtml(invoiceNumber)}</div>
          </div>
        </div>

        <div class="separator-line"></div>

        <div class="meta-grid">
           <div class="meta-box">
             <div class="label">Bill To</div>
             <div class="value strong">${escapeHtml(customerName)}</div>
             <div class="value">${escapeHtml(customerAddress)}</div>
           </div>
           <div class="meta-box align-right">
             <div class="info-pair"><span class="label">Date</span> <span class="value">${escapeHtml(issuanceDate)}</span></div>
             <div class="info-pair"><span class="label">Due</span> <span class="value">${escapeHtml(dueDate)}</span></div>
           </div>
        </div>

        <table class="minimal-table">
          <thead>
            <tr>
              <th class="col-desc">Description</th>
              <th class="col-qty">Qty</th>
              <th class="col-price">Price</th>
              <th class="col-total">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="summary-section">
          <div class="left-area">
             <div class="amount-words">${escapeHtml(amountWords)}</div>
             ${bankDetailsBlock}
          </div>
          <div class="totals-area">
            <div class="total-row"><span>Subtotal</span> <span>${currencySymbol}${subtotal.toFixed(2)}</span></div>
            <div class="total-row grand-total"><span>Total</span> <span>${currencySymbol}${grand.toFixed(2)}</span></div>
          </div>
        </div>

        <div class="footer-area">
          <div class="signature-wrapper">${signatureBlock}</div>
          ${terms ? `<div class="terms">${escapeHtml(terms)}</div>` : ''}
        </div>
      </div>
    `;
  } else if (template === 'compact') {
    contentHtml = `
      <div class="body-content compact-layout">
        <div class="header-compact" style="border-bottom: 3px solid ${theme.primary}">
           <div class="row">
             <div class="col">
               <div class="invoice-title" style="color: ${theme.primary}">INVOICE</div>
               <div class="invoice-number">#${escapeHtml(invoiceNumber)}</div>
             </div>
             <div class="col align-right">
               <div class="company-name">${escapeHtml(name)}</div>
               <div class="company-meta">${escapeHtml(email)}</div>
               <div class="company-meta">${escapeHtml(phone)}</div>
             </div>
           </div>
        </div>

        <div class="meta-bar">
           <div class="bill-to">
             <span class="label">Bill To:</span> <strong>${escapeHtml(customerName)}</strong> | ${escapeHtml(customerAddress)}
           </div>
           <div class="dates">
             ${escapeHtml(issuanceDate)} (Due: ${escapeHtml(dueDate)})
           </div>
        </div>

        <table class="compact-table">
          <thead style="background-color: #f3f4f6;">
            <tr>
              <th class="col-desc">Description</th>
              <th class="col-qty">Qty</th>
              <th class="col-price">Price</th>
              <th class="col-total">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="summary-section">
          <div class="left-area">
            ${bankDetailsBlock}
          </div>
          <div class="totals-area">
             <div class="total-row grand-total" style="border-top: 2px solid ${theme.primary}">
               <span>Total</span> <span>${currencySymbol}${grand.toFixed(2)}</span>
             </div>
             <div class="amount-words right">${escapeHtml(amountWords)}</div>
          </div>
        </div>

        <div class="footer-area">
          <div class="signature-wrapper right">${signatureBlock}</div>
        </div>
      </div>
      `;
  } else {
    // Classic Template (Default)
    contentHtml = `
      <div class="header-classic">
        <div class="company-block">
          ${logo ? `<img class="logo-img" src="${logo}" />` : ''}
          <div class="company-name">${escapeHtml(name)}</div>
          <div class="company-meta">${escapeHtml(address)}</div>
          <div class="company-meta">${escapeHtml(email)} | ${escapeHtml(phone)}</div>
        </div>
        <div class="invoice-title-block">
          <div class="invoice-title">INVOICE</div>
          <div class="invoice-meta">No. ${escapeHtml(invoiceNumber)}</div>
          <div class="invoice-meta">Date: ${escapeHtml(issuanceDate)}</div>
        </div>
      </div>
      <div class="divider-double"></div>

      <div class="body-content">
        <div class="bill-to-section">
           <div class="label">TO:</div>
           <div class="customer-name">${escapeHtml(customerName)}</div>
           <div class="customer-address">${escapeHtml(customerAddress)}</div>
           <div class="customer-contact">${escapeHtml(customerContact)}</div>
        </div>

        <table class="classic-table">
          <thead>
            <tr>
              <th class="col-desc">DESCRIPTION</th>
              <th class="col-qty">QTY</th>
              <th class="col-price">PRICE</th>
              <th class="col-total">AMOUNT</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="summary-section">
           <div class="left-area">
              <div class="amount-words"><strong>Amount in Words:</strong> ${escapeHtml(amountWords)}</div>
              ${bankDetailsBlock}
           </div>
           <div class="totals-area">
              <div class="total-row"><span>Subtotal</span> <span>${currencySymbol}${subtotal.toFixed(2)}</span></div>
              <div class="total-row grand-total"><span>Total</span> <span>${currencySymbol}${grand.toFixed(2)}</span></div>
           </div>
        </div>

        <div class="footer-area">
          <div class="signature-wrapper">${signatureBlock}</div>
          ${terms ? `<div class="terms"><strong>Terms & Conditions:</strong> ${escapeHtml(terms)}</div>` : ''}
          <div class="classic-footer-line">Thank you for your business.</div>
        </div>
      </div>
    `;
  }

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Invoice ${invoiceNumber}</title>
      <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Merriweather:wght@400;700&family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
      <style>
        /* GLOBAL RESET & A4 SETUP */
        * { box-sizing: border-box; }
        body { 
          margin: 0; 
          padding: 0; 
          font-family: 'Inter', sans-serif; 
          background: #f0f0f0; 
          -webkit-print-color-adjust: exact; 
          color: #333;
        }
        
        @page { size: A4; margin: 0; }
        
        .page-container {
          width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          background: white;
          padding: 15mm;
          position: relative;
          box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }

        @media print {
          body { background: white; }
          .page-container { width: 100%; height: 100%; box-shadow: none; margin: 0; padding: 15mm; }
        }

        /* UTILS */
        .align-right { text-align: right; }
        .row { display: flex; justify-content: space-between; }
        .col { display: flex; flex-direction: column; }
        
        img.logo-img { max-width: 120px; max-height: 80px; object-fit: contain; margin-bottom: 10px; }
        
        table { width: 100%; border-collapse: collapse; margin-top: 20px; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; }
        th.col-qty, td.col-qty { text-align: center; width: 60px; }
        th.col-price, td.col-price { text-align: right; width: 120px; }
        th.col-total, td.col-total { text-align: right; width: 120px; }
        
        .summary-section { display: flex; justify-content: space-between; margin-top: 20px; page-break-inside: avoid; }
        .left-area { flex: 1; padding-right: 40px; }
        .totals-area { width: 300px; }
        .total-row { display: flex; justify-content: space-between; padding: 6px 0; }
        .grand-total { font-weight: 700; font-size: 1.2em; border-top: 2px solid #eee; margin-top: 5px; padding-top: 10px; }

        .bank-details { margin-top: 20px; font-size: 0.9em; background: #f9fafb; padding: 12px; border-radius: 4px; }
        .bank-details .section-title { font-weight: 700; margin-bottom: 4px; font-size: 0.95em; }
        .bank-details .info-row span { font-weight: 600; color: #666; width: 100px; display: inline-block; }

        .amount-words { font-style: italic; color: #555; margin-bottom: 10px; font-size: 0.9em; }

        .footer-area { margin-top: 40px; page-break-inside: avoid; }
        .signature-wrapper { margin-bottom: 20px; height: 100px; }
        .signature-block img { max-height: 80px; }
        .signature-block .line { width: 200px; border-bottom: 1px solid #333; margin-top: 5px; }
        .signature-block .label { font-size: 0.8em; margin-top: 4px; color: #555; }
        
        .terms { font-size: 0.85em; color: #666; margin-top: 15px; white-space: pre-wrap; }

        /* --- THEME SPECIFICS --- */

        /* MODERN */
        .header-modern { display: flex; flex-direction: column; margin: -15mm -15mm 20px -15mm; padding: 15mm 15mm 20px 15mm; }
        .header-modern .header-content { display: flex; justify-content: space-between; align-items: center; }
        .header-modern .brand-area { display: flex; align-items: center; gap: 15px; }
        .header-modern .company-name { font-size: 1.8em; font-weight: 700; }
        .header-modern .invoice-title-area { text-align: right; }
        .header-modern .invoice-badge { background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 4px; font-weight: 600; display: inline-block; margin-bottom: 5px; }
        .header-modern .invoice-number { font-size: 1.2em; }
        .modern-table th { background: #f3f4f6; color: #333; font-weight: 700; text-transform: uppercase; font-size: 0.85em; }
        .modern-table tr { border-bottom: 1px solid #eee; }

        /* BOLD */
        .header-bold .top-bar { height: 10px; margin: -15mm -15mm 20px -15mm; }
        .header-bold .header-inner { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
        .header-bold .company-name { font-size: 2.5em; font-weight: 900; letter-spacing: -1px; line-height: 1; }
        .header-bold .invoice-big-title { font-size: 4em; font-weight: 900; opacity: 0.1; line-height: 0.8; }
        .bold-table th { padding: 12px; }
        .bold-table tr { border-bottom: 2px solid #eee; }
        .client-box { padding-left: 15px; }
        .client-box .big { font-size: 1.4em; font-weight: 700; margin: 5px 0; }
        .details-box .detail-row { display: flex; justify-content: flex-end; margin-bottom: 5px; }
        .details-box .label { font-weight: 600; margin-right: 10px; color: #777; }

        /* MINIMAL */
        .minimal-layout { font-family: 'Inter', sans-serif; }
        .header-minimal { display: flex; justify-content: space-between; align-items: flex-start; }
        .header-minimal .company-name { font-weight: 700; font-size: 1.4em; }
        .header-minimal .invoice-title { font-weight: 300; font-size: 2em; letter-spacing: 2px; color: #333; }
        .header-minimal .invoice-ref { text-align: right; font-weight: 600; color: #777; }
        .separator-line { height: 1px; background: #eee; margin: 20px 0; }
        .minimal-table th { border-bottom: 1px solid #333; padding-bottom: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; font-size: 0.8em; }
        .minimal-table td { padding: 15px 10px; }

        /* COMPACT */
        .compact-layout { font-size: 0.9em; }
        .header-compact { margin-bottom: 15px; padding-bottom: 15px; }
        .header-compact .company-name { font-weight: 700; font-size: 1.4em; text-align: right; }
        .header-compact .invoice-title { font-weight: 900; font-size: 1.8em; }
        .header-compact .meta-bar { background: #f9fafb; padding: 10px; display: flex; justify-content: space-between; border-radius: 4px; border: 1px solid #eee; }
        .compact-table th { font-size: 0.85em; text-transform: uppercase;  }
        .compact-table td { padding: 8px 10px; }
        
        /* CLASSIC */
        .header-classic { text-align: center; }
        .header-classic .company-name { font-family: 'Playfair Display', serif; font-size: 2.2em; color: #222; margin: 10px 0; }
        .divider-double { border-top: 1px solid #333; border-bottom: 1px solid #333; height: 3px; margin: 20px 0; }
        .invoice-title-block { margin: 20px 0; text-align: center; }
        .invoice-title-block .invoice-title { font-size: 1.4em; font-weight: 600; letter-spacing: 3px; border: 1px solid #333; display: inline-block; padding: 8px 30px; margin-bottom: 10px; }
        .bill-to-section .label { font-weight: 700; font-size: 0.8em; color: #666; margin-bottom: 4px; }
        .bill-to-section .customer-name { font-size: 1.2em; font-weight: 700; }
        .classic-table th { border-bottom: 2px solid #333; font-family: 'Playfair Display', serif; font-weight: 700; }
        .classic-table td { border-bottom: 1px solid #eee; }
        .classic-footer-line { text-align: center; margin-top: 30px; font-style: italic; color: #777; font-family: 'Playfair Display', serif; }

      </style>
    </head>
    <body>
      <div class="page-container">
        ${contentHtml}
      </div>
    </body>
  </html>`;
}

// --- Utils ---

function getThemeFor(tpl, brand) {
  // Helper to adjust color brightness
  const shade = (col, amt) => {
    let usePound = false;
    if (col[0] == "#") {
      col = col.slice(1);
      usePound = true;
    }
    let num = parseInt(col, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255;
    else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255;
    else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255;
    else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16);
  };

  switch (tpl) {
    case 'modern': return { primary: brand, accent: shade(brand, -20), headerText: '#ffffff' };
    case 'bold': return { primary: brand, accent: '#e5e7eb' };
    case 'compact': return { primary: brand };
    default: return { primary: brand };
  }
}

// Map currency symbol to common currency name; default to symbol if unknown
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
  const n = Math.abs(Number(amount || 0));
  const whole = Math.floor(n);
  const words = numberToWords(whole);
  const cname = currencyNameForSymbol(currencySymbol);
  return `${words} ${cname} Only`;
}

function numberToWords(num) {
  // Simple implementation for demo purposes
  // In prod, use a robust library
  num = Math.floor(Math.abs(Number(num || 0)));
  if (num === 0) return 'Zero';

  const a = ['', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ', 'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ', 'Seventeen ', 'Eighteen ', 'Nineteen '];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const inWords = (n) => {
    if ((n = n.toString()).length > 9) return 'overflow';
    let n_array = ('000000000' + n).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!n_array) return;
    let str = '';
    str += (n_array[1] != 0) ? (a[Number(n_array[1])] || b[n_array[1][0]] + ' ' + a[n_array[1][1]]) + 'Crore ' : '';
    str += (n_array[2] != 0) ? (a[Number(n_array[2])] || b[n_array[2][0]] + ' ' + a[n_array[2][1]]) + 'Lakh ' : '';
    // Simplified standard mapping
    return convertThreeDigits(n);
  };

  // Better custom recursive function for standard billions/millions
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

  let words = '';
  let scaleIndex = 0;

  while (num > 0) {
    let chunk = num % 1000;
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
    num = Math.floor(num / 1000);
    scaleIndex++;
  }
  return words.trim();
}

function convertThreeDigits(n) { return '...'; } // Stub not used, logic inline above