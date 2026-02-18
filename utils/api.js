import { Config } from '../constants/Config';

export function getApiBaseUrl() {
  return Config.API_BASE_URL;
}

export function resolveAssetUri(uri) {
  if (!uri || typeof uri !== 'string') return null;
  if (uri.startsWith('data:') || uri.startsWith('file://')) return uri;
  if (uri.startsWith('/')) return `${Config.API_BASE_URL}${uri}`;
  return uri;
}

export async function pingBackend() {
  const url = `${Config.API_BASE_URL}/api/health`;
  try {
    const res = await fetch(url);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data, url };
  } catch (err) {
    return { ok: false, error: String(err), url };
  }
}

export async function registerCompany(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/register-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function loginCompany(companyId, businessType) {
  const res = await fetch(`${Config.API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, businessType }),
  });
  return res.json();
}

export async function fetchCompany(companyId) {
  const res = await fetch(`${Config.API_BASE_URL}/api/company/${encodeURIComponent(companyId)}`);
  return res.json();
}

export async function updateCompany(payload) {
  // Backward-compatible: allow updateCompany(companyId, payload)
  let bodyPayload = payload;
  if (typeof payload === 'string') {
    const data = arguments.length > 1 ? arguments[1] : {};
    bodyPayload = { ...data, companyId: payload };
  } else if (payload && typeof payload === 'object' && !payload.companyId && arguments.length > 1) {
    const companyId = arguments[0];
    const data = arguments[1];
    bodyPayload = { ...data, companyId };
  }

  const res = await fetch(`${Config.API_BASE_URL}/api/update-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });
  return res.json();
}

// Save signature separately if needed
export async function saveSignature(companyId, signatureDataUrl) {
  const payload = { companyId, signature: signatureDataUrl };
  const res = await fetch(`${Config.API_BASE_URL}/api/update-company`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function createInvoice(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/invoice/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data?.pdfPath) {
    return { ...data, pdfUrl: `${Config.API_BASE_URL}${data.pdfPath}` };
  }
  return data;
}

export async function createReceipt(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/receipt/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (data?.pdfPath) {
    return { ...data, pdfUrl: `${Config.API_BASE_URL}${data.pdfPath}` };
  }
  return data;
}

export async function fetchInvoices(companyId, months = 6) {
  const url = new URL(`${Config.API_BASE_URL}/api/invoices`);
  url.searchParams.set('companyId', companyId);
  url.searchParams.set('months', String(months));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data?.invoices) {
    // add absolute pdfUrl
    data.invoices = data.invoices.map((inv) => ({
      ...inv,
      pdfUrl: inv.pdfPath ? `${Config.API_BASE_URL}${inv.pdfPath}` : undefined,
    }));
  }
  return data;
}

export async function fetchReceipts(companyId, months = 6) {
  const url = new URL(`${Config.API_BASE_URL}/api/receipts`);
  url.searchParams.set('companyId', companyId);
  url.searchParams.set('months', String(months));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data?.receipts) {
    data.receipts = data.receipts.map((r) => ({
      ...r,
      pdfUrl: r.pdfPath ? `${Config.API_BASE_URL}${r.pdfPath}` : undefined,
    }));
  }
  return data;
}

