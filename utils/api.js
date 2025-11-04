import { Config } from '../constants/Config';

export function getApiBaseUrl() {
  return Config.API_BASE_URL;
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

export async function loginCompany(companyId) {
  const res = await fetch(`${Config.API_BASE_URL}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companyId }),
  });
  return res.json();
}

export async function fetchCompany(companyId) {
  const res = await fetch(`${Config.API_BASE_URL}/api/company/${companyId}`);
  return res.json();
}

export async function updateCompany(payload) {
  // Backward-compatible: allow updateCompany(companyId, payload)
  let bodyPayload = payload;
  if (typeof payload === 'string') {
    bodyPayload = { companyId: payload };
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