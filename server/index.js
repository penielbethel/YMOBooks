const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
let sharp = null; // lazy-loaded to avoid boot issues if optional dep missing

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI; // Set in environment. If unset, server uses file fallback.
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '8mb' }));
// Serve static public assets (landing page)
app.use(express.static(PUBLIC_DIR));
// Serve shared assets (images) from project root /assets so public pages can reference /assets/*
app.use('/assets', express.static(path.join(__dirname, '..', 'assets')));
// Serve generated files (PDFs) — default to a writable location on Vercel
const WRITABLE_ROOT = process.env.GENERATED_ROOT || (process.env.VERCEL ? '/tmp' : __dirname);
let GENERATED_DIR = path.join(WRITABLE_ROOT, 'generated');
let INVOICES_DIR = path.join(GENERATED_DIR, 'invoices');
let RECEIPTS_DIR = path.join(GENERATED_DIR, 'receipts');
try {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
} catch (e) {
  console.warn('Failed to create generated directories at', GENERATED_DIR, '→ falling back to /tmp:', e.message);
  GENERATED_DIR = path.join('/tmp', 'generated');
  INVOICES_DIR = path.join(GENERATED_DIR, 'invoices');
  RECEIPTS_DIR = path.join(GENERATED_DIR, 'receipts');
  try {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  } catch (e2) {
    console.error('Failed to initialize writable generated directories:', e2.message);
  }
}
app.use('/files', express.static(GENERATED_DIR));

// Local file fallback store for companies when Mongo is unavailable
const COMPANIES_FILE = process.env.COMPANIES_FILE || path.join(WRITABLE_ROOT, 'companies.json');
function readCompaniesFile() {
  try {
    if (!fs.existsSync(COMPANIES_FILE)) return [];
    const raw = fs.readFileSync(COMPANIES_FILE, 'utf-8');
    const data = JSON.parse(raw || '[]');
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    console.warn('Failed to read companies.json:', e.message);
    return [];
  }
}
function writeCompaniesFile(companies) {
  try {
    fs.writeFileSync(COMPANIES_FILE, JSON.stringify(companies, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to write companies.json:', e.message);
  }
}
function upsertCompanyFile(entry) {
  const companies = readCompaniesFile();
  const idx = companies.findIndex((c) => c.companyId === entry.companyId);
  if (idx >= 0) companies[idx] = { ...companies[idx], ...entry };
  else companies.push(entry);
  writeCompaniesFile(companies);
  return entry;
}
function findCompanyFile(companyId) {
  const companies = readCompaniesFile();
  return companies.find((c) => c.companyId === companyId);
}

// Local file fallback store for expenses when Mongo is unavailable
const EXPENSES_FILE = process.env.EXPENSES_FILE || path.join(WRITABLE_ROOT, 'expenses.json');
function readExpensesFile() {
  try {
    if (!fs.existsSync(EXPENSES_FILE)) return [];
    const raw = fs.readFileSync(EXPENSES_FILE, 'utf-8');
    const data = JSON.parse(raw || '[]');
    if (Array.isArray(data)) return data;
    return [];
  } catch (e) {
    console.warn('Failed to read expenses.json:', e.message);
    return [];
  }
}
function writeExpensesFile(expenses) {
  try {
    fs.writeFileSync(EXPENSES_FILE, JSON.stringify(expenses, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Failed to write expenses.json:', e.message);
  }
}
function addExpenseFile(expense) {
  const list = readExpensesFile();
  const entry = { ...expense, _id: expense._id || `EXP-${Date.now()}`, createdAt: expense.createdAt || new Date().toISOString() };
  list.push(entry);
  writeExpensesFile(list);
  return entry;
}
function queryExpensesFile(query = {}) {
  const list = readExpensesFile();
  return list.filter((e) => {
    if (query.companyId && e.companyId !== String(query.companyId)) return false;
    if (query.month && e.month !== String(query.month)) return false;
    if (query.category && e.category !== String(query.category)) return false;
    if (query.day != null && e.day !== Number(query.day)) return false;
    return true;
  });
}
function deleteExpensesFile(query = {}) {
  const list = readExpensesFile();
  const keep = [];
  const remove = [];
  for (const e of list) {
    const match =
      (!query.companyId || e.companyId === String(query.companyId)) &&
      (!query.month || e.month === String(query.month)) &&
      (!query.category || e.category === String(query.category)) &&
      (query.day == null || e.day === Number(query.day));
    if (match) remove.push(e);
    else keep.push(e);
  }
  writeExpensesFile(keep);
  return remove.length;
}

// Image optimization helpers (logos/signatures)
async function ensureSharp() {
  if (!sharp) {
    try {
      // eslint-disable-next-line global-require
      sharp = require('sharp');
    } catch (e) {
      console.warn('sharp is not installed; skipping image optimization:', e.message);
      sharp = null;
    }
  }
  return sharp;
}

function parseDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:([^;,]+);base64,(.*)$/);
  if (!m) return null;
  const mime = m[1];
  const b64 = m[2];
  try {
    const buf = Buffer.from(b64, 'base64');
    return { mime, buffer: buf };
  } catch (_e) {
    return null;
  }
}

async function optimizeImageDataUrl(dataUrl, kind = 'logo') {
  try {
    const lib = await ensureSharp();
    if (!lib) return dataUrl; // skip if sharp missing
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;
    const max = kind === 'signature' ? { width: 600, height: 220 } : { width: 512, height: 512 };
    let pipeline = lib(parsed.buffer).rotate();
    pipeline = pipeline.resize({ ...max, fit: 'inside', withoutEnlargement: true });
    // Use PNG to preserve transparency and ensure pdfkit compatibility
    const out = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    const outDataUrl = `data:image/png;base64,${out.toString('base64')}`;
    // Only return optimized if significantly smaller or if original was not png
    if (out.length < parsed.buffer.length * 0.98 || !/^data:image\/png/i.test(dataUrl)) {
      return outDataUrl;
    }
    return dataUrl;
  } catch (e) {
    console.warn('Image optimization failed; using original:', e.message);
    return dataUrl;
  }
}

// Mongo connection (optional)
let DB_CONNECTED = false;
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: 8000,
      // Use 'test' by default to align with existing Atlas DB
      dbName: process.env.MONGO_DB_NAME || 'test',
    })
    .then(() => {
      DB_CONNECTED = true;
      console.log('Connected to MongoDB');
    })
    .catch((err) => {
      DB_CONNECTED = false;
      console.error('MongoDB connection error:', err.message);
    });
  mongoose.connection.on('connected', () => {
    DB_CONNECTED = true;
    console.log('MongoDB connection established');
  });
  mongoose.connection.on('disconnected', () => {
    DB_CONNECTED = false;
    console.warn('MongoDB disconnected; file fallback may be used');
  });
} else {
  console.warn('MONGO_URI not set. Running with file-based fallback storage.');
}

// Models
// Currency catalog (for clarity and consistency)
const CurrencySchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true }, // e.g., NGN, USD
    name: { type: String, required: true }, // e.g., Naira, US Dollar
    symbol: { type: String, required: true }, // e.g., ₦, $
  },
  { timestamps: true }
);
const Currency = mongoose.model('Currency', CurrencySchema);

const CompanySchema = new mongoose.Schema(
  {
    companyId: { type: String, unique: true, index: true },
    name: { type: String, required: true, unique: true, sparse: true },
    address: { type: String },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    logo: { type: String }, // base64 or URL
    signature: { type: String }, // base64 or URL (optional)
    brandColor: { type: String },
    country: { type: String },
    currencySymbol: { type: String, default: '$' },
    currencyCode: { type: String }, // e.g., NGN, USD
    termsAndConditions: { type: String },
    // Bank details
    bankName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String, unique: true, sparse: true },
    // Document templates
    invoiceTemplate: { type: String, default: 'classic' },
    receiptTemplate: { type: String, default: 'classic' },
    // Business Type Classification
    businessType: {
      type: String,
      enum: ['printing_press', 'manufacturing', 'general_merchandise'],
      default: 'general_merchandise'
    },
  },
  { timestamps: true }
);

const Company = mongoose.model('Company', CompanySchema);

// Invoice model for history
const InvoiceSchema = new mongoose.Schema(
  {
    companyId: { type: String, index: true, required: true },
    invoiceNumber: { type: String, index: true, required: true },
    invoiceDate: { type: Date },
    dueDate: { type: Date },
    // Store which template was used when generating this invoice (classic, bold, modern, compact, minimal)
    invoiceTemplate: { type: String },
    currencySymbol: { type: String },
    currencyCode: { type: String }, // e.g., NGN, USD
    status: { type: String, enum: ['paid', 'unpaid'], default: 'unpaid' },
    paidAt: { type: Date },
    customer: {
      name: String,
      address: String,
      contact: String,
    },
    items: [
      {
        description: String,
        qty: Number,
        price: Number,
        total: Number,
      },
    ],
    grandTotal: { type: Number },
    pdfPath: { type: String },
  },
  { timestamps: true }
);
const Invoice = mongoose.model('Invoice', InvoiceSchema);

// Receipt model for history
const ReceiptSchema = new mongoose.Schema(
  {
    companyId: { type: String, index: true, required: true },
    receiptNumber: { type: String, index: true, required: true },
    invoiceNumber: { type: String },
    receiptDate: { type: Date },
    currencySymbol: { type: String },
    currencyCode: { type: String },
    customer: {
      name: String,
      address: String,
      contact: String,
    },
    amountPaid: { type: Number },
    pdfPath: { type: String },
  },
  { timestamps: true }
);
const Receipt = mongoose.model('Receipt', ReceiptSchema);

// Expense model for monthly P&L
const ExpenseSchema = new mongoose.Schema(
  {
    companyId: { type: String, index: true, required: true },
    month: { type: String, index: true, required: true }, // YYYY-MM
    category: { type: String, enum: ['production', 'expense'], required: true },
    amount: { type: Number, required: true },
    currencySymbol: { type: String },
    currencyCode: { type: String },
    description: { type: String },
    day: { type: Number }, // optional: day of month for daily tracking (1-31)
  },
  { timestamps: true }
);
const Expense = mongoose.model('Expense', ExpenseSchema);

// Helpers
async function generateCompanyId(name, businessType) {
  // Use first 3 letters of name, fallback to 'CPM' if name is short/missing
  const namePrefix = (name && name.length >= 3) ? name.substring(0, 3).toUpperCase() : 'CPM';
  const cleanNamePrefix = namePrefix.replace(/[^A-Z0-9]/g, 'X'); // safety

  let typeSuffix = 'GM'; // General Merchandise
  if (businessType === 'printing_press') typeSuffix = 'PP';
  else if (businessType === 'manufacturing') typeSuffix = 'MC';

  const prefix = `${cleanNamePrefix}/${typeSuffix}`;

  let candidate;
  let existsDb = null;
  let existsFile = null;
  do {
    const suffix = Math.floor(100000 + Math.random() * 900000).toString().slice(0, 5);
    candidate = `${prefix}-${suffix}`;
    // Prefer DB check when connected; otherwise rely on file fallback to avoid timeouts
    existsDb = null;
    try {
      if (mongoose.connection && mongoose.connection.readyState === 1) {
        existsDb = await Company.findOne({ companyId: candidate }).lean();
      }
    } catch (_dbErr) {
      // Ignore DB errors during ID generation
      existsDb = null;
    }
    existsFile = findCompanyFile(candidate);
  } while (existsDb || existsFile);
  return candidate;
}

// Detect duplicates for given fields, optionally excluding a companyId
async function detectConflicts(uniqueFields = {}, excludeCompanyId = null) {
  const conflicts = [];
  const entries = Object.entries(uniqueFields).filter(([_, v]) => v);
  if (entries.length === 0) return conflicts;
  try {
    if (DB_CONNECTED) {
      const or = entries.map(([k, v]) => ({ [k]: v }));
      const query = excludeCompanyId ? { $or: or, companyId: { $ne: excludeCompanyId } } : { $or: or };
      const dup = await Company.findOne(query).lean();
      if (dup) {
        entries.forEach(([k, v]) => {
          if (dup[k] && dup[k] === v) conflicts.push(k);
        });
      }
    } else {
      const files = readCompaniesFile();
      const dupFile = files.find((c) => (!excludeCompanyId || c.companyId !== excludeCompanyId) && entries.some(([k, v]) => c[k] && c[k] === v));
      if (dupFile) {
        entries.forEach(([k, v]) => {
          if (dupFile[k] && dupFile[k] === v) conflicts.push(k);
        });
      }
    }
  } catch (e) {
    console.warn('Conflict detection failed:', e.message);
  }
  // Deduplicate
  return Array.from(new Set(conflicts));
}

// Color helpers and image utils
function clamp(n, min, max) {
  return Math.min(Math.max(n, min), max);
}
function shadeColor(hex, percent) {
  try {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    let r = (bigint >> 16) & 255;
    let g = (bigint >> 8) & 255;
    let b = bigint & 255;
    r = clamp(Math.round(r + (percent / 100) * 255), 0, 255);
    g = clamp(Math.round(g + (percent / 100) * 255), 0, 255);
    b = clamp(Math.round(b + (percent / 100) * 255), 0, 255);
    return `#${(1 << 24 | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  } catch (_) {
    return hex;
  }
}
function dataUrlToBuffer(dataUrl) {
  try {
    if (typeof dataUrl !== 'string') return null;
    if (!dataUrl.startsWith('data:image')) return null;
    const base64 = dataUrl.split(',')[1];
    return Buffer.from(base64, 'base64');
  } catch (_) {
    return null;
  }
}
function numberToWords(num) {
  const ones = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function chunkToWords(n) {
    let str = '';
    if (n >= 100) {
      str += `${ones[Math.floor(n / 100)]} Hundred`;
      n = n % 100;
      if (n) str += ' ';
    }
    if (n >= 20) {
      str += tens[Math.floor(n / 10)];
      n = n % 10;
      if (n) str += `-${ones[n]}`;
    } else if (n >= 10) {
      str += teens[n - 10];
    } else if (n > 0) {
      str += ones[n];
    } else if (!str) {
      str = 'Zero';
    }
    return str;
  }
  if (isNaN(num)) return '';
  const whole = Math.floor(Math.abs(num));
  const decimals = Math.round((Math.abs(num) - whole) * 100);
  const groups = [
    { value: 1_000_000_000, label: 'Billion' },
    { value: 1_000_000, label: 'Million' },
    { value: 1_000, label: 'Thousand' },
  ];
  let remaining = whole;
  let parts = [];
  for (const g of groups) {
    if (remaining >= g.value) {
      const count = Math.floor(remaining / g.value);
      parts.push(`${chunkToWords(count)} ${g.label}`);
      remaining = remaining % g.value;
    }
  }
  if (remaining > 0 || parts.length === 0) {
    parts.push(chunkToWords(remaining));
  }
  const words = parts.join(' ');
  return `${words}${decimals ? ` and ${decimals}/100` : ''}`;
}

// Currency helpers
function mapSymbolToCode(sym) {
  const s = String(sym || '').trim();
  return s === '₦' ? 'NGN'
    : s === '$' ? 'USD'
      : s === '€' ? 'EUR'
        : s === '£' ? 'GBP'
          : s === '₵' ? 'GHS'
            : s === 'KSh' ? 'KES'
              : s === '¥' ? 'JPY'
                : s === '₹' ? 'INR'
                  : undefined;
}

// Helper: currency labels for amount-in-words
function currencyLabels(symbol) {
  const s = (symbol || '').trim();
  switch (s) {
    case '₦':
      return { currencyName: 'Naira', minorName: 'kobo' };
    case '£':
      return { currencyName: 'Pounds', minorName: 'pence' };
    case '€':
      return { currencyName: 'Euros', minorName: 'cents' };
    case '₵':
      return { currencyName: 'Cedis', minorName: 'pesewas' };
    case 'KSh':
      return { currencyName: 'Shillings', minorName: 'cents' };
    case '$':
    default:
      return { currencyName: 'Dollars', minorName: 'cents' };
  }
}

// Format amount in words with currency name and minor units, mirroring client preview
function amountInWordsWithCurrency(amount, symbol) {
  if (isNaN(amount)) return '';
  const whole = Math.floor(Math.abs(Number(amount)));
  const baseWords = numberToWords(whole).replace(/\s+and\s+\d+\/100$/, '');
  const { currencyName } = currencyLabels(symbol);
  return `${baseWords} ${currencyName} Only`;
}

// Routes
app.post('/api/register-company', async (req, res) => {
  try {
    const { name, address, email, phone, brandColor, currencySymbol, bankName, accountName, accountNumber, bankAccountName, bankAccountNumber, invoiceTemplate, receiptTemplate, termsAndConditions, businessType } = req.body;
    // Ensure currencyCode is defined; fall back from symbol when not provided
    const currencyCodeInput = req.body.currencyCode;
    const currencyCode = (typeof currencyCodeInput === 'string' && currencyCodeInput.trim())
      ? currencyCodeInput.trim()
      : mapSymbolToCode(currencySymbol);
    let { logo, signature } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Company name is required' });

    // Duplicate checks (prefer DB when connected)
    const uniqueFields = {};
    if (name) uniqueFields.name = name;
    if (email) uniqueFields.email = email;
    if (phone) uniqueFields.phone = phone;
    const acctNum = accountNumber || bankAccountNumber;
    if (acctNum) uniqueFields.accountNumber = acctNum;
    if (Object.keys(uniqueFields).length > 0) {
      const conflicts = await detectConflicts(uniqueFields);
      if (conflicts.length > 0) {
        return res.status(409).json({ success: false, message: 'Duplicate company details detected. Name, email, phone, and account number must be unique.', conflicts });
      }
    }

    const companyId = await generateCompanyId(name, businessType);
    // Optimize images when provided as data URLs
    if (typeof logo === 'string' && logo.startsWith('data:')) {
      logo = await optimizeImageDataUrl(logo, 'logo');
    }
    if (typeof signature === 'string' && signature.startsWith('data:')) {
      signature = await optimizeImageDataUrl(signature, 'signature');
    }

    const entry = {
      companyId,
      name,
      address,
      email,
      phone,
      logo,
      signature,
      brandColor,
      currencySymbol,
      currencyCode,
      termsAndConditions,
      bankName,
      accountName: accountName || bankAccountName,
      accountNumber: accountNumber || bankAccountNumber,
      invoiceTemplate: typeof invoiceTemplate === 'string' ? invoiceTemplate : 'classic',
      receiptTemplate: typeof receiptTemplate === 'string' ? receiptTemplate : 'classic',
      businessType: businessType || 'general_merchandise',
    };

    // Try DB, but don't fail registration if DB is down
    try {
      const doc = new Company(entry);
      await doc.save();
    } catch (dbErr) {
      console.warn('Register DB save failed, using file fallback:', dbErr.message);
    }

    upsertCompanyFile(entry);

    return res.json({ success: true, companyId, message: 'Registration successful. Keep and save your Company ID.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Update company details (including bank info)
// Update company details (including bank info) - REBUILT
app.post('/api/update-company', async (req, res) => {
  try {
    const { companyId, ...updates } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });

    console.log('Updating company:', companyId);

    // Find existing company (DB or File)
    let companyDoc = null;
    try { companyDoc = await Company.findOne({ companyId }); } catch (_) { }

    let fileCompany = findCompanyFile(companyId);
    if (!companyDoc && !fileCompany) return res.status(404).json({ success: false, message: 'Company not found' });

    // Prepare pure data object
    // If we have a generic object from file, use it. If DB doc, convert to object.
    const currentData = companyDoc ? companyDoc.toObject() : (fileCompany || {});

    // Allowed fields to update directly
    const allowedFields = [
      'name', 'address', 'email', 'phone', 'brandColor', 'country',
      'currencySymbol', 'currencyCode', 'bankName', 'accountName',
      'accountNumber', 'bankAccountName', 'bankAccountNumber',
      'invoiceTemplate', 'receiptTemplate', 'termsAndConditions', 'businessType'
    ];

    // Apply text updates
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        currentData[field] = updates[field];
      }
    });

    // Handle Images - specific logic for explicit changes
    if (updates.logo && typeof updates.logo === 'string' && updates.logo.startsWith('data:')) {
      currentData.logo = await optimizeImageDataUrl(updates.logo, 'logo');
    } else if (updates.logo === null) {
      currentData.logo = null;
    }
    // If updates.logo is a URL or unchanged string, we leave currentData.logo as is

    if (updates.signature && typeof updates.signature === 'string' && updates.signature.startsWith('data:')) {
      currentData.signature = await optimizeImageDataUrl(updates.signature, 'signature');
    } else if (updates.signature === null) {
      currentData.signature = null;
    }

    // Ensure we don't try to update immutable fields
    delete currentData._id;
    delete currentData.__v;

    // Save to DB
    try {
      const updatedDoc = await Company.findOneAndUpdate(
        { companyId },
        { $set: currentData },
        { new: true, upsert: true }
      ).lean();
      // Update our local reference to what DB has
      Object.assign(currentData, updatedDoc);
      delete currentData._id; // clean again just in case
      delete currentData.__v;
    } catch (dbErr) {
      console.warn('DB Update failed:', dbErr.message);
    }

    // Save to File
    upsertCompanyFile(currentData);

    return res.json({ success: true, company: currentData, message: 'Profile updated successfully' });

  } catch (err) {
    console.error('Update company error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating company' });
  }
});

// Helper: draw invoice by template style
function drawInvoiceByTemplate(doc, company, invNo, invoiceDate, dueDate, customer, items) {
  const template = (company.invoiceTemplate || 'classic').toLowerCase();
  const theme = {
    classic: { primary: '#000000', accent: '#333333', tableHeader: '#eeeeee' },
    modern: { primary: '#1f6feb', accent: '#0ea5e9', tableHeader: '#e0f2fe' },
    minimal: { primary: '#111827', accent: '#6b7280', tableHeader: '#f3f4f6' },
    bold: { primary: '#d97706', accent: '#b45309', tableHeader: '#fef3c7' },
    compact: { primary: '#10b981', accent: '#047857', tableHeader: '#d1fae5' },
  }[template] || { primary: '#000000', accent: '#333333', tableHeader: '#eeeeee' };

  // Override with brand color if provided
  if (company.brandColor && /^#?[0-9a-fA-F]{3,6}$/.test(company.brandColor)) {
    const base = company.brandColor.startsWith('#') ? company.brandColor : `#${company.brandColor}`;
    theme.primary = base;
    theme.accent = shadeColor(base, -20);
    theme.tableHeader = shadeColor(base, 70);
  }

  const curr = (company.currencySymbol && String(company.currencySymbol).trim()) || '₦';

  const pageLeft = doc.page.margins.left;
  const pageRight = doc.page.width - doc.page.margins.right;
  const pageWidth = pageRight - pageLeft;

  // Header layout — match client Classic preview
  if (template === 'classic') {
    // Header row: company name left, INVOICE right
    doc.fontSize(20).fillColor('#000').text((company.name || company.companyName || 'Company'), pageLeft, doc.page.margins.top);
    doc.fontSize(26).fillColor(theme.primary).text('INVOICE', pageLeft, doc.page.margins.top, { align: 'right', width: pageWidth });
    // Accent bar
    doc.save();
    doc.rect(pageLeft, doc.page.margins.top + 24, pageWidth, 6).fill(theme.accent);
    doc.restore();
    // Separator
    doc.moveTo(pageLeft, doc.page.margins.top + 36).lineTo(pageRight, doc.page.margins.top + 36).stroke('#dddddd');

    // Two-column info section
    const colGap = 16;
    const colWidth = (pageWidth - colGap) / 2;
    let yTop = doc.page.margins.top + 42;

    // Left: Bill To + invoice meta
    doc.fontSize(14).fillColor(theme.primary).text('BILL TO', pageLeft, yTop);
    doc.fontSize(12).fillColor('#333');
    if (customer.name) doc.text(customer.name, pageLeft, doc.y);
    if (customer.address) doc.text(customer.address, pageLeft, doc.y);
    if (customer.contact) doc.text(customer.contact, pageLeft, doc.y);
    doc.moveDown(0.5);
    doc.fontSize(14).fillColor(theme.primary).text('Invoice', pageLeft, doc.y);
    doc.fontSize(12).fillColor('#333');
    doc.text(`Issuance: ${dayjs(invoiceDate || undefined).isValid() ? dayjs(invoiceDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}`, pageLeft, doc.y);
    if (dueDate) doc.text(`Due: ${dueDate}`, pageLeft, doc.y);

    // Right: Company info box with logo and bank details
    const rightX = pageLeft + colWidth + colGap;
    const boxY = yTop - 6;
    const boxH = 140;
    doc.save();
    doc.rect(rightX, boxY, colWidth, boxH).stroke('#dddddd');
    doc.restore();
    try {
      const logoBuf = dataUrlToBuffer(company.logo);
      if (logoBuf) {
        doc.image(logoBuf, rightX + 10, boxY + 10, { width: 64 });
      }
    } catch (_) { }
    let infoY = boxY + 10;
    infoY += 74; // space under logo
    doc.fontSize(12).fillColor('#333');
    if (company.address) doc.text(company.address, rightX + 10, infoY, { width: colWidth - 20 });
    if (company.email) doc.text(`Email: ${company.email}`, { width: colWidth - 20 });
    if (company.phone) doc.text(`Phone: ${company.phone}`, { width: colWidth - 20 });
    if (company.bankName || company.accountName || company.accountNumber) {
      doc.moveDown(0.2);
      doc.fontSize(13).fillColor('#000').text('Bank Details', { width: colWidth - 20 });
      doc.fontSize(12).fillColor('#333');
      if (company.bankName) doc.text(`Bank: ${company.bankName}`, { width: colWidth - 20 });
      if (company.accountName) doc.text(`Account Name: ${company.accountName}`, { width: colWidth - 20 });
      if (company.accountNumber) doc.text(`Account Number: ${company.accountNumber}`, { width: colWidth - 20 });
    }

    // Move below box to start table
    doc.y = Math.max(doc.y, boxY + boxH + 12);
  } else {
    // Legacy header for other templates
    doc.save();
    doc.rect(doc.page.margins.left, doc.page.margins.top, doc.page.width - doc.page.margins.left - doc.page.margins.right, 18).fill(theme.primary);
    doc.restore();
    doc.fillColor('#ffffff').fontSize(14).text((company.name || 'Company'), doc.page.margins.left + 6, doc.page.margins.top + 2, { continued: true });
    if (company.companyId) {
      doc.fillColor('#ffffff').text(` • ${company.companyId}`);
    }
    doc.fillColor(theme.accent).fontSize(26).text('Invoice', { align: 'right' });
    doc.fontSize(12).fillColor('#000').text(`Invoice No: ${invNo}`, { align: 'right' });
    doc.text(`Invoice Date: ${dayjs(invoiceDate || undefined).isValid() ? dayjs(invoiceDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}`, { align: 'right' });
    if (dueDate) doc.text(`Due Date: ${dueDate}`, { align: 'right' });
    try {
      const logoBuf = dataUrlToBuffer(company.logo);
      if (logoBuf) {
        const imgWidth = 60;
        const x = doc.page.width - doc.page.margins.right - imgWidth;
        const y = doc.page.margins.top + 24;
        doc.image(logoBuf, x, y, { width: imgWidth });
      }
    } catch (_) { }
    doc.moveDown(0.5);
    doc.fillColor('#333').fontSize(13);
    if (company.address) doc.text(company.address);
    if (company.email) doc.text(company.email);
    if (company.phone) doc.text(company.phone);
    if (company.bankName || company.accountName || company.accountNumber) {
      doc.moveDown(0.2);
      doc.text(`Bank: ${company.bankName || ''}`);
      doc.text(`Account Name: ${company.accountName || ''}`);
      doc.text(`Account Number: ${company.accountNumber || ''}`);
    }
    doc.moveDown(1);
    doc.fontSize(template === 'bold' ? 15 : 14).fillColor(theme.primary).text('Bill To:', { underline: template === 'classic' });
    doc.fontSize(13).fillColor('#333');
    if (customer.name) doc.text(customer.name);
    if (customer.address) doc.text(customer.address);
    if (customer.contact) doc.text(`Contact: ${customer.contact}`);
  }

  // Contact block
  doc.moveDown(0.5);
  // Highlight contact block for quick scanning
  doc.fontSize(16).fillColor(theme.primary).text('WRITE US');
  doc.fillColor('#333').fontSize(13);
  if (company.address) doc.text(company.address);
  if (company.email) doc.text(company.email);
  if (company.phone) doc.text(company.phone);
  if (company.bankName || company.accountName || company.accountNumber) {
    doc.moveDown(0.2);
    doc.text(`Bank: ${company.bankName || ''}`);
    doc.text(`Account Name: ${company.accountName || ''}`);
    doc.text(`Account Number: ${company.accountNumber || ''}`);
  }

  // Customer section
  doc.moveDown(1);
  doc.fontSize(template === 'bold' ? 13 : 12).fillColor(theme.primary).text('Bill To:', { underline: template === 'classic' });
  doc.fontSize(12).fillColor('#333');
  if (customer.name) doc.text(customer.name);
  if (customer.address) doc.text(customer.address);
  if (customer.contact) doc.text(`Contact: ${customer.contact}`);

  // Items table
  doc.moveDown(1);
  const startX = doc.page.margins.left;
  const tableTop = doc.y;
  const colDesc = 260;
  const colQty = 60;
  const colUnit = 100;
  const colTotal = 100;
  const rowHeight = 24;

  // Header row background
  doc.save();
  doc.rect(startX, tableTop, doc.page.width - startX - doc.page.margins.right, rowHeight).fill(theme.tableHeader);
  doc.restore();
  doc.fillColor('#000').fontSize(14).text('Description', startX + 8, tableTop + 6, { width: colDesc });
  doc.text('Qty', startX + 8 + colDesc, tableTop + 6, { width: colQty, align: 'center' });
  doc.text('Price', startX + 8 + colDesc + colQty, tableTop + 6, { width: colUnit, align: 'right' });
  doc.text('Total', startX + 8 + colDesc + colQty + colUnit, tableTop + 6, { width: colTotal, align: 'right' });

  let y = tableTop + rowHeight;
  items.forEach((it, idx) => {
    if ((template === 'modern' || template === 'compact') && idx % 2 === 1) {
      doc.save();
      doc.rect(startX, y, doc.page.width - startX - doc.page.margins.right, rowHeight).fill('#fafafa');
      doc.restore();
    }
    doc.fillColor('#333').fontSize(13).text(String(it.description || ''), startX + 8, y + 6, { width: colDesc });
    doc.text(String(Number(it.qty || 0)), startX + 8 + colDesc, y + 6, { width: colQty, align: 'center' });
    doc.text(`${curr}${(Number(it.price || 0)).toFixed(2)}`, startX + 8 + colDesc + colQty, y + 6, { width: colUnit, align: 'right' });
    doc.text(`${curr}${(Number(it.total || (Number(it.qty || 0) * Number(it.price || 0)))).toFixed(2)}`, startX + 8 + colDesc + colQty + colUnit, y + 6, { width: colTotal, align: 'right' });
    y += rowHeight;
    if (y > doc.page.height - 120) {
      doc.addPage();
      y = doc.page.margins.top;
    }
  });

  // Totals
  const grandTotal = items.reduce((sum, it) => sum + (Number(it.qty || 0) * Number(it.price || 0)), 0);
  doc.moveTo(startX, y + 8).lineTo(doc.page.width - doc.page.margins.right, y + 8).stroke(theme.accent);
  doc.fontSize(template === 'minimal' ? 14 : 16).fillColor(theme.primary);
  doc.text('Total:', startX + colDesc + colQty + 8, y + 20, { width: colUnit, align: 'right' });
  doc.text(`${curr}${grandTotal.toFixed(2)}`, startX + colDesc + colQty + colUnit + 8, y + 20, { width: colTotal, align: 'right' });

  // Amount in words (currency-aware)
  doc.moveDown(0.5);
  doc.fontSize(14).fillColor('#333').text(`Amount in words: ${amountInWordsWithCurrency(grandTotal, curr)}`);

  // Footer
  // Electronic generation notice with printed date
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#555').text(
    `This invoice is generated electronically by ${company.name || company.companyName || 'Company'} and any alteration renders it invalid — Printed on ${dayjs().format('YYYY-MM-DD')}`
  );
  // Signature block
  try {
    const sigBuf = dataUrlToBuffer(company.signature);
    if (sigBuf) {
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#333').text('Authorized Signature');
      doc.image(sigBuf, doc.page.margins.left, doc.y + 4, { width: 120 });
    }
  } catch (_) { }

  // Optional Terms and Conditions section, shown only if provided
  if (company.termsAndConditions && String(company.termsAndConditions).trim()) {
    doc.moveDown(1);
    doc.fontSize(14).fillColor(theme.primary).text('Terms and Conditions');
    doc.moveDown(0.2);
    doc.fontSize(13).fillColor('#333').text(String(company.termsAndConditions), {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      align: 'left',
    });
  }

  doc.moveDown(1);
  doc.fontSize(11).fillColor('#777').text('Powered by YMOBooks', { align: 'right' });
}

// Helper: draw receipt by template style
function drawReceiptByTemplate(doc, company, rctNo, receiptDate, invoiceNumber, customer, amountPaid) {
  const template = (company.receiptTemplate || company.invoiceTemplate || 'classic').toLowerCase();
  const theme = {
    classic: { primary: '#000000', accent: '#333333', tableHeader: '#eeeeee' },
    modern: { primary: '#1f6feb', accent: '#0ea5e9', tableHeader: '#e0f2fe' },
    minimal: { primary: '#111827', accent: '#6b7280', tableHeader: '#f3f4f6' },
    bold: { primary: '#d97706', accent: '#b45309', tableHeader: '#fef3c7' },
    compact: { primary: '#10b981', accent: '#047857', tableHeader: '#d1fae5' },
  }[template] || { primary: '#000000', accent: '#333333', tableHeader: '#eeeeee' };

  if (company.brandColor && /^#?[0-9a-fA-F]{3,6}$/.test(company.brandColor)) {
    const base = company.brandColor.startsWith('#') ? company.brandColor : `#${company.brandColor}`;
    theme.primary = base;
    theme.accent = shadeColor(base, -20);
    theme.tableHeader = shadeColor(base, 70);
  }

  const curr = (company.currencySymbol && String(company.currencySymbol).trim()) || '$';

  // Top decorative bar
  doc.save();
  doc.rect(doc.page.margins.left, doc.page.margins.top, doc.page.width - doc.page.margins.left - doc.page.margins.right, 18).fill(theme.primary);
  doc.restore();

  doc.fillColor('#ffffff').fontSize(12).text((company.name || 'Company'), doc.page.margins.left + 6, doc.page.margins.top + 2, { continued: true });
  if (company.companyId) {
    doc.fillColor('#ffffff').text(` • ${company.companyId}`);
  }

  // Right-side Receipt meta
  doc.fillColor(theme.accent).fontSize(20).text('Receipt', { align: 'right' });
  doc.fontSize(12).fillColor('#000').text(`Receipt No: ${rctNo}`, { align: 'right' });
  doc.text(`Receipt Date: ${dayjs(receiptDate || undefined).isValid() ? dayjs(receiptDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}`, { align: 'right' });
  if (invoiceNumber) doc.text(`For Invoice: ${invoiceNumber}`, { align: 'right' });

  // Logo
  try {
    const logoBuf = dataUrlToBuffer(company.logo);
    if (logoBuf) {
      const imgWidth = 60;
      const x = doc.page.width - doc.page.margins.right - imgWidth;
      const y = doc.page.margins.top + 24;
      doc.image(logoBuf, x, y, { width: imgWidth });
    }
  } catch (_) { }

  // Contact block
  doc.moveDown(0.5);
  doc.fontSize(16).fillColor(theme.primary).text('WRITE US');
  doc.fillColor('#333').fontSize(13);
  if (company.address) doc.text(company.address);
  if (company.email) doc.text(company.email);
  if (company.phone) doc.text(company.phone);

  // Customer section
  doc.moveDown(1);
  doc.fontSize(template === 'bold' ? 15 : 14).fillColor(theme.primary).text('Received From:', { underline: template === 'classic' });
  doc.fontSize(12).fillColor('#333');
  if (customer?.name) doc.text(customer.name);
  if (customer?.address) doc.text(customer.address);
  if (customer?.contact) doc.text(`Contact: ${customer.contact}`);

  // Payment summary table
  doc.moveDown(1);
  const startX = doc.page.margins.left;
  const tableTop = doc.y;
  const colDesc = 300;
  const colAmt = 120;
  const rowHeight = 22;

  doc.save();
  doc.rect(startX, tableTop, doc.page.width - startX - doc.page.margins.right, rowHeight).fill(theme.tableHeader);
  doc.restore();
  doc.fillColor('#000').fontSize(10).text('Description', startX + 8, tableTop + 6, { width: colDesc });
  doc.text('Amount', startX + 8 + colDesc, tableTop + 6, { width: colAmt, align: 'right' });

  let y = tableTop + rowHeight;
  const desc = invoiceNumber ? `Payment for ${invoiceNumber}` : 'Payment received';
  doc.fillColor('#333').fontSize(10).text(desc, startX + 8, y + 6, { width: colDesc });
  doc.text(`${curr}${Number(amountPaid || 0).toFixed(2)}`, startX + 8 + colDesc, y + 6, { width: colAmt, align: 'right' });
  y += rowHeight;

  // Amount in words
  doc.moveDown(0.5);
  doc.fontSize(13).fillColor('#333').text(`Amount in words: ${numberToWords(Number(amountPaid || 0))}`);

  // Footer
  doc.moveDown(0.5);
  doc.fontSize(11).fillColor('#555').text(
    `This receipt acknowledges payment to ${company.name || company.companyName || 'Company'} — Printed on ${dayjs().format('YYYY-MM-DD')}`
  );
  try {
    const sigBuf = dataUrlToBuffer(company.signature);
    if (sigBuf) {
      doc.moveDown(1);
      doc.fontSize(12).fillColor('#333').text('Authorized Signature');
      doc.image(sigBuf, doc.page.margins.left, doc.y + 4, { width: 120 });
    }
  } catch (_) { }
  doc.moveDown(1);
  doc.fontSize(11).fillColor('#777').text('Powered by YMOBooks', { align: 'right' });
}

// Create invoice PDF (A4, multi-page if needed)
app.post('/api/invoice/create', async (req, res) => {
  try {
    const { companyId, invoiceNumber, invoiceDate, dueDate, customer = {}, items = [], template, brandColor, companyOverride } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    let company;
    try {
      company = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Fetch company for invoice DB failed, using file fallback:', dbErr.message);
    }
    if (!company) {
      company = findCompanyFile(companyId);
    }
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    const invNo = invoiceNumber || `INV-${companyId}-${Date.now()}`;
    const filename = `${invNo}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(INVOICES_DIR, filename);

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Honor client-provided template/branding to match on-device preview
    const companyForRender = { ...company };
    if (template) companyForRender.invoiceTemplate = template;
    if (brandColor) companyForRender.brandColor = brandColor;
    // Enforce single company currency for rendering
    const resolvedCurrencySymbol = company?.currencySymbol || '$';
    const resolvedCurrencyCode = company?.currencyCode || mapSymbolToCode(resolvedCurrencySymbol);
    companyForRender.currencySymbol = resolvedCurrencySymbol;
    if (resolvedCurrencyCode) companyForRender.currencyCode = resolvedCurrencyCode;
    // Merge client-provided company details to ensure PDF matches preview exactly
    if (companyOverride && typeof companyOverride === 'object') {
      const map = {
        name: 'name',
        companyName: 'name',
        address: 'address',
        email: 'email',
        phone: 'phone',
        phoneNumber: 'phone',
        logo: 'logo',
        signature: 'signature',
        terms: 'termsAndConditions',
        termsAndConditions: 'termsAndConditions',
        tnc: 'termsAndConditions',
        bankName: 'bankName',
        accountName: 'accountName',
        bankAccountName: 'accountName',
        accountNumber: 'accountNumber',
        bankAccountNumber: 'accountNumber',
      };
      for (const [k, v] of Object.entries(companyOverride)) {
        const target = map[k] || k;
        if (v != null) companyForRender[target] = v;
      }
    }
    // Template-aware rendering
    drawInvoiceByTemplate(doc, companyForRender, invNo, invoiceDate, dueDate, customer, items);

    doc.end();

    stream.on('finish', async () => {
      const pdfPath = `/files/invoices/${filename}`;
      // Persist invoice for history
      try {
        const persistedItems = items.map((it) => ({
          description: it.description,
          qty: Number(it.qty || 0),
          price: Number(it.price || 0),
          total: Number(it.qty || 0) * Number(it.price || 0),
        }));
        const grandTotalPersist = persistedItems.reduce((sum, it) => sum + Number(it.total || 0), 0);
        await Invoice.create({
          companyId,
          invoiceNumber: invNo,
          invoiceDate: invoiceDate ? dayjs(invoiceDate).toDate() : new Date(),
          dueDate: dueDate ? dayjs(dueDate).toDate() : undefined,
          invoiceTemplate: (companyForRender?.invoiceTemplate || template || (company?.invoiceTemplate) || 'classic'),
          currencySymbol: resolvedCurrencySymbol,
          currencyCode: resolvedCurrencyCode,
          customer: {
            name: customer.name,
            address: customer.address,
            contact: customer.contact,
          },
          items: persistedItems,
          grandTotal: grandTotalPersist,
          pdfPath,
        });
      } catch (persistErr) {
        console.error('Persist invoice error:', persistErr);
      }
      return res.json({ success: true, pdfPath, filename });
    });
    stream.on('error', (err) => {
      console.error('PDF stream error:', err);
      return res.status(500).json({ success: false, message: 'Error generating PDF' });
    });
  } catch (err) {
    console.error('Invoice create error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating invoice' });
  }
});

// Create receipt PDF
app.post('/api/receipt/create', async (req, res) => {
  try {
    const { companyId, invoiceNumber, receiptNumber, receiptDate, customer = {}, amountPaid } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    let company;
    try {
      company = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Fetch company for receipt DB failed, using file fallback:', dbErr.message);
    }
    if (!company) company = findCompanyFile(companyId);
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });

    // Optionally load invoice to derive amount or customer
    let derivedCustomer = customer;
    let derivedAmount = amountPaid;
    if ((!derivedCustomer?.name || derivedAmount == null) && invoiceNumber) {
      try {
        const invDoc = await Invoice.findOne({ companyId, invoiceNumber }).lean();
        if (invDoc) {
          if (!derivedCustomer?.name) derivedCustomer = invDoc.customer || derivedCustomer;
          if (derivedAmount == null) derivedAmount = Number(invDoc.grandTotal || 0);
          // currency ignored; enforced to company currency below
        }
      } catch (e) {
        console.warn('Lookup invoice for receipt failed:', e.message);
      }
    }
    if (derivedAmount == null) derivedAmount = 0;
    const derivedCurrency = company?.currencySymbol || '$';

    const rctNo = receiptNumber || `RCT-${companyId}-${Date.now()}`;
    const filename = `${rctNo}.pdf`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filePath = path.join(RECEIPTS_DIR, filename);

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const derivedCurrencyCode = (company?.currencyCode) || mapSymbolToCode(derivedCurrency);
    const companyForReceipt = { ...company, currencySymbol: derivedCurrency, currencyCode: derivedCurrencyCode };
    drawReceiptByTemplate(doc, companyForReceipt, rctNo, receiptDate, invoiceNumber, derivedCustomer, derivedAmount);

    doc.end();

    stream.on('finish', async () => {
      const pdfPath = `/files/receipts/${filename}`;
      try {
        await Receipt.create({
          companyId,
          receiptNumber: rctNo,
          invoiceNumber: invoiceNumber || undefined,
          receiptDate: receiptDate ? dayjs(receiptDate).toDate() : new Date(),
          currencySymbol: derivedCurrency,
          currencyCode: derivedCurrencyCode,
          customer: {
            name: derivedCustomer?.name,
            address: derivedCustomer?.address,
            contact: derivedCustomer?.contact,
          },
          amountPaid: Number(derivedAmount || 0),
          pdfPath,
        });
        // Mark invoice as paid when possible
        if (invoiceNumber) {
          try {
            await Invoice.updateOne(
              { companyId, invoiceNumber },
              { $set: { status: 'paid', paidAt: new Date() } }
            );
          } catch (e) {
            console.warn('Mark invoice paid failed:', e.message);
          }
        }
      } catch (persistErr) {
        console.error('Persist receipt error:', persistErr.message);
      }
      return res.json({ success: true, pdfPath, filename });
    });
    stream.on('error', (err) => {
      console.error('PDF receipt stream error:', err);
      return res.status(500).json({ success: false, message: 'Error generating receipt PDF' });
    });
  } catch (err) {
    console.error('Receipt create error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating receipt' });
  }
});

// Fetch receipts history
app.get('/api/receipts', async (req, res) => {
  try {
    const { companyId, months = 6 } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    const since = dayjs().subtract(Number(months), 'month').toDate();
    let list = [];
    try {
      list = await Receipt.find({ companyId, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
    } catch (dbErr) {
      console.warn('Fetch receipts DB failed:', dbErr.message);
    }
    return res.json({ success: true, receipts: list });
  } catch (err) {
    console.error('Fetch receipts error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching receipts' });
  }
});

// Delete a single receipt by receiptNumber and sync invoice status
app.delete('/api/receipts/:receiptNumber', async (req, res) => {
  try {
    const { companyId } = req.query;
    const { receiptNumber } = req.params;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    if (!receiptNumber) return res.status(400).json({ success: false, message: 'receiptNumber is required' });

    const found = await Receipt.findOneAndDelete({ companyId, receiptNumber }).lean();
    if (!found) return res.status(404).json({ success: false, message: 'Receipt not found' });

    // Remove generated PDF file if exists
    try {
      const filename = found.pdfPath ? (found.pdfPath.split('/').pop() || '') : `${receiptNumber}.pdf`;
      if (filename) {
        const filePath = path.join(RECEIPTS_DIR, filename);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch (fileErr) {
      console.warn('Failed to remove receipt PDF:', fileErr.message);
    }

    // If linked to an invoice, mark unpaid when there are no remaining receipts
    if (found.invoiceNumber) {
      try {
        const remaining = await Receipt.countDocuments({ companyId, invoiceNumber: found.invoiceNumber });
        if (remaining === 0) {
          await Invoice.updateOne(
            { companyId, invoiceNumber: found.invoiceNumber },
            { $set: { status: 'unpaid', paidAt: null } }
          );
        }
      } catch (e) {
        console.warn('Sync invoice status after receipt delete failed:', e.message);
      }
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Delete receipt error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting receipt' });
  }
});

// Delete all receipts for a specific invoice and sync invoice status
app.delete('/api/receipts/by-invoice/:invoiceNumber', async (req, res) => {
  try {
    const { companyId } = req.query;
    const { invoiceNumber } = req.params;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    if (!invoiceNumber) return res.status(400).json({ success: false, message: 'invoiceNumber is required' });

    const receipts = await Receipt.find({ companyId, invoiceNumber }).lean();
    if (!receipts.length) return res.status(404).json({ success: false, message: 'No receipts found for invoice' });

    // Remove files
    for (const r of receipts) {
      try {
        const filename = r.pdfPath ? (r.pdfPath.split('/').pop() || '') : `${r.receiptNumber}.pdf`;
        if (filename) {
          const filePath = path.join(RECEIPTS_DIR, filename);
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
      } catch (fileErr) {
        console.warn('Failed to remove receipt PDF:', fileErr.message);
      }
    }

    await Receipt.deleteMany({ companyId, invoiceNumber });

    // Mark invoice as unpaid
    try {
      await Invoice.updateOne(
        { companyId, invoiceNumber },
        { $set: { status: 'unpaid', paidAt: null } }
      );
    } catch (e) {
      console.warn('Sync invoice status after bulk receipt delete failed:', e.message);
    }

    return res.json({ success: true, deletedCount: receipts.length });
  } catch (err) {
    console.error('Delete receipts by invoice error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting receipts' });
  }
});

// Create expense entry
app.post('/api/expenses/create', async (req, res) => {
  try {
    const { companyId, month, category, amount, description } = req.body || {};
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    if (!month) return res.status(400).json({ success: false, message: 'Missing month (YYYY-MM)' });
    if (!category || !['production', 'expense'].includes(String(category))) return res.status(400).json({ success: false, message: 'Invalid category' });
    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ success: false, message: 'Amount must be positive' });

    // Enforce company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || undefined;
    try {
      const created = await Expense.create({ companyId, month, category, amount: amt, currencySymbol: sym, currencyCode: code, description });
      return res.json({ success: true, expense: created });
    } catch (err) {
      console.warn('Expense create DB failed, using file fallback:', err.message);
      const created = addExpenseFile({ companyId, month, category, amount: amt, currencySymbol: sym, currencyCode: code, description });
      return res.json({ success: true, expense: created, fallback: 'file' });
    }
  } catch (err) {
    console.error('Expense create error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating expense' });
  }
});

// Fetch expenses for a company and month
app.get('/api/expenses', async (req, res) => {
  try {
    const { companyId, month } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const query = { companyId };
    if (month) query.month = String(month);
    let expenses = [];
    try {
      expenses = await Expense.find(query).sort({ createdAt: -1 }).lean();
    } catch (err) {
      console.warn('Fetch expenses DB failed, using file fallback:', err.message);
      expenses = queryExpensesFile(query).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    }
    return res.json({ success: true, expenses });
  } catch (err) {
    console.error('Fetch expenses error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching expenses' });
  }
});

// Purge expenses for a company (optional: by month and/or category)
app.delete('/api/expenses', async (req, res) => {
  try {
    const { companyId, month, category } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const query = { companyId };
    if (month) query.month = String(month);
    if (category) query.category = String(category);
    let deletedCount = 0;
    try {
      const result = await Expense.deleteMany(query);
      deletedCount = result?.deletedCount || 0;
    } catch (err) {
      console.warn('Delete expenses DB failed, using file fallback:', err.message);
      deletedCount = deleteExpensesFile(query);
    }
    return res.json({ success: true, deletedCount });
  } catch (err) {
    console.error('Delete expenses error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting expenses' });
  }
});

// Finance summary by currency for a month
app.get('/api/finance/summary', async (req, res) => {
  try {
    const { companyId, month } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const m = String(month || dayjs().format('YYYY-MM'));
    const start = dayjs(m + '-01').startOf('month').toDate();
    const end = dayjs(m + '-01').endOf('month').toDate();
    // Get company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || 'UNK';

    // Receipts -> revenue (single currency)
    const receipts = await Receipt.find({ companyId, receiptDate: { $gte: start, $lte: end } }).lean();
    const totalRevenue = receipts.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);

    // Expenses (single currency)
    const expenses = await Expense.find({ companyId, month: m }).lean();
    let productionCost = 0;
    let runningExpenses = 0;
    expenses.forEach((e) => {
      if (String(e.category) === 'production') productionCost += Number(e.amount || 0);
      else runningExpenses += Number(e.amount || 0);
    });
    const totalExpenses = productionCost + runningExpenses;

    const netProfit = Number(totalRevenue || 0) - Number(totalExpenses || 0);

    // Align response to simple number fields for client
    return res.json({
      success: true, summary: {
        month: m,
        currencyCode: code,
        symbol: sym,
        revenue: Number(totalRevenue || 0),
        expenses: { productionCost, runningExpenses, totalExpenses },
        net: Number(netProfit || 0),
      }
    });
  } catch (err) {
    console.error('Finance summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing summary' });
  }
});

// Daily revenue totals from receipts for a given month (31 days)
app.get('/api/finance/revenue-daily', async (req, res) => {
  try {
    const { companyId, month } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const m = String(month || dayjs().format('YYYY-MM'));
    const start = dayjs(m + '-01').startOf('month').toDate();
    const end = dayjs(m + '-01').endOf('month').toDate();

    // Resolve company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || 'UNK';

    // Fetch receipts within month and aggregate by day
    // Include receipts whose receiptDate falls within month; fallback to createdAt when receiptDate is missing
    const receipts = await Receipt.find({
      companyId, $or: [
        { receiptDate: { $gte: start, $lte: end } },
        { receiptDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ]
    }).lean();
    const days = Array.from({ length: 31 }, () => 0);
    receipts.forEach((r) => {
      const d = r.receiptDate ? dayjs(r.receiptDate) : (r.createdAt ? dayjs(r.createdAt) : null);
      if (!d) return;
      const dayIdx = d.date() - 1; // 0-based
      if (dayIdx >= 0 && dayIdx < 31) {
        days[dayIdx] += Number(r.amountPaid || 0);
      }
    });
    const total = days.reduce((a, b) => a + Number(b || 0), 0);
    return res.json({ success: true, month: m, currencyCode: code, symbol: sym, days, total });
  } catch (err) {
    console.error('Revenue daily error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing daily revenue' });
  }
});

// Daily expenses totals for a given month (31 days)
app.get('/api/finance/expenses-daily', async (req, res) => {
  try {
    const { companyId, month } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const m = String(month || dayjs().format('YYYY-MM'));
    // Resolve company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || 'UNK';

    const expenses = await Expense.find({ companyId, month: m, category: 'expense' }).lean();
    const days = Array.from({ length: 31 }, () => 0);
    expenses.forEach((e) => {
      let dayIdx = null;
      if (typeof e.day === 'number' && e.day >= 1 && e.day <= 31) {
        dayIdx = e.day - 1;
      } else if (e.createdAt) {
        dayIdx = dayjs(e.createdAt).date() - 1;
      }
      if (dayIdx != null && dayIdx >= 0 && dayIdx < 31) {
        days[dayIdx] += Number(e.amount || 0);
      }
    });
    const total = days.reduce((a, b) => a + Number(b || 0), 0);
    return res.json({ success: true, month: m, currencyCode: code, symbol: sym, days, total });
  } catch (err) {
    console.error('Expenses daily error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing daily expenses' });
  }
});

// Upsert a daily expense value for a given company and month
app.post('/api/finance/expenses-daily', async (req, res) => {
  try {
    const { companyId, month, day, amount } = req.body || {};
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const m = String(month || dayjs().format('YYYY-MM'));
    const d = Number(day);
    const amt = Number(amount);
    if (!d || d < 1 || d > 31) return res.status(400).json({ success: false, message: 'Invalid day' });
    if (amt == null || isNaN(amt) || amt < 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // Resolve company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || 'UNK';

    // Remove existing entry for this day to avoid duplication
    await Expense.deleteMany({ companyId, month: m, category: 'expense', day: d });
    // Create new entry
    const created = await Expense.create({ companyId, month: m, category: 'expense', amount: amt, currencySymbol: sym, currencyCode: code, description: `Daily Expense D${d}`, day: d });
    return res.json({ success: true, expense: created });
  } catch (err) {
    console.error('Expenses daily upsert error:', err);
    return res.status(500).json({ success: false, message: 'Server error saving daily expense' });
  }
});

// Fetch invoice history for last N months (default 6)
app.get('/api/invoices', async (req, res) => {
  try {
    const { companyId, months = 6 } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    const since = dayjs().subtract(Number(months), 'month').toDate();
    let list = [];
    try {
      list = await Invoice.find({ companyId, createdAt: { $gte: since } })
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();
    } catch (dbErr) {
      console.warn('Fetch invoices DB failed:', dbErr.message);
    }
    return res.json({ success: true, invoices: list });
  } catch (err) {
    console.error('Fetch invoices error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching invoices' });
  }
});

// Admin: backfill missing currency fields for invoices/receipts based on company
app.post('/api/admin/backfill-currency', async (req, res) => {
  try {
    const adminId = (req.query && req.query.adminId) || (req.body && req.body.adminId) || '';
    if (String(adminId) !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    const { companyId } = req.body || {};
    const companies = [];
    if (companyId) {
      const c = await Company.findOne({ companyId }).lean();
      if (!c) return res.status(404).json({ success: false, message: 'Company not found' });
      companies.push(c);
    } else {
      const list = await Company.find({}, 'companyId currencySymbol currencyCode').lean();
      companies.push(...list);
    }

    let updatedInvoices = 0;
    let updatedReceipts = 0;
    let updatedExpenses = 0;
    for (const c of companies) {
      const sym = c.currencySymbol || '$';
      const code = c.currencyCode || mapSymbolToCode(sym);
      // Invoices: set missing currencySymbol/currencyCode
      const invResult = await Invoice.updateMany(
        {
          companyId: c.companyId,
          $or: [{ currencySymbol: { $exists: false } }, { currencySymbol: null }, { currencySymbol: '' }, { currencyCode: { $exists: false } }],
        },
        { $set: { currencySymbol: sym, currencyCode: code } }
      );
      updatedInvoices += invResult?.modifiedCount || 0;
      // Receipts: set missing currencySymbol/currencyCode
      const rctResult = await Receipt.updateMany(
        {
          companyId: c.companyId,
          $or: [{ currencySymbol: { $exists: false } }, { currencySymbol: null }, { currencySymbol: '' }, { currencyCode: { $exists: false } }],
        },
        { $set: { currencySymbol: sym, currencyCode: code } }
      );
      updatedReceipts += rctResult?.modifiedCount || 0;
      const expResult = await Expense.updateMany(
        {
          companyId: c.companyId,
          $or: [{ currencySymbol: { $exists: false } }, { currencySymbol: null }, { currencySymbol: '' }, { currencyCode: { $exists: false } }],
        },
        { $set: { currencySymbol: sym, currencyCode: code } }
      );
      updatedExpenses += expResult?.modifiedCount || 0;
    }

    return res.json({ success: true, updatedInvoices, updatedReceipts, updatedExpenses, companies: companies.length });
  } catch (err) {
    console.error('Admin backfill currency error:', err);
    return res.status(500).json({ success: false, message: 'Server error backfilling currency' });
  }
});

// Delete an invoice by invoiceNumber for a company
app.delete('/api/invoices/:invoiceNumber', async (req, res) => {
  try {
    const { companyId } = req.query;
    const { invoiceNumber } = req.params;
    if (!companyId || !invoiceNumber) {
      return res.status(400).json({ success: false, message: 'companyId and invoiceNumber are required' });
    }

    // First, delete any receipts tied to this invoice (and their PDFs) so revenue syncs
    try {
      const receipts = await Receipt.find({ companyId, invoiceNumber }).lean();
      for (const r of receipts) {
        try {
          const filename = r.pdfPath ? (r.pdfPath.split('/').pop() || '') : `${r.receiptNumber}.pdf`;
          if (filename) {
            const filePath = path.join(RECEIPTS_DIR, filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          }
        } catch (fileErr) {
          console.warn('Failed to remove receipt PDF during invoice delete:', fileErr.message);
        }
      }
      if (receipts.length > 0) {
        await Receipt.deleteMany({ companyId, invoiceNumber });
      }
    } catch (rctErr) {
      console.warn('Cascade receipt delete failed:', rctErr.message);
    }

    let deleted = null;
    try {
      deleted = await Invoice.findOneAndDelete({ companyId, invoiceNumber }).lean();
    } catch (dbErr) {
      console.warn('Delete invoice DB failed:', dbErr.message);
    }
    // Attempt to remove PDF file from disk if known
    try {
      const pdfPath = deleted?.pdfPath;
      if (pdfPath && typeof pdfPath === 'string') {
        const relative = pdfPath.replace(/^\/?files\//, '');
        const full = path.join(GENERATED_DIR, relative);
        if (fs.existsSync(full)) {
          fs.unlinkSync(full);
        }
      }
    } catch (fsErr) {
      console.warn('Delete invoice PDF failed:', fsErr.message);
    }
    if (!deleted) {
      return res.json({ success: true, message: 'No invoice found (already deleted?)', invoiceNumber, companyId });
    }
    return res.json({ success: true, message: 'Invoice and associated receipts deleted', invoiceNumber, companyId });
  } catch (err) {
    console.error('Delete invoice error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting invoice' });
  }
});
app.post('/api/login', async (req, res) => {
  try {
    const { companyId, businessType } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    console.log('Login attempt:', companyId, ' Category:', businessType);

    // Admin bypass
    if (String(companyId).toUpperCase() === 'PBMSRV') {
      const adminStub = { companyId: 'PBMSRV', name: 'System Admin', businessType: businessType || 'admin' };
      return res.json({ success: true, company: adminStub });
    }

    const fileCompany = findCompanyFile(companyId);
    let dbCompany = null;
    try {
      dbCompany = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Login DB query failed, using file fallback:', dbErr.message);
    }
    const company = { ...(fileCompany || {}), ...(dbCompany || {}) };
    if (!company || Object.keys(company).length === 0) return res.status(404).json({ success: false, message: 'Company not found' });

    // Strict Category Enforcment
    if (businessType) {
      const companyType = company.businessType || 'general_merchandise';
      if (companyType !== businessType) {
        // Pretty print types for error message
        const names = {
          'printing_press': 'Printing Press',
          'manufacturing': 'Manufacturing',
          'general_merchandise': 'General Merchandise'
        };
        const correctName = names[companyType] || companyType;
        return res.status(403).json({
          success: false,
          message: `Access Denied. This ID belongs to the "${correctName}" category. Please switch tabs to login.`
        });
      }
    }

    return res.json({ success: true, company });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

app.get('/api/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const fileCompany = findCompanyFile(companyId);
    let dbCompany = null;
    try {
      dbCompany = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Get company DB failed, using file fallback:', dbErr.message);
    }
    const company = { ...(fileCompany || {}), ...(dbCompany || {}) };
    if (!company || Object.keys(company).length === 0) return res.status(404).json({ success: false, message: 'Company not found' });
    return res.json({ success: true, company });
  } catch (err) {
    console.error('Get company error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching company' });
  }
});

app.get('/', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send('YMOBooks backend is running');
  }
});

// Simple health check for connectivity diagnostics
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Admin endpoints (developer-only; gated by adminId === 'pbmsrvr')
app.get('/api/admin/companies', async (req, res) => {
  try {
    const { adminId } = req.query;
    if (adminId !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    let companies = [];
    try {
      companies = await Company.find({}, 'companyId name email phone createdAt').sort({ createdAt: -1 }).lean();
    } catch (dbErr) {
      console.warn('Admin list companies DB failed, using file fallback:', dbErr.message);
      const files = readCompaniesFile();
      companies = files.map((c) => ({ companyId: c.companyId, name: c.name, email: c.email, phone: c.phone, createdAt: c.createdAt || new Date().toISOString() }));
      // Sort by createdAt desc if present
      companies.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return res.json({ success: true, companies });
  } catch (err) {
    console.error('Admin list companies error:', err);
    return res.status(500).json({ success: false, message: 'Server error listing companies' });
  }
});

// Admin: migrate file-based companies into DB (logos/signatures included)
app.post('/api/admin/migrate-files-to-db', async (req, res) => {
  try {
    const { adminId } = req.query;
    if (adminId !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    if (!DB_CONNECTED) return res.status(503).json({ success: false, message: 'DB not connected; cannot run migration' });
    const files = readCompaniesFile();
    let migrated = 0;
    for (const f of files) {
      try {
        const existing = await Company.findOne({ companyId: f.companyId }).lean();
        const merged = { ...(f || {}), ...(existing || {}) };
        await Company.updateOne({ companyId: f.companyId }, { $set: merged }, { upsert: true });
        migrated += 1;
      } catch (e) {
        console.warn('Migration upsert failed for', f.companyId, e.message);
      }
    }
    return res.json({ success: true, migrated, total: files.length, message: 'Migration complete' });
  } catch (err) {
    console.error('Admin migration error:', err);
    return res.status(500).json({ success: false, message: 'Server error during migration' });
  }
});

// Admin: scan duplicates across DB (preferred) or file fallback
app.get('/api/admin/duplicates', async (req, res) => {
  try {
    const { adminId } = req.query;
    if (adminId !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    let list = [];
    try {
      if (DB_CONNECTED) {
        list = await Company.find({}).lean();
      } else {
        list = readCompaniesFile();
      }
    } catch (e) {
      console.warn('Duplicates scan fetch failed:', e.message);
      list = readCompaniesFile();
    }
    const fields = ['name', 'email', 'phone', 'accountNumber'];
    const report = {};
    fields.forEach((field) => {
      const map = new Map();
      list.forEach((c) => {
        const val = c[field];
        if (val) {
          const arr = map.get(val) || [];
          arr.push(c.companyId);
          map.set(val, arr);
        }
      });
      const duplicates = [];
      for (const [val, ids] of map.entries()) {
        if (ids.length > 1) duplicates.push({ value: val, companyIds: ids });
      }
      report[field] = duplicates;
    });
    return res.json({ success: true, report });
  } catch (err) {
    console.error('Admin duplicates error:', err);
    return res.status(500).json({ success: false, message: 'Server error scanning duplicates' });
  }
});

app.delete('/api/admin/company/:companyId', async (req, res) => {
  try {
    const { adminId } = req.query;
    if (adminId !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    const { companyId } = req.params;
    let company;
    try {
      company = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Admin delete fetch company DB failed:', dbErr.message);
    }
    if (!company) {
      company = findCompanyFile(companyId);
    }
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    try {
      await Company.deleteOne({ companyId });
      await Invoice.deleteMany({ companyId });
    } catch (dbErr) {
      console.warn('Admin delete DB failed:', dbErr.message);
    }
    // Remove from file fallback
    const list = readCompaniesFile().filter((c) => c.companyId !== companyId);
    writeCompaniesFile(list);
    return res.json({ success: true, message: 'Company and invoices deleted', companyId });
  } catch (err) {
    console.error('Admin delete company error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting company' });
  }
});

app.get('/api/admin/stats', async (req, res) => {
  try {
    const { adminId } = req.query;
    if (adminId !== 'pbmsrvr') return res.status(403).json({ success: false, message: 'Forbidden' });
    let totalCompanies = 0;
    let totalInvoices = 0;
    let recentCompanies = 0;
    const since30 = dayjs().subtract(30, 'day').toDate();
    try {
      totalCompanies = await Company.countDocuments({});
      totalInvoices = await Invoice.countDocuments({});
      recentCompanies = await Company.countDocuments({ createdAt: { $gte: since30 } });
    } catch (dbErr) {
      console.warn('Admin stats DB failed, using file fallback:', dbErr.message);
      const files = readCompaniesFile();
      totalCompanies = files.length;
      try {
        const pdfs = fs.readdirSync(INVOICES_DIR);
        totalInvoices = pdfs.length;
      } catch (_e) {
        totalInvoices = 0;
      }
      recentCompanies = files.filter((c) => {
        const createdAt = c.createdAt ? new Date(c.createdAt) : null;
        return createdAt && createdAt >= since30;
      }).length;
    }
    return res.json({ success: true, stats: { totalCompanies, totalInvoices, recentCompanies } });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching stats' });
  }
});

// Vercel serverless: export the Express app instead of listening
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`YMOBooks backend listening on http://localhost:${PORT}`);
  });
}