export async function deleteReceipt(companyId, receiptNumber) {
  const url = new URL(`${Config.API_BASE_URL}/api/receipts/${encodeURIComponent(receiptNumber)}`);
  url.searchParams.set('companyId', companyId);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

export async function deleteReceiptByInvoice(companyId, invoiceNumber) {
  const url = new URL(`${Config.API_BASE_URL}/api/receipts/by-invoice/${encodeURIComponent(invoiceNumber)}`);
  url.searchParams.set('companyId', companyId);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

// Expenses and Finance Summary
export async function createExpense(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/expenses/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchExpenses(companyId, month) {
  const url = new URL(`${Config.API_BASE_URL}/api/expenses`);
  url.searchParams.set('companyId', companyId);
  if (month) url.searchParams.set('month', month);
  const res = await fetch(url.toString());
  return res.json();
}

export async function deleteExpenses(companyId, month, category) {
  const url = new URL(`${Config.API_BASE_URL}/api/expenses`);
  url.searchParams.set('companyId', companyId);
  if (month) url.searchParams.set('month', month);
  if (category) url.searchParams.set('category', category);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

export async function fetchFinanceSummary(companyId, month) {
  const url = new URL(`${Config.API_BASE_URL}/api/finance/summary`);
  url.searchParams.set('companyId', companyId);
  if (month) url.searchParams.set('month', month);
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchRevenueDaily(companyId, month) {
  const url = new URL(`${Config.API_BASE_URL}/api/finance/revenue-daily`);
  url.searchParams.set('companyId', companyId);
  if (month) url.searchParams.set('month', month);
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchExpensesDaily(companyId, month, category = 'expense') {
  const url = new URL(`${Config.API_BASE_URL}/api/finance/expenses-daily`);
  url.searchParams.set('companyId', companyId);
  if (month) url.searchParams.set('month', month);
  if (category) url.searchParams.set('category', category);
  const res = await fetch(url.toString());
  return res.json();
}

export async function saveExpenseDaily(companyId, month, day, amount, category = 'expense') {
  const res = await fetch(`${Config.API_BASE_URL}/api/finance/expenses-daily`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId, month, day, amount, category }),
  });
  return res.json();
}

export async function deleteInvoice(companyId, invoiceNumber) {
  const url = new URL(`${Config.API_BASE_URL}/api/invoices/${encodeURIComponent(invoiceNumber)}`);
  url.searchParams.set('companyId', companyId);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

// Admin APIs
export async function adminFetchCompanies(adminId = 'pbmsrvr') {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/companies`);
  url.searchParams.set('adminId', adminId);
  const res = await fetch(url.toString());
  return res.json();
}

export async function adminDeleteCompany(companyId, adminId = 'pbmsrvr') {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/company/${companyId}`);
  url.searchParams.set('adminId', adminId);
  const res = await fetch(url.toString(), { method: 'DELETE' });
  return res.json();
}

export async function adminFetchStats(adminId = 'pbmsrvr') {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/stats`);
  url.searchParams.set('adminId', adminId);
  const res = await fetch(url.toString());
  return res.json();
}

export async function adminMigrateFilesToDb(adminId = 'pbmsrvr') {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/migrate-files-to-db`);
  url.searchParams.set('adminId', adminId);
  const res = await fetch(url.toString(), { method: 'POST' });
  return res.json();
}

export async function adminScanDuplicates(adminId = 'pbmsrvr') {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/duplicates`);
  url.searchParams.set('adminId', adminId);
  const res = await fetch(url.toString());
  return res.json();
}

export async function adminBackfillCurrency(adminId = 'pbmsrvr', companyId) {
  const url = new URL(`${Config.API_BASE_URL}/api/admin/backfill-currency`);
  url.searchParams.set('adminId', adminId);
  const payload = companyId ? { companyId } : {};
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// --- Stock Management APIs ---
export async function createStock(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/stock/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchStock(companyId, type) {
  const url = new URL(`${Config.API_BASE_URL}/api/stock`);
  url.searchParams.set('companyId', companyId);
  if (type) url.searchParams.set('type', type);
  const res = await fetch(url.toString());
  return res.json();
}

export async function updateStock(id, updates) {
  const res = await fetch(`${Config.API_BASE_URL}/api/stock/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, updates }),
  });
  return res.json();
}

export async function deleteStock(id) {
  const res = await fetch(`${Config.API_BASE_URL}/api/stock/${id}`, {
    method: 'DELETE',
  });
  return res.json();
}

// --- Manufacturing: Production APIs ---
export async function recordProduction(payload) {
  const res = await fetch(`${Config.API_BASE_URL}/api/production/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function fetchProductionHistory(companyId) {
  const url = new URL(`${Config.API_BASE_URL}/api/production/history`);
  url.searchParams.set('companyId', companyId);
  const res = await fetch(url.toString());
  return res.json();
}

export async function fetchBalanceSheet(companyId) {
  const url = new URL(`${Config.API_BASE_URL}/api/finance/balance-sheet`);
  url.searchParams.set('companyId', companyId);
  const res = await fetch(url.toString());
  return res.json();
}