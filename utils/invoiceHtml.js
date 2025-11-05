// Generates an HTML invoice that mirrors the in-app preview layout
// This HTML is designed to be rendered by expo-print (client) and Puppeteer/wkhtmltopdf (server) for parity

export function buildInvoiceHtml({ company = {}, invoice = {}, items = [], template = 'classic', brandColor = '#6C63FF', currencySymbol = '₦' }) {
  const safe = (v) => (v == null ? '' : String(v));
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
  const border = '#e6e6e6';
  const text = '#222';
  const textSecondary = '#6b7280';
  const theme = getThemeFor(template, brand);
  const tplClass = `tpl-${template}`;

  const issuanceDate = safe(invoice.invoiceDate || new Date().toISOString().slice(0, 10));
  const dueDate = safe(invoice.dueDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const invoiceNumber = safe(invoice.invoiceNumber || `INV-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${String(Date.now()).slice(-4)}`);
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
  const grand = subtotal; // no tax in client; add if needed
  const amountWords = amountToWordsWithCurrencyNameOnly(grand, currencySymbol);

  const rowsHtml = rows.map((r) => `
      <tr>
        <td class="td desc">${escapeHtml(r.desc)}</td>
        <td class="td qty">${r.qty}</td>
        <td class="td price">${currencySymbol}${r.price.toFixed(2)}</td>
        <td class="td total">${currencySymbol}${r.total.toFixed(2)}</td>
      </tr>
  `).join('');

  // Build variant-specific header/content blocks so each template is structurally unique
  const headerClassic = `
    <div class="row header">
      <div class="company">${escapeHtml(name)}</div>
      <div class="title">INVOICE</div>
    </div>
    <div class="accent"></div>
    <div class="separator"></div>
  `;

  const headerModern = `
    <div class="row header" style="align-items:center;">
      <div style="display:flex; align-items:center; gap:12px;">
        ${logo ? `<img class="logo" src="${logo}" />` : ''}
        <div>
          <div class="company" style="${template==='modern' ? `color:${theme.headerText}` : ''}">${escapeHtml(name)}</div>
          <div class="meta" style="${template==='modern' ? `color:${theme.headerText}` : ''}">${escapeHtml(address)}</div>
        </div>
      </div>
      <div style="text-align:right">
        <div class="title" style="font-size:24px; ${template==='modern' ? `color:${theme.headerText}` : ''}">INVOICE</div>
        <div class="meta" style="${template==='modern' ? `color:${theme.headerText}` : ''}">Issuance: ${escapeHtml(issuanceDate)}</div>
        <div class="meta" style="${template==='modern' ? `color:${theme.headerText}` : ''}">Due: ${escapeHtml(dueDate)}</div>
      </div>
    </div>
    <div class="accent"></div>
  `;

  const headerMinimal = `
    <div class="row header" style="padding-bottom:8px;">
      <div style="display:flex; align-items:center; gap:8px;">
        ${logo ? `<img class="logo" style="width:48px;height:48px;margin:0;" src="${logo}" />` : ''}
        <div>
          <div class="company">${escapeHtml(name)}</div>
          <div class="meta">${escapeHtml(address)}</div>
        </div>
      </div>
      <div class="title">Invoice</div>
    </div>
    <div class="separator"></div>
  `;

  const headerBold = `
    <div class="row header" style="flex-direction:column; align-items:center; text-align:center; gap:6px;">
      ${logo ? `<img class="logo" style="width:80px;height:80px;margin:0;" src="${logo}" />` : ''}
      <div class="company" style="font-size:20px;">${escapeHtml(name)}</div>
      <div class="title" style="font-size:24px;">INVOICE</div>
    </div>
    <div class="accent"></div>
  `;

  const headerCompact = `
    <div class="row header" style="padding:10px 16px;">
      <div class="company">${escapeHtml(name)}</div>
      <div class="title" style="font-size:16px;">INVOICE</div>
    </div>
    <div class="accent"></div>
  `;

  const headerHtml = (
    template === 'modern' ? headerModern :
    template === 'minimal' ? headerMinimal :
    template === 'bold' ? headerBold :
    template === 'compact' ? headerCompact :
    headerClassic
  );

  const rightBoxClassic = `
    <div class="box">
      ${logo && template!=='modern' && template!=='bold' ? `<img class="logo" src="${logo}" />` : ''}
      ${address ? `<div class="text">${escapeHtml(address)}</div>` : ''}
      ${email ? `<div class="text">Email: ${escapeHtml(email)}</div>` : ''}
      ${phone ? `<div class="text">Phone: ${escapeHtml(phone)}</div>` : ''}
      ${(bankName || accountName || accountNumber) && template!=='minimal' && template!=='compact' ? `
        <div style="margin-top:6px">
          <div class="section">Bank Details</div>
          ${bankName ? `<div class="text">Bank: ${escapeHtml(bankName)}</div>` : ''}
          ${accountName ? `<div class="text">Account Name: ${escapeHtml(accountName)}</div>` : ''}
          ${accountNumber ? `<div class="text">Account Number: ${escapeHtml(accountNumber)}</div>` : ''}
        </div>
      ` : ''}
    </div>`;

  const rightBoxModern = `
    <div style="display:flex; flex-direction:column; gap:4px;">
      ${email ? `<div class="text">Email: ${escapeHtml(email)}</div>` : ''}
      ${phone ? `<div class="text">Phone: ${escapeHtml(phone)}</div>` : ''}
      ${(bankName || accountName || accountNumber) ? `
        <div style="margin-top:6px">
          <div class="section">Bank Details</div>
          ${bankName ? `<div class="text">Bank: ${escapeHtml(bankName)}</div>` : ''}
          ${accountName ? `<div class="text">Account Name: ${escapeHtml(accountName)}</div>` : ''}
          ${accountNumber ? `<div class="text">Account Number: ${escapeHtml(accountNumber)}</div>` : ''}
        </div>
      ` : ''}
    </div>`;

  const rightBoxMinimal = `
    <div style="display:flex; flex-direction:column; gap:4px;">
      ${email ? `<div class=\"text\">Email: ${escapeHtml(email)}</div>` : ''}
      ${phone ? `<div class=\"text\">Phone: ${escapeHtml(phone)}</div>` : ''}
    </div>`;

  const afterTableMinimal = (bankName || accountName || accountNumber) ? `
    <div style="padding: 0 24px; margin-top: 8px;">
      <div class="section">Bank Details</div>
      ${bankName ? `<div class="text">Bank: ${escapeHtml(bankName)}</div>` : ''}
      ${accountName ? `<div class="text">Account Name: ${escapeHtml(accountName)}</div>` : ''}
      ${accountNumber ? `<div class="text">Account Number: ${escapeHtml(accountNumber)}</div>` : ''}
    </div>
  ` : '';

  const afterTableBold = (bankName || accountName || accountNumber) ? `
    <div style="padding: 0 24px; margin-top: 8px;">
      <div class="section">Bank Details</div>
      ${bankName ? `<div class="text">Bank: ${escapeHtml(bankName)}</div>` : ''}
      ${accountName ? `<div class="text">Account Name: ${escapeHtml(accountName)}</div>` : ''}
      ${accountNumber ? `<div class="text">Account Number: ${escapeHtml(accountNumber)}</div>` : ''}
    </div>
  ` : '';
  const afterTableCompact = (bankName || accountName || accountNumber) ? `
    <div style="padding: 0 16px; margin-top: 6px;">
      <div class="section">Bank Details</div>
      ${bankName ? `<div class="text">Bank: ${escapeHtml(bankName)}</div>` : ''}
      ${accountName ? `<div class="text">Account Name: ${escapeHtml(accountName)}</div>` : ''}
      ${accountNumber ? `<div class="text">Account Number: ${escapeHtml(accountNumber)}</div>` : ''}
    </div>
  ` : '';

  const preTableSection = (
    template === 'bold'
      ? `
        <div class="row">
          <div style="flex:1; padding-right: 8px;">
            <div class="section" style="color:${theme.primary}">Invoice</div>
            <div class="meta">Number: ${escapeHtml(invoiceNumber)}</div>
            <div class="meta">Issuance: ${escapeHtml(issuanceDate)}</div>
            <div class="meta">Due: ${escapeHtml(dueDate)}</div>
            <div class="meta">Amount in words: ${escapeHtml(amountWords)}</div>
          </div>
          <div style="flex:1; display:flex; justify-content:flex-end;">
            <div class="box">
              <div class="section" style="color:${theme.primary}">BILL TO</div>
              <div class="text">${escapeHtml(customerName)}</div>
              <div class="text">${escapeHtml(customerAddress)}</div>
              <div class="text">${escapeHtml(customerContact)}</div>
            </div>
          </div>
        </div>
      `
      : `
        <div class="row">
          <div style="flex:1; padding-right: 8px;">
            <div class="section" style="color:${theme.primary}">BILL TO</div>
            <div class="text">${escapeHtml(customerName)}</div>
            <div class="text">${escapeHtml(customerAddress)}</div>
            <div class="text">${escapeHtml(customerContact)}</div>
            <div style="margin-top:8px">
              <div class="section" style="color:${theme.primary}">Invoice</div>
              <div class="meta">Number: ${escapeHtml(invoiceNumber)}</div>
              <div class="meta">Issuance: ${escapeHtml(issuanceDate)}</div>
              <div class="meta">Due: ${escapeHtml(dueDate)}</div>
              <div class="meta">Amount in words: ${escapeHtml(amountWords)}</div>
            </div>
          </div>
          <div style="flex:1; display:flex; justify-content:flex-end;">
            ${template==='modern' ? rightBoxModern : template==='minimal' ? rightBoxMinimal : rightBoxClassic}
          </div>
        </div>
      `
  );

  const tableHeaderHtml = (
    template === 'compact'
      ? `
        <div class="table-header" style="padding:6px 12px;">
          <div class="th" style="flex:2">Item</div>
          <div class="th" style="flex:.6; text-align:center">Qty</div>
          <div class="th" style="flex:1; text-align:right">Price</div>
          <div class="th" style="flex:1; text-align:right">Total</div>
        </div>
      `
      : `
        <div class="table-header">
          <div class="th" style="flex:2">Description</div>
          <div class="th" style="flex:.7; text-align:center">Qty</div>
          <div class="th" style="flex:1; text-align:right">Price</div>
          <div class="th" style="flex:1; text-align:right">Total</div>
        </div>
      `
  );

  const totalsHtml = `
    <div class="totals" style="${template==='compact' ? 'margin:8px 16px 0 auto; width:220px;' : ''}">
      <div class="total-row"><div class="meta">Subtotal</div><div class="meta">${currencySymbol}${subtotal.toFixed(2)}</div></div>
      <div class="total-row grand"><div class="title" style="font-size:16px">Total</div><div class="title" style="font-size:16px">${currencySymbol}${grand.toFixed(2)}</div></div>
    </div>
  `;

  const footerAfterTable = (
    template === 'minimal' ? afterTableMinimal :
    template === 'bold' ? afterTableBold :
    template === 'compact' ? afterTableCompact : ''
  );

  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color: ${text}; margin: 0; }
        .page { padding: 24px; }
        .card { border: 1px solid ${border}; border-radius: 12px; overflow: hidden; }
        .row { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 24px; }
        .company { font-size: 16px; font-weight: 600; }
        .title { font-size: 20px; font-weight: 700; color: ${theme.primary}; }
        .accent { height: 6px; background: ${theme.accent}; }
        .separator { height: 1px; background: ${border}; margin: 8px 24px 0 24px; }
        .box { min-width: 160px; border: 1px solid ${border}; border-radius: 8px; padding: 8px; }
        .section { font-size: 12px; color: ${textSecondary}; margin-bottom: 4px; }
        .text { font-size: 12px; color: ${text}; }
        .meta { font-size: 12px; color: ${textSecondary}; }
        .table-header { display: flex; padding: 8px 16px; border-top: 1px solid ${border}; border-bottom: 1px solid ${border}; margin-top: 12px; }
        .th { font-size: 12px; font-weight: 600; color: ${text}; }
        table { width: 100%; border-collapse: collapse; }
        tr { border-bottom: 1px solid ${border}; }
        .td { font-size: 12px; padding: 8px 16px; }
        .desc { width: 50%; }
        .qty { width: 12%; text-align: center; }
        .price, .total { width: 19%; text-align: right; }
        .totals { width: 260px; margin: 12px 24px 0 auto; }
        .total-row { display: flex; justify-content: space-between; margin-bottom: 6px; }
        .grand { border-top: 1px solid ${border}; padding-top: 6px; margin-top: 6px; }
        .hint { font-size: 12px; color: ${textSecondary}; text-align: center; margin: 12px 0 16px; }
        .logo { width: 64px; height: 64px; object-fit: contain; border-radius: 8px; margin-bottom: 6px; }
        .signature { width: 140px; height: 70px; object-fit: contain; }

        /* Template variants */
        body.${tplClass} .row.header { ${template === 'modern' ? `background:${theme.primary}; color:${theme.headerText};` : ''} }
        body.${tplClass} .row.header .title { ${template === 'modern' ? `color:${theme.headerText}` : ''} }
        body.${tplClass} .row.header .company { ${template === 'modern' ? `color:${theme.headerText}` : ''} }
        body.${tplClass} .table-header { ${template === 'modern' ? `background:${theme.accent}; border-color:${theme.accent};` : template === 'bold' ? `background:${theme.primary}; border-color:${theme.primary};` : ''} }
        body.${tplClass} .th { ${template === 'modern' || template === 'bold' ? `color:${theme.headerText}` : ''} }
        body.${tplClass} .td { ${template === 'compact' ? 'padding:6px 12px; font-size:12px;' : ''} }
        body.${tplClass} .row { ${template === 'compact' ? 'padding:12px 16px;' : ''} }
        body.${tplClass} .accent { ${template === 'compact' ? 'height:4px;' : template === 'modern' ? 'height:8px;' : ''} }
        body.${tplClass} .box { ${template === 'minimal' ? 'border:none; background:#fafafa;' : ''} }
      </style>
    </head>
    <body class="${tplClass}">
      <div class="page">
        <div class="card">
          ${headerHtml}
          ${preTableSection}
          ${tableHeaderHtml}
          <table>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
          ${totalsHtml}
          ${signature ? `
            <div style="padding: 0 24px; margin-top: 8px;">
              <div class="meta">Authorized Signature</div>
              <img class="signature" src="${signature}" />
            </div>
          ` : ''}
          ${terms ? `
            <div style="padding: 0 ${template==='compact' ? '16px' : '24px'}; margin-top: 8px;">
              <div class="section" style="color:${theme.primary}">Terms and Conditions</div>
              <div class="text">${escapeHtml(terms)}</div>
            </div>
          ` : ''}
          ${footerAfterTable}
          <div class="hint">This invoice is generated electronically by ${escapeHtml(name)} and any alteration renders it invalid — Printed on ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    </body>
  </html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function amountToWords(amount) {
  const n = Math.abs(Number(amount || 0));
  const whole = Math.floor(n);
  const cents = Math.round((n - whole) * 100);
  const words = numberToWords(whole);
  const centsStr = String(cents).padStart(2, '0');
  if (whole === 0 && cents === 0) return 'Zero and 00/100';
  return `${words} and ${centsStr}/100`;
}

// Map currency symbol to common currency name; default to symbol if unknown
function currencyNameForSymbol(sym) {
  const s = String(sym || '').trim();
  switch (s) {
    case '₦': return 'Naira';
    case '$': return 'Dollar';
    case '€': return 'Euro';
    case '£': return 'Pounds';
    case '₵': return 'Cedis';
    case 'KSh': return 'Shillings';
    default: return s || 'Currency';
  }
}

// Format amount in words as "<Words> <Currency> Only" (no minor units)
function amountToWordsWithCurrencyNameOnly(amount, currencySymbol) {
  const n = Math.abs(Number(amount || 0));
  const whole = Math.floor(n);
  const words = numberToWords(whole);
  const cname = currencyNameForSymbol(currencySymbol);
  return `${words} ${cname} Only`;
}

function numberToWords(num) {
  num = Math.floor(Math.abs(Number(num || 0)));
  if (num === 0) return 'Zero';
  const belowTwenty = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
    'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
  ];
  const tensWords = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const scales = ['','Thousand','Million','Billion','Trillion'];

  const toWordsBelow1000 = (n) => {
    let res = '';
    if (n >= 100) {
      res += belowTwenty[Math.floor(n/100)] + ' Hundred';
      n = n % 100;
      if (n) res += ' ';
    }
    if (n >= 20) {
      res += tensWords[Math.floor(n/10)];
      n = n % 10;
      if (n) res += '-' + belowTwenty[n];
    } else if (n > 0) {
      res += belowTwenty[n];
    }
    return res;
  };

  let words = '';
  let scaleIdx = 0;
  while (num > 0 && scaleIdx < scales.length) {
    const chunk = num % 1000;
    if (chunk) {
      const prefix = toWordsBelow1000(chunk);
      const scale = scales[scaleIdx];
      words = prefix + (scale ? ' ' + scale : '') + (words ? ' ' + words : '');
    }
    num = Math.floor(num / 1000);
    scaleIdx++;
  }
  return words || 'Zero';
}

function getThemeFor(tpl, brand) {
  const shade = (hex, percent) => {
    try {
      const h = hex.replace('#','');
      const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
      let r = (bigint >> 16) & 255;
      let g = (bigint >> 8) & 255;
      let b = bigint & 255;
      const adjust = (v) => Math.min(255, Math.max(0, Math.round(v + (percent/100)*255)));
      r = adjust(r); g = adjust(g); b = adjust(b);
      return `#${(1<<24 | (r<<16) | (g<<8) | b).toString(16).slice(1)}`;
    } catch (_) { return hex; }
  };
  switch (tpl) {
    case 'modern':
      return { primary: brand, accent: shade(brand, -10), headerBg: shade(brand, -20), headerText: '#ffffff' };
    case 'minimal':
      return { primary: brand, accent: '#efefef', headerBg: '#f5f5f5', headerText: '#111111' };
    case 'bold':
      return { primary: brand, accent: shade(brand, -30), headerBg: brand, headerText: '#ffffff' };
    case 'compact':
      return { primary: brand, accent: shade(brand, 50), headerBg: shade(brand, -15), headerText: '#ffffff' };
    case 'classic':
    default:
      return { primary: brand, accent: shade(brand, -10), headerBg: '#ffffff', headerText: '#111111' };
  }
}