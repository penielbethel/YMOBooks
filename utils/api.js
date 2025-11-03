import { Config } from '../constants/Config';

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