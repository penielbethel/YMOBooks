const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');
const axios = require('axios');
const UC_PUBLIC = process.env.UPLOADCARE_PUBLIC_KEY || '608f1703ba6637c4fc73';
const UC_SECRET = process.env.UPLOADCARE_SECRET_KEY || 'c5c3bdd59e4aefdbc12f';
let DB_CONNECTED = false;
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
let BRANDING_DIR = path.join(GENERATED_DIR, 'branding');
try {
  fs.mkdirSync(INVOICES_DIR, { recursive: true });
  fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
  fs.mkdirSync(BRANDING_DIR, { recursive: true });
} catch (e) {
  console.warn('Failed to create generated directories at', GENERATED_DIR, '→ falling back to /tmp:', e.message);
  GENERATED_DIR = path.join('/tmp', 'generated');
  INVOICES_DIR = path.join(GENERATED_DIR, 'invoices');
  RECEIPTS_DIR = path.join(GENERATED_DIR, 'receipts');
  BRANDING_DIR = path.join(GENERATED_DIR, 'branding');
  try {
    fs.mkdirSync(INVOICES_DIR, { recursive: true });
    fs.mkdirSync(RECEIPTS_DIR, { recursive: true });
    fs.mkdirSync(BRANDING_DIR, { recursive: true });
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
    // Priority: Uploadcare
    const cdnUrl = await uploadToUploadcare(dataUrl);
    if (cdnUrl) return cdnUrl;

    const lib = await ensureSharp();
    const parsed = parseDataUrl(dataUrl);
    if (!parsed) return dataUrl;

    let buffer = parsed.buffer;
    if (lib) {
      const max = kind === 'signature' ? { width: 600, height: 220 } : { width: 512, height: 512 };
      let pipeline = lib(parsed.buffer).rotate();
      pipeline = pipeline.resize({ ...max, fit: 'inside', withoutEnlargement: true });
      buffer = await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer();
    }

    // Save to file instead of returning base64 to keep DB small and fetch fast
    const filename = `${kind}-${Date.now()}-${Math.floor(Math.random() * 1000)}.png`;
    const fullPath = path.join(BRANDING_DIR, filename);
    fs.writeFileSync(fullPath, buffer);

    // Return the URL that can be used by the client
    const port = process.env.PORT || 3000;
    // We try to return a path relative to /files
    return `/files/branding/${filename}`;
  } catch (e) {
    console.warn('Image optimization/save failed:', e.message);
    return dataUrl;
  }
}

async function uploadToUploadcare(dataUrlOrPath) {
  try {
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('UPLOADCARE_PUB_KEY', UC_PUBLIC);
    formData.append('UPLOADCARE_STORE', '1');

    if (typeof dataUrlOrPath === 'string' && dataUrlOrPath.startsWith('data:')) {
      const parsed = parseDataUrl(dataUrlOrPath);
      if (parsed) {
        formData.append('file', parsed.buffer, {
          filename: 'image.png',
          contentType: parsed.mime
        });
      } else {
        formData.append('file', dataUrlOrPath);
      }
    } else if (typeof dataUrlOrPath === 'string' && fs.existsSync(dataUrlOrPath)) {
      formData.append('file', fs.createReadStream(dataUrlOrPath));
    } else {
      formData.append('file', dataUrlOrPath);
    }

    const res = await axios.post('https://upload.uploadcare.com/base/', formData, {
      headers: formData.getHeaders()
    });

    if (res.data && res.data.file) {
      return `https://ucarecdn.com/${res.data.file}/`;
    }
  } catch (err) {
    console.warn('Uploadcare upload failed:', err.response?.data || err.message);
  }
  return null;
}

async function deleteFromUploadcare(url) {
  if (!url || typeof url !== 'string' || !url.includes('ucarecdn.com')) return;
  try {
    const fileId = url.split('ucarecdn.com/')[1].split('/')[0];
    if (!fileId) return;
    console.log('Deleting Uploadcare file:', fileId);
    await axios.delete(`https://api.uploadcare.com/files/${fileId}/`, {
      headers: {
        'Authorization': `Uploadcare.Simple ${UC_PUBLIC}:${UC_SECRET}`,
        'Accept': 'application/vnd.uploadcare-v0.5+json'
      }
    });
  } catch (err) {
    console.warn('Uploadcare delete failed:', err.response?.data || err.message);
  }
}

// Mongo connection (optional)
// Mongo connection helper for Serverless/Vercel
let cachedDb = null;

async function connectToDatabase() {
  if (cachedDb && mongoose.connection.readyState === 1) {
    return cachedDb;
  }

  if (!MONGO_URI) {
    console.warn('Skipping DB connect: MONGO_URI not set');
    return null;
  }

  try {
    console.log('Connecting to MongoDB...');
    // If a connection is already in progress, await it
    if (mongoose.connection.readyState === 2) {
      console.log('Use existing connection promise');
    }

    // Mongoose 6+ default buffering is fine, but we explicit connect
    cachedDb = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      dbName: process.env.MONGO_DB_NAME || 'test',
      bufferCommands: false, // Disable buffering to fail fast if not connected
    });
    DB_CONNECTED = true;
    console.log('New MongoDB connection established');
    return cachedDb;
  } catch (err) {
    console.error('MongoDB connection error:', err);
    DB_CONNECTED = false;
    throw err;
  }
}

// Attempt initial connection (optional, for warmer starts)
connectToDatabase().catch(e => console.warn('Initial warm-up connection fail:', e.message));

// Listeners
mongoose.connection.on('connected', () => { DB_CONNECTED = true; });
mongoose.connection.on('disconnected', () => { DB_CONNECTED = false; });
if (!MONGO_URI) {
  console.warn('MONGO_URI not set. Running with file-based fallback storage.');
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    db: DB_CONNECTED ? 'connected' : 'disconnected',
    uploadcare: !!(UC_PUBLIC && UC_SECRET),
    vercel: !!process.env.VERCEL,
    node: process.version
  });
});

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
    // Subscription
    isPremium: { type: Boolean, default: false },
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
    category: { type: String, enum: ['large_format', 'di_printing', 'dtf_prints', 'photo_frames', 'general'], default: 'general' },
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
    items: [
      {
        description: String,
        qty: Number,
        price: Number,
        total: Number,
      },
    ],
    pdfPath: { type: String },
    category: { type: String, enum: ['large_format', 'di_printing', 'dtf_prints', 'photo_frames', 'general'], default: 'general' },
  },
  { timestamps: true }
);
const Receipt = mongoose.model('Receipt', ReceiptSchema);

// Expense model for monthly P&L
const ExpenseSchema = new mongoose.Schema(
  {
    companyId: { type: String, index: true, required: true },
    month: { type: String, index: true, required: true }, // YYYY-MM
    category: { type: String, enum: ['production', 'expense', 'large_format', 'di_printing', 'dtf_prints', 'photo_frames'], required: true },
    amount: { type: Number, required: true },
    currencySymbol: { type: String },
    currencyCode: { type: String },
    description: { type: String },
    day: { type: Number }, // optional: day of month for daily tracking (1-31)
  },
  { timestamps: true }
);
const Expense = mongoose.model('Expense', ExpenseSchema);

// Manufacturing: Stock Item Schema
const StockItemSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    type: { type: String, enum: ['raw_material', 'finished_good'], default: 'raw_material' },
    quantity: { type: Number, default: 0 },
    unit: { type: String, default: 'units' }, // e.g. kg, pcs, liters
    costPrice: { type: Number, default: 0 }, // Cost per unit
    sellingPrice: { type: Number, default: 0 }, // Selling price (for finished goods)
    minStockLevel: { type: Number, default: 0 }, // Alert level
    description: { type: String },
    // Bill of Materials (for Finished Goods)
    bom: [
      {
        materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem' },
        quantity: { type: Number, default: 0 }
      }
    ],
  },
  { timestamps: true }
);
const StockItem = mongoose.model('StockItem', StockItemSchema);

// Manufacturing: Production Log
const ProductionLogSchema = new mongoose.Schema(
  {
    companyId: { type: String, required: true, index: true },
    finishedGoodId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem', required: true },
    quantityProduced: { type: Number, required: true },
    materialsUsed: [
      {
        materialId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockItem' },
        quantity: { type: Number }
      }
    ],
    productionDate: { type: Date, default: Date.now },
    notes: { type: String }
  },
  { timestamps: true }
);
const ProductionLog = mongoose.model('ProductionLog', ProductionLogSchema);
async function generateCompanyId(name, businessType) {
  // Use first 3 letters of name, fallback to 'CPM' if name is short/missing
  const namePrefix = (name && name.length >= 3) ? name.substring(0, 3).toUpperCase() : 'CPM';
  const cleanNamePrefix = namePrefix.replace(/[^A-Z0-9]/g, 'X'); // safety

  let typeSuffix = 'GM'; // General Merchandise
  if (businessType === 'printing_press') typeSuffix = 'PP';
  else if (businessType === 'manufacturing') typeSuffix = 'MC';

  const prefix = `${cleanNamePrefix}-${typeSuffix}`;

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

// New helper to ensure image sources are buffers (handles URLs, Local Paths, and Data URLs)
async function getImageBuffer(val) {
  const source = resolveImageSource(val);
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;
  if (typeof source === 'string') {
    if (source.startsWith('http')) {
      try {
        const resp = await axios.get(source, { responseType: 'arraybuffer', timeout: 5000 });
        return Buffer.from(resp.data);
      } catch (e) {
        console.warn('Buffer fetch fail:', source, e.message);
        return null;
      }
    }
    try {
      if (fs.existsSync(source)) return fs.readFileSync(source);
    } catch (_) { }
  }
  return null;
}

function resolveImageSource(val) {
  if (!val || typeof val !== 'string') return null;
  // Handle Data URLs
  if (val.startsWith('data:')) return dataUrlToBuffer(val);

  // Handle external URLs (like Uploadcare)
  if (val.startsWith('http') && !val.includes('/files/')) return val;

  // Handle local /files/ paths or full URLs pointing to our /files/ endpoint
  let fileName = '';
  if (val.startsWith('/files/')) {
    fileName = val.replace('/files/', '');
  } else if (val.includes('/files/')) {
    fileName = val.split('/files/').pop();
  }

  if (fileName) {
    // If it's a branding image, find it in BRANDING_DIR
    if (fileName.startsWith('branding/')) {
      const bFile = fileName.replace('branding/', '');
      const bPath = path.join(BRANDING_DIR, bFile);
      if (fs.existsSync(bPath)) return bPath;
    }

    const full = path.join(GENERATED_DIR, fileName);
    if (fs.existsSync(full)) return full;
  }
  return null;
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
    // Ensure DB is connected for serverless environment
    await connectToDatabase();

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
      name: (name || '').trim(),
      address: (address || '').trim(),
      email: (email || '').trim() || undefined,
      phone: (phone || '').trim() || undefined,
      logo,
      signature,
      brandColor,
      currencySymbol,
      currencyCode,
      termsAndConditions,
      bankName: (bankName || '').trim(),
      accountName: (accountName || bankAccountName || '').trim(),
      accountNumber: (accountNumber || bankAccountNumber || '').trim() || undefined,
      invoiceTemplate: typeof invoiceTemplate === 'string' ? invoiceTemplate : 'classic',
      receiptTemplate: typeof receiptTemplate === 'string' ? receiptTemplate : 'classic',
      businessType: businessType || 'general_merchandise',
    };

    // Try DB, but don't fail registration if DB is down
    // Try DB; fail if DB save fails to ensure persistence
    try {
      const doc = new Company(entry);
      await doc.save();
    } catch (dbErr) {
      console.error('Register DB save failed:', dbErr);
      return res.status(500).json({ success: false, message: 'Database save failed: ' + dbErr.message });
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
    let { companyId, ...updates } = req.body;
    companyId = (companyId || '').trim();
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });

    console.log('Updating company:', companyId);

    // Find existing company (DB or File)
    let companyDoc = null;
    try { companyDoc = await Company.findOne({ companyId }); } catch (_) { }

    let fileCompany = findCompanyFile(companyId);
    if (!companyDoc && !fileCompany) return res.status(404).json({ success: false, message: 'Company not found' });
    // ...
    // ...


    // Prepare pure data object
    // If we have a generic object from file, use it. If DB doc, convert to object.
    const currentData = companyDoc ? companyDoc.toObject() : (fileCompany || {});

    // Allowed fields to update directly
    const allowedFields = [
      'name', 'address', 'email', 'phone', 'brandColor', 'country',
      'currencySymbol', 'currencyCode', 'bankName', 'accountName',
      'accountNumber', 'bankAccountName', 'bankAccountNumber',
      'invoiceTemplate', 'receiptTemplate', 'termsAndConditions', 'businessType',
      'isPremium'
    ];

    // Apply text updates
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        let val = updates[field];
        if (typeof val === 'string') {
          val = val.trim();
          // For unique/sparse fields, treat empty string as undefined so it doesn't conflict
          if (['email', 'phone', 'accountNumber', 'bankAccountNumber'].includes(field) && !val) {
            val = undefined;
          }
        }
        currentData[field] = val;
      }
    });

    // Special mapping for common legacy keys in updates
    if (updates.bankAccountNumber !== undefined) currentData.accountNumber = (updates.bankAccountNumber || '').trim() || undefined;
    if (updates.bankAccountName !== undefined) currentData.accountName = (updates.bankAccountName || '').trim();

    // Handle Images - specific logic for explicit changes
    if (updates.logo && typeof updates.logo === 'string' && updates.logo.startsWith('data:')) {
      const oldUrl = currentData.logo;
      currentData.logo = await optimizeImageDataUrl(updates.logo, 'logo');
      if (oldUrl && oldUrl !== currentData.logo) deleteFromUploadcare(oldUrl);
    } else if (updates.logo === null) {
      if (currentData.logo) deleteFromUploadcare(currentData.logo);
      currentData.logo = null;
    } else if (updates.logo && typeof updates.logo === 'string' && updates.logo.startsWith('http') && updates.logo !== currentData.logo) {
      // If client sends a direct URL (like from frontend Uploadcare), update it and delete old
      const oldUrl = currentData.logo;
      currentData.logo = updates.logo;
      if (oldUrl && oldUrl !== currentData.logo) deleteFromUploadcare(oldUrl);
    }

    if (updates.signature && typeof updates.signature === 'string' && updates.signature.startsWith('data:')) {
      const oldUrl = currentData.signature;
      currentData.signature = await optimizeImageDataUrl(updates.signature, 'signature');
      if (oldUrl && oldUrl !== currentData.signature) deleteFromUploadcare(oldUrl);
    } else if (updates.signature === null) {
      if (currentData.signature) deleteFromUploadcare(currentData.signature);
      currentData.signature = null;
    } else if (updates.signature && typeof updates.signature === 'string' && updates.signature.startsWith('http') && updates.signature !== currentData.signature) {
      const oldUrl = currentData.signature;
      currentData.signature = updates.signature;
      if (oldUrl && oldUrl !== currentData.signature) deleteFromUploadcare(oldUrl);
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
// Helper: draw invoice by template style (pdfkit)
// Helper: draw invoice by template style (pdfkit)
async function drawInvoiceByTemplate(doc, company, invNo, invoiceDate, dueDate, customer, items) {
  const template = (company.invoiceTemplate || 'classic').toLowerCase();
  const theme = {
    classic: { primary: '#1e3050', accent: '#334155', tableHeader: '#f8fafc' },
    modern: { primary: '#1e3050', accent: '#3b82f6', tableHeader: '#eff6ff' },
    minimal: { primary: '#0f172a', accent: '#64748b', tableHeader: '#f1f5f9' },
    bold: { primary: '#1e3050', accent: '#1d4ed8', tableHeader: '#f1f5f9' },
    compact: { primary: '#1e3050', accent: '#0f172a', tableHeader: '#f8fafc' },
  }[template] || { primary: '#1e3050', accent: '#334155', tableHeader: '#f8fafc' };

  if (company.brandColor && /^#?[0-9a-fA-F]{3,6}$/.test(company.brandColor)) {
    theme.primary = company.brandColor.startsWith('#') ? company.brandColor : `#${company.brandColor}`;
  }

  const curr = (company.currencySymbol && String(company.currencySymbol).trim()) || '₦';
  const pageLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header Accent
  doc.rect(0, 0, doc.page.width, 40).fill(theme.primary);

  let y = 60;

  // Logo
  try {
    const logoBuffer = await getImageBuffer(company.logo);
    if (logoBuffer) {
      doc.image(logoBuffer, pageLeft, y, { width: 80 });
    } else {
      doc.fontSize(20).fillColor(theme.primary).text((company.name || company.companyName || 'C').charAt(0), pageLeft, y);
    }
  } catch (_) { }

  // Title
  doc.fontSize(28).fillColor(theme.primary).text('INVOICE', pageLeft, y, { align: 'right', width: pageWidth });
  doc.fontSize(12).fillColor('#64748b').text(`#${invNo}`, { align: 'right', width: pageWidth });
  doc.text(dayjs(invoiceDate).format('YYYY-MM-DD'), { align: 'right', width: pageWidth });

  y = Math.max(doc.y + 40, y + 80);

  // Address Section
  doc.fontSize(10).fillColor('#94a3b8').text('BILL TO:', pageLeft, y);
  doc.text('FROM:', pageLeft + pageWidth / 2, y);
  doc.moveDown(0.3);

  const addrY = doc.y;
  doc.fontSize(13).fillColor('#1e293b').text(customer.name || 'Client Name', pageLeft, addrY, { width: pageWidth / 2 - 20 });
  doc.fontSize(10).fillColor('#475569').text(customer.address || '', { width: pageWidth / 2 - 20 });

  doc.fontSize(13).fillColor('#1e293b').text(company.name || company.companyName || 'Company', pageLeft + pageWidth / 2, addrY, { width: pageWidth / 2 });
  doc.fontSize(10).fillColor('#475569').text(company.address || '', { width: pageWidth / 2 });
  doc.text(company.email || '');
  doc.text(company.phone || company.phoneNumber || '');

  y = Math.max(doc.y + 30, addrY + 100);

  // Items Table
  const colDesc = pageWidth * 0.55;
  const colQty = pageWidth * 0.1;
  const colPrice = pageWidth * 0.15;
  const colTotal = pageWidth * 0.2;

  doc.rect(pageLeft, y, pageWidth, 25).fill(theme.tableHeader);
  doc.fillColor(theme.primary).fontSize(10).text('DESCRIPTION', pageLeft + 10, y + 8);
  doc.text('QTY', pageLeft + colDesc, y + 8, { width: colQty, align: 'center' });
  doc.text('PRICE', pageLeft + colDesc + colQty, y + 8, { width: colPrice, align: 'right' });
  doc.text('TOTAL', pageLeft + colDesc + colQty + colPrice, y + 8, { width: colTotal - 10, align: 'right' });

  y += 25;
  let subtotalValue = 0;
  items.forEach((it, i) => {
    const total = (Number(it.qty || 0) * Number(it.price || 0));
    subtotalValue += total;

    if (y > doc.page.height - 150) {
      doc.addPage();
      y = 50;
    }

    if (i % 2 === 1) doc.rect(pageLeft, y, pageWidth, 22).fill('#f8fafc');

    doc.fillColor('#334155').fontSize(10).text(it.description || '', pageLeft + 10, y + 6, { width: colDesc });
    doc.text(String(it.qty || 0), pageLeft + colDesc, y + 6, { width: colQty, align: 'center' });
    doc.text(`${curr}${Number(it.price || 0).toFixed(2)}`, pageLeft + colDesc + colQty, y + 6, { width: colPrice, align: 'right' });
    doc.text(`${curr}${total.toFixed(2)}`, pageLeft + colDesc + colQty + colPrice, y + 6, { width: colTotal - 10, align: 'right' });
    y += 22;
  });

  // Totals
  y += 20;
  doc.moveTo(pageLeft + colDesc, y).lineTo(pageLeft + pageWidth, y).stroke('#e2e8f0');
  y += 10;
  doc.fontSize(16).fillColor(theme.primary).text('TOTAL DUE:', pageLeft + colDesc, y, { width: colPrice, align: 'right' });
  doc.text(`${curr}${subtotalValue.toFixed(2)}`, pageLeft + colDesc + colPrice, y, { width: colTotal - 10, align: 'right' });

  // Signature
  y = Math.max(doc.y + 50, doc.page.height - 180);
  try {
    const sigBuffer = await getImageBuffer(company.signature);
    if (sigBuffer) doc.image(sigBuffer, pageLeft + pageWidth - 140, y, { width: 120 });
  } catch (_) { }
  doc.moveTo(pageLeft + pageWidth - 140, y + 45).lineTo(pageLeft + pageWidth, y + 45).stroke('#1e293b');
  doc.fontSize(9).fillColor('#64748b').text('Authorized Signature', pageLeft + pageWidth - 140, y + 50, { align: 'center', width: 140 });

  const footerText = template === 'classic'
    ? `This document is legally binding and generated via YMOBooks Accounting . Copyright@${new Date().getFullYear()}`
    : `This document is legally binding and generated by ${company.name || company.companyName || 'Company'}. Any alteration renders this invoice invalid - @ copyright${new Date().getFullYear()}`;
  doc.fontSize(8).fillColor('#94a3b8').text(footerText, pageLeft, doc.page.height - 40, { align: 'center', width: pageWidth });
}

// Helper: draw receipt by template style
async function drawReceiptByTemplate(doc, company, rctNo, receiptDate, invoiceNumber, customer, amountPaid, items = []) {
  const template = (company.receiptTemplate || company.invoiceTemplate || 'modern').toLowerCase();
  const theme = {
    classic: { primary: '#10b981', secondary: '#059669', tableHeader: '#f8fafc' },
    modern: { primary: '#10b981', secondary: '#34d399', tableHeader: '#eff6ff' },
    minimal: { primary: '#0f172a', secondary: '#cbd5e1', tableHeader: '#f1f5f9' },
    bold: { primary: '#10b981', secondary: '#047857', tableHeader: '#f1f5f9' },
    compact: { primary: '#10b981', secondary: '#065f46', tableHeader: '#f8fafc' },
  }[template] || { primary: '#10b981', secondary: '#059669', tableHeader: '#f8fafc' };

  if (company.brandColor && /^#?[0-9a-fA-F]{3,6}$/.test(company.brandColor)) {
    theme.primary = company.brandColor.startsWith('#') ? company.brandColor : `#${company.brandColor}`;
    theme.secondary = shadeColor(theme.primary, -20);
  }

  const curr = (company.currencySymbol && String(company.currencySymbol).trim()) || '₦';
  const pageLeft = doc.page.margins.left;
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const footerText = template === 'classic'
    ? `This document is legally binding and generated via YMOBooks Accounting . Copyright@${new Date().getFullYear()}`
    : `This document is legally binding and generated by ${company.name || company.companyName || 'Company'}. Any alteration renders this receipt invalid - @ copyright${new Date().getFullYear()}`;

  if (template === 'bold') {
    // --- BOLD TEMPLATE (Sidebar) ---
    doc.rect(0, 0, 80, doc.page.height).fill(theme.primary);

    let y = 50;
    const contentLeft = 100;
    const contentWidth = doc.page.width - 100 - doc.page.margins.right;

    try {
      const sigBuffer = await getImageBuffer(company.logo);
      if (sigBuffer) doc.image(sigBuffer, 15, 50, { width: 50 });
    } catch (_) { }

    doc.fillColor(theme.primary).fontSize(28).text('RECEIPT', contentLeft, y, { align: 'right', width: contentWidth });
    doc.fontSize(12).fillColor('#64748b').text(`#${rctNo}`, contentLeft, y + 35, { align: 'right', width: contentWidth });

    y += 80;
    doc.rect(contentLeft, y, contentWidth, 3).fill(theme.primary);
    y += 20;

    doc.fontSize(10).fillColor('#94a3b8').text('RECEIVED FROM', contentLeft, y);
    doc.fillColor('#1e293b').fontSize(12).text(customer?.name || 'Customer', contentLeft, y + 15, { width: contentWidth / 2 });
    doc.fontSize(9).fillColor('#475569').text(customer?.address || '', contentLeft, y + 30, { width: contentWidth / 2 });

    const rightCol = contentLeft + contentWidth / 2;
    doc.fontSize(10).fillColor('#94a3b8').text('PAYMENT DETAILS', rightCol, y);
    doc.fillColor('#1e293b').fontSize(11).text(`Date: ${dayjs(receiptDate).format('YYYY-MM-DD')}`, rightCol, y + 15);
    if (invoiceNumber) doc.text(`Inv Ref: #${invoiceNumber}`, rightCol, y + 30);

    doc.rect(rightCol, y + 50, 100, 25, 4).fill(theme.primary);
    doc.fillColor('#fff').fontSize(10).text('PAID IN FULL', rightCol, y + 57, { width: 100, align: 'center' });

    y += 100;
    drawItemsTable(doc, items, { x: contentLeft, y, width: contentWidth, theme, curr, amountPaid });
    doc.fontSize(8).fillColor('#94a3b8').text(footerText, contentLeft, doc.page.height - 40, { align: 'center', width: contentWidth });

  } else if (template === 'minimal') {
    // --- MINIMAL TEMPLATE (Clean) ---
    let y = 50;
    try {
      const logoBuffer = await getImageBuffer(company.logo);
      if (logoBuffer) doc.image(logoBuffer, pageLeft, y, { width: 60 });
    } catch (_) { }
    doc.fontSize(24).fillColor('#0f172a').text('Receipt', pageLeft, y + 10, { align: 'right', width: pageWidth });
    doc.fontSize(10).fillColor('#94a3b8').text(`#${rctNo} • ${dayjs(receiptDate).format('MMM DD, YYYY')}`, pageLeft, y + 40, { align: 'right', width: pageWidth });

    y += 80;
    doc.moveTo(pageLeft, y).lineTo(pageLeft + pageWidth, y).stroke('#e2e8f0');
    y += 30;

    doc.fontSize(9).fillColor('#94a3b8').text('BILLED TO', pageLeft, y);
    doc.fillColor('#0f172a').fontSize(11).text(customer?.name || '', pageLeft, y + 15);
    doc.fontSize(10).fillColor('#64748b').text(customer?.address || '', pageLeft, y + 30);

    const mid = pageLeft + pageWidth / 2;
    doc.fontSize(9).fillColor('#94a3b8').text('ISSUED BY', mid, y);
    doc.fillColor('#0f172a').fontSize(11).text(company.name || '', mid, y + 15);
    doc.fillColor(theme.primary).fontSize(12).text('PAYMENT CONFIRMED', pageLeft, y + 60, { align: 'right', width: pageWidth });

    y += 100;
    drawItemsTable(doc, items, { x: pageLeft, y, width: pageWidth, theme, curr, amountPaid, isMinimal: true });
    doc.fontSize(8).fillColor('#94a3b8').text(footerText, pageLeft, doc.page.height - 40, { align: 'center', width: pageWidth });

  } else if (template === 'modern') {
    // --- MODERN TEMPLATE ---
    doc.rect(0, 0, doc.page.width, 120).fill(theme.primary);
    let y = 40;
    try {
      const logoBuffer = await getImageBuffer(company.logo);
      if (logoBuffer) doc.image(logoBuffer, pageLeft, y, { width: 80 });
    } catch (_) { }
    doc.fillColor('#fff').fontSize(30).text('Receipt', pageLeft, y, { align: 'right', width: pageWidth });
    doc.fontSize(10).opacity(0.8).text(`#${rctNo} | ${dayjs(receiptDate).format('YYYY-MM-DD')}`, pageLeft, y + 40, { align: 'right', width: pageWidth });
    doc.opacity(1);

    y = 150;
    doc.rect(pageLeft, y, pageWidth, 5).fill(theme.secondary);
    doc.rect(pageLeft, y + 5, pageWidth, 75).fill('#f8fafc');

    doc.fillColor('#64748b').fontSize(9).text('RECEIVED FROM', pageLeft + 20, y + 20);
    doc.fillColor('#1e293b').fontSize(12).text(customer?.name || 'Customer', pageLeft + 20, y + 35);
    const mid = pageLeft + pageWidth / 2;
    doc.fillColor('#64748b').fontSize(9).text('PAYMENT STATUS', mid, y + 20);
    doc.fillColor(theme.primary).fontSize(12).font('Helvetica-Bold').text('PAID IN FULL', mid, y + 35);
    doc.font('Helvetica');

    y += 110;
    drawItemsTable(doc, items, { x: pageLeft, y, width: pageWidth, theme, curr, amountPaid });
    doc.fontSize(8).fillColor('#94a3b8').text(footerText, pageLeft, doc.page.height - 40, { align: 'center', width: pageWidth });

  } else if (template === 'compact') {
    // --- COMPACT TEMPLATE ---
    doc.rect(0, 0, doc.page.width, 15).fill(theme.primary);
    let y = 40;
    try {
      const logoBuffer = await getImageBuffer(company.logo);
      if (logoBuffer) {
        doc.image(logoBuffer, pageLeft, y, { width: 50 });
        doc.fillColor(theme.primary).fontSize(20).text('OFFICIAL RECEIPT', pageLeft + 60, y + 10);
      } else {
        doc.fillColor(theme.primary).fontSize(20).text('OFFICIAL RECEIPT', pageLeft, y);
      }
    } catch (_) {
      doc.fillColor(theme.primary).fontSize(20).text('OFFICIAL RECEIPT', pageLeft, y);
    }

    doc.fontSize(10).fillColor('#64748b').text(`No: ${rctNo}`, pageLeft, y + 35, { align: 'right', width: pageWidth });
    doc.text(`Date: ${dayjs(receiptDate).format('DD/MM/YYYY')}`, pageLeft, y + 50, { align: 'right', width: pageWidth });
    y += 65;

    doc.rect(pageLeft, y, pageWidth, 25).fill('#f1f5f9');
    doc.fillColor('#334155').fontSize(10).text(`Received from: ${customer?.name || ''}   ${invoiceNumber ? `(Re: Invoice #${invoiceNumber})` : ''}`, pageLeft + 10, y + 8);

    y += 40;
    drawItemsTable(doc, items, { x: pageLeft, y, width: pageWidth, theme, curr, amountPaid });
    doc.fontSize(8).fillColor('#94a3b8').text(footerText, pageLeft, doc.page.height - 40, { align: 'center', width: pageWidth });

  } else {
    // --- CLASSIC TEMPLATE ---
    doc.rect(0, 0, doc.page.width, 100).fill(theme.primary);
    doc.fillColor('#fff').fontSize(26).text('OFFICIAL RECEIPT', pageLeft, 35);
    doc.fontSize(14).text(`#${rctNo}`, pageLeft, 70);

    doc.rect(pageLeft + pageWidth - 130, 35, 130, 30, 5).fill('#fff');
    doc.fillColor(theme.primary).fontSize(11).text('PAID IN FULL', pageLeft + pageWidth - 130, 44, { width: 130, align: 'center' });

    let y = 130;
    doc.fontSize(10).fillColor('#94a3b8').text('RECEIVED FROM:', pageLeft, y);
    doc.text('FOR:', pageLeft + pageWidth / 2, y);
    doc.moveDown(0.3);

    const addrY = doc.y;
    doc.fontSize(14).fillColor('#1e293b').text(customer?.name || 'Customer Name', pageLeft, addrY, { width: pageWidth / 2 - 20 });
    doc.fontSize(10).fillColor('#475569').text(customer?.address || '', { width: pageWidth / 2 - 20 });

    doc.fontSize(14).fillColor('#1e293b').text(company.name || company.companyName || 'Company Name', pageLeft + pageWidth / 2, addrY, { width: pageWidth / 2 });
    doc.fontSize(10).fillColor('#475569').text(`Date: ${dayjs(receiptDate).format('YYYY-MM-DD')}`);
    if (invoiceNumber) doc.text(`Invoice Ref: #${invoiceNumber}`);

    y = Math.max(doc.y + 40, addrY + 80);
    drawItemsTable(doc, items, { x: pageLeft, y, width: pageWidth, theme, curr, amountPaid });

    // Signature
    y = doc.y + 20;
    try {
      const sigBuffer = await getImageBuffer(company.signature);
      if (sigBuffer) doc.image(sigBuffer, pageLeft, y, { width: 120 });
    } catch (_) { }
    doc.moveTo(pageLeft, y + 50).lineTo(pageLeft + 180, y + 50).stroke('#1e293b');
    doc.fontSize(10).fillColor('#64748b').text('Authorized Receiver Signature', pageLeft, y + 55);

    doc.fontSize(8).fillColor('#94a3b8').text(footerText, pageLeft, doc.page.height - 40, { align: 'center', width: pageWidth });
  }
}

// Helper: Common Table Drawer for Receipts
function drawItemsTable(doc, items, { x, y, width, theme, curr, amountPaid, isMinimal = false }) {
  const colDesc = width * 0.55;
  const colQty = width * 0.1;
  const colPrice = width * 0.15;
  const colTotal = width * 0.2;

  // Header
  if (!isMinimal) doc.rect(x, y, width, 25).fill(theme.tableHeader);

  doc.fillColor(isMinimal ? '#64748b' : theme.primary).fontSize(10).text('SERVICES/ITEMS PAID FOR', x + 10, y + 8);
  doc.text('QTY', x + colDesc, y + 8, { width: colQty, align: 'center' });
  doc.text('PRICE', x + colDesc + colQty, y + 8, { width: colPrice, align: 'right' });
  doc.text('TOTAL', x + colDesc + colQty + colPrice, y + 8, { width: colTotal - 10, align: 'right' });

  if (isMinimal) doc.moveTo(x, y + 25).lineTo(x + width, y + 25).stroke('#e2e8f0');

  y += 25;
  let subtotalValue = 0;
  const activeItems = (Array.isArray(items) && items.length > 0) ? items : [{ description: 'General Payment', qty: 1, price: amountPaid }];

  activeItems.forEach((it, i) => {
    const total = (Number(it.qty || 0) * Number(it.price || 0));
    subtotalValue += total;

    if (y > doc.page.height - 150) {
      doc.addPage();
      y = 50;
    }

    if (!isMinimal && i % 2 === 1) doc.rect(x, y, width, 22).fill('#f8fafc');

    doc.fillColor('#334155').fontSize(10).text(it.description || it.desc || '', x + 10, y + 6, { width: colDesc });
    doc.text(String(it.qty || 0), x + colDesc, y + 6, { width: colQty, align: 'center' });
    doc.text(`${curr}${Number(it.price || 0).toFixed(2)}`, x + colDesc + colQty, y + 6, { width: colPrice, align: 'right' });
    doc.text(`${curr}${total.toFixed(2)}`, x + colDesc + colQty + colPrice, y + 6, { width: colTotal - 10, align: 'right' });
    y += 22;
  });

  y += 20;
  // Total Box
  if (isMinimal) {
    doc.moveTo(x + width / 2, y).lineTo(x + width, y).stroke('#e2e8f0');
    y += 10;
  } else {
    doc.rect(x, y, width, 60).fill('#f8fafc');
    doc.rect(x, y, 5, 60).fill(theme.primary);
    y += 12;
  }
  doc.fillColor(theme.primary).fontSize(30).text(`${curr}${Number(amountPaid).toFixed(2)}`, x + 20, y);
  if (!isMinimal) doc.fontSize(10).fillColor('#64748b').text('Total Payment Confirmed', x + width - 170, y + 13);
}

// Create invoice PDF (A4, multi-page if needed)
app.post('/api/invoice/create', async (req, res) => {
  try {
    const {
      companyId, invoiceNumber, invoiceDate, dueDate, customer = {},
      items = [], template, brandColor, companyOverride, category = 'general'
    } = req.body;
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
    await drawInvoiceByTemplate(doc, companyForRender, invNo, invoiceDate, dueDate, customer, items);

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
          category,
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
    const {
      companyId, invoiceNumber, receiptNumber, receiptDate, customer = {},
      amountPaid, items = [], category = 'general'
    } = req.body;
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
    let derivedItems = Array.isArray(items) ? items : [];
    let derivedCategory = category;
    if ((!derivedCustomer?.name || derivedAmount == null || !derivedItems.length || derivedCategory === 'general') && invoiceNumber) {
      try {
        const invDoc = await Invoice.findOne({ companyId, invoiceNumber }).lean();
        if (invDoc) {
          if (!derivedCustomer?.name) derivedCustomer = invDoc.customer || derivedCustomer;
          if (derivedAmount == null) derivedAmount = Number(invDoc.grandTotal || 0);
          if (!derivedItems.length) derivedItems = invDoc.items || [];
          if (derivedCategory === 'general' && invDoc.category) derivedCategory = invDoc.category;
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

    const companyForReceipt = { ...company, currencySymbol: derivedCurrency };
    await drawReceiptByTemplate(doc, companyForReceipt, rctNo, receiptDate, invoiceNumber, derivedCustomer, derivedAmount, derivedItems);

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
          currencyCode: (company?.currencyCode) || mapSymbolToCode(derivedCurrency),
          customer: {
            name: derivedCustomer?.name,
            address: derivedCustomer?.address,
            contact: derivedCustomer?.contact,
          },
          items: derivedItems,
          amountPaid: Number(derivedAmount || 0),
          pdfPath,
          category: derivedCategory,
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
    const { companyId, months = 6, category } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    const since = dayjs().subtract(Number(months), 'month').toDate();
    let list = [];
    try {
      const q = { companyId, createdAt: { $gte: since } };
      if (category) q.category = category;
      list = await Receipt.find(q)
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
    if (!category) return res.status(400).json({ success: false, message: 'Missing category' });
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

// --- Manufacturing: Stock Management Endpoints ---

// Create Stock Item
app.post('/api/stock/create', async (req, res) => {
  try {
    const { companyId, name, type, quantity, unit, costPrice, sellingPrice, minStockLevel, description, bom } = req.body;
    if (!companyId || !name) return res.status(400).json({ success: false, message: 'Company ID and Name are required' });

    // Enforce business type check if needed, but for now rely on frontend filtering
    const newItem = await StockItem.create({
      companyId,
      name,
      type: type || 'raw_material',
      quantity: Number(quantity || 0),
      unit: unit || 'units',
      costPrice: Number(costPrice || 0),
      sellingPrice: Number(sellingPrice || 0),
      minStockLevel: Number(minStockLevel || 0),
      description,
      bom: bom || []
    });
    return res.json({ success: true, item: newItem });
  } catch (err) {
    console.error('Create stock error:', err);
    return res.status(500).json({ success: false, message: 'Server error creating stock item' });
  }
});

// List Stock Items
app.get('/api/stock', async (req, res) => {
  try {
    const { companyId, type } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });

    const query = { companyId };
    if (type) query.type = type;

    const items = await StockItem.find(query).sort({ name: 1 }).lean();
    return res.json({ success: true, items });
  } catch (err) {
    console.error('List stock error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching stock' });
  }
});

// Update Stock Item (Edit details or adjust quantity)
app.post('/api/stock/update', async (req, res) => {
  try {
    const { id, updates } = req.body;
    if (!id || !updates) return res.status(400).json({ success: false, message: 'Item ID and updates required' });

    const updated = await StockItem.findByIdAndUpdate(id, { $set: updates }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: 'Stock item not found' });

    return res.json({ success: true, item: updated });
  } catch (err) {
    console.error('Update stock error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating stock item' });
  }
});

// Delete Stock Item
app.delete('/api/stock/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await StockItem.findByIdAndDelete(id);
    if (!deleted) return res.status(404).json({ success: false, message: 'Stock item not found' });
    return res.json({ success: true, id });
  } catch (err) {
    console.error('Delete stock error:', err);
    return res.status(500).json({ success: false, message: 'Server error deleting stock item' });
  }
});

// Record Production
app.post('/api/production/record', async (req, res) => {
  try {
    const { companyId, finishedGoodId, quantityProduced, materialsUsed, notes } = req.body;
    if (!companyId || !finishedGoodId || !quantityProduced) {
      return res.status(400).json({ success: false, message: 'Missing required production data' });
    }

    // 1. Record the production log
    const log = await ProductionLog.create({
      companyId,
      finishedGoodId,
      quantityProduced: Number(quantityProduced),
      materialsUsed: materialsUsed || [],
      notes
    });

    // 2. Update Finished Good quantity (Add)
    await StockItem.findByIdAndUpdate(finishedGoodId, {
      $inc: { quantity: Number(quantityProduced) }
    });

    // 3. Update Raw Materials quantities (Subtract)
    if (materialsUsed && Array.isArray(materialsUsed)) {
      const updates = materialsUsed.map(m =>
        StockItem.findByIdAndUpdate(m.materialId, {
          $inc: { quantity: -Number(m.quantity) }
        })
      );
      await Promise.all(updates);
    }

    return res.json({ success: true, log });
  } catch (err) {
    console.error('Record production error:', err);
    return res.status(500).json({ success: false, message: 'Server error recording production' });
  }
});

// List Production Logs
app.get('/api/production/history', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });

    const logs = await ProductionLog.find({ companyId })
      .populate('finishedGoodId', 'name unit')
      .populate('materialsUsed.materialId', 'name unit')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({ success: true, logs });
  } catch (err) {
    console.error('List production history error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching production history' });
  }
});

// Finance summary by currency for a month
app.get('/api/finance/summary', async (req, res) => {
  try {
    const { companyId, month, category } = req.query;
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
    const receiptQuery = { companyId, receiptDate: { $gte: start, $lte: end } };
    if (category) receiptQuery.category = category;

    const receipts = await Receipt.find(receiptQuery).lean();
    const totalRevenue = receipts.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);
    const jobCount = receipts.length;
    const avgValue = jobCount > 0 ? totalRevenue / jobCount : 0;

    // Expenses (single currency)
    const expenseQuery = { companyId, month: m };
    if (category) {
      // If a specific category is requested, we only want those expenses
      expenseQuery.category = category;
    }

    const expenses = await Expense.find(expenseQuery).lean();
    let productionCost = 0;
    let runningExpenses = 0;
    const productionCategories = ['production', 'large_format', 'di_printing', 'dtf_prints', 'photo_frames'];

    expenses.forEach((e) => {
      if (productionCategories.includes(String(e.category))) {
        productionCost += Number(e.amount || 0);
      } else {
        runningExpenses += Number(e.amount || 0);
      }
    });
    const totalExpenses = productionCost + runningExpenses;

    const netProfit = Number(totalRevenue || 0) - Number(totalExpenses || 0);

    // Breakdown for reporting
    const breakdown = {};
    if (!category) {
      const categories = ['large_format', 'di_printing', 'dtf_prints', 'photo_frames', 'general'];
      categories.forEach(cat => {
        const catRev = receipts.filter(r => (r.category || 'general') === cat).reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);
        const catExp = expenses.filter(e => e.category === cat).reduce((sum, e) => sum + Number(e.amount || 0), 0);
        if (catRev > 0 || catExp > 0) {
          breakdown[cat] = { revenue: catRev, expenses: catExp, net: catRev - catExp };
        }
      });
    }

    // Align response to simple number fields for client
    return res.json({
      success: true, summary: {
        month: m,
        currencyCode: code,
        symbol: sym,
        revenue: Number(totalRevenue || 0),
        expenses: { productionCost, runningExpenses, totalExpenses },
        net: Number(netProfit || 0),
        jobCount,
        avgValue,
        breakdown
      }
    });
  } catch (err) {
    console.error('Finance summary error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing summary' });
  }
});

// Balance Sheet - Wealth Statement for Manufacturing
app.get('/api/finance/balance-sheet', async (req, res) => {
  try {
    const { companyId } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });

    // 1. Inventory Assets (Stock Value)
    const items = await StockItem.find({ companyId }).lean();
    const inventoryValue = items.reduce((sum, item) => sum + (Number(item.quantity || 0) * Number(item.costPrice || 0)), 0);

    // 2. Accounts Receivable (Unpaid Invoices)
    const unpaidInvoices = await Invoice.find({ companyId, status: 'unpaid' }).lean();
    const accountsReceivable = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.grandTotal || 0), 0);

    // 3. Cash Estimation (All Receipts - All Expenses)
    const receipts = await Receipt.find({ companyId }).lean();
    const totalCashIn = receipts.reduce((sum, r) => sum + Number(r.amountPaid || 0), 0);

    const expenses = await Expense.find({ companyId }).lean();
    const totalCashOut = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const cashAtBank = totalCashIn - totalCashOut;

    // 4. Resolve Company Currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);

    const totalAssets = inventoryValue + accountsReceivable + cashAtBank;

    return res.json({
      success: true,
      balanceSheet: {
        assets: {
          inventoryValue,
          accountsReceivable,
          cashAtBank,
          totalAssets
        },
        liabilities: {
          shortTermDebt: 0, // Placeholder
          totalLiabilities: 0
        },
        equity: {
          netWorth: totalAssets // Assets - Liabilities
        },
        currency: {
          symbol: company?.currencySymbol || '$',
          code: company?.currencyCode || 'UNK'
        }
      }
    });
  } catch (err) {
    console.error('Balance Sheet error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing balance sheet' });
  }
});

// Daily revenue totals from receipts for a given month (31 days)
app.get('/api/finance/revenue-daily', async (req, res) => {
  try {
    const { companyId, month, category } = req.query;
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
    const receiptQuery = {
      companyId, $or: [
        { receiptDate: { $gte: start, $lte: end } },
        { receiptDate: { $exists: false }, createdAt: { $gte: start, $lte: end } },
      ]
    };
    if (category && category !== 'expense') receiptQuery.category = category;

    const receipts = await Receipt.find(receiptQuery).lean();
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

    const cat = String(req.query.category || 'expense');
    const expenses = await Expense.find({ companyId, month: m, category: cat }).lean();
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
    return res.json({ success: true, month: m, currencyCode: code, symbol: sym, days, total, category: cat });
  } catch (err) {
    console.error('Expenses daily error:', err);
    return res.status(500).json({ success: false, message: 'Server error computing daily expenses' });
  }
});

// Upsert a daily expense value for a given company and month
app.post('/api/finance/expenses-daily', async (req, res) => {
  try {
    const { companyId, month, day, amount, category } = req.body || {};
    if (!companyId) return res.status(400).json({ success: false, message: 'Missing companyId' });
    const m = String(month || dayjs().format('YYYY-MM'));
    const d = Number(day);
    const amt = Number(amount);
    const cat = String(category || 'expense');
    if (!d || d < 1 || d > 31) return res.status(400).json({ success: false, message: 'Invalid day' });
    if (amt == null || isNaN(amt) || amt < 0) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // Resolve company currency
    let company;
    try { company = await Company.findOne({ companyId }).lean(); } catch (_) { }
    if (!company) company = findCompanyFile(companyId);
    const sym = company?.currencySymbol || '$';
    const code = company?.currencyCode || mapSymbolToCode(sym) || 'UNK';

    // Remove existing entry for this day and category to avoid duplication
    await Expense.deleteMany({ companyId, month: m, category: cat, day: d });
    // Create new entry
    const created = await Expense.create({ companyId, month: m, category: cat, amount: amt, currencySymbol: sym, currencyCode: code, description: `Daily ${cat === 'production' ? 'Production Cost' : 'Expense'} D${d}`, day: d });
    return res.json({ success: true, expense: created });
  } catch (err) {
    console.error('Expenses daily upsert error:', err);
    return res.status(500).json({ success: false, message: 'Server error saving daily expense' });
  }
});

// Fetch invoice history for last N months (default 6)
app.get('/api/invoices', async (req, res) => {
  try {
    const { companyId, months = 6, category } = req.query;
    if (!companyId) return res.status(400).json({ success: false, message: 'companyId is required' });
    const since = dayjs().subtract(Number(months), 'month').toDate();
    let list = [];
    try {
      const q = { companyId, createdAt: { $gte: since } };
      if (category) q.category = category;
      list = await Invoice.find(q)
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

    // Normalize ID
    const searchId = String(companyId).trim();
    // Admin bypass
    const adminIds = ['PBMSRV', 'PBMSRVR'];
    if (adminIds.includes(searchId.toUpperCase())) {
      const adminStub = {
        companyId: searchId.toUpperCase(),
        name: 'System Admin',
        businessType: businessType || 'admin',
        isPremium: true
      };
      return res.json({ success: true, company: adminStub });
    }

    let fileCompany = findCompanyFile(searchId);
    let dbCompany = null;
    try {
      // Try exact match first
      dbCompany = await Company.findOne({ companyId: searchId }).lean();

      // If not found, try case-insensitive
      if (!dbCompany) {
        dbCompany = await Company.findOne({ companyId: { $regex: new RegExp(`^${searchId}$`, 'i') } }).lean();
      }
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

// --- Payment Gateway (Flutterwave) ---
// User provided Live credentials
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || 'FLWPUBK-295adda62f8a6f453f78cbab2e50d3a1-X';
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || 'FLWSECK-0b3e64a8eb324bfd9f9ff14c86555c7d-19c25961147vt-X';
const FLW_ENCRYPTION_KEY = process.env.FLW_ENCRYPTION_KEY || '0b3e64a8eb32c075ad057f2f';
const FLW_SECRET_HASH = process.env.FLW_SECRET_HASH || 'ymobooks_secure_hash'; // Use this in your Flutterwave Dashboard

app.post('/api/pay/initiate', async (req, res) => {
  try {
    const { companyId, userEmail, currency } = req.body;
    const tx_ref = `tx-${companyId}-${Date.now()}`;

    // Fixed Exchange Rates (Base $5 USD)
    // You should update these rates periodically or fetch from a live API for accuracy
    let paymentAmount = 5; // Default USD
    let paymentCurrency = 'USD';

    switch (currency) {
      case 'NGN':
        paymentAmount = 8000; // $5 * 1600 (approx)
        paymentCurrency = 'NGN';
        break;
      case 'GBP':
        paymentAmount = 4; // $5 * 0.8
        paymentCurrency = 'GBP';
        break;
      case 'EUR':
        paymentAmount = 4.60; // $5 * 0.92
        paymentCurrency = 'EUR';
        break;
      case 'GHS':
        paymentAmount = 80; // $5 * 16
        paymentCurrency = 'GHS';
        break;
      case 'KES':
        paymentAmount = 750; // $5 * 150
        paymentCurrency = 'KES';
        break;
      default:
        paymentAmount = 5;
        paymentCurrency = 'USD';
        break;
    }

    const payload = {
      tx_ref,
      amount: paymentAmount.toString(),
      currency: paymentCurrency,
      redirect_url: 'https://ymobooks.com/payment-callback',
      customer: {
        email: userEmail,
        name: companyId
      },
      customizations: {
        title: 'YMOBooks Pro Upgrade',
        description: 'One-time premium subscription'
      },
      meta: {
        companyId
      }
    };

    const response = await axios.post('https://api.flutterwave.com/v3/payments', payload, {
      headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` }
    });

    if (response.data.status === 'success') {
      res.json({ success: true, link: response.data.data.link });
    } else {
      res.status(400).json({ success: false, message: 'Payment initialization failed' });
    }
  } catch (error) {
    // console.error('Payment init error:', error.response?.data || error.message);
    // For now, return mock link if key is invalid/test
    res.json({ success: true, link: `https://checkout.flutterwave.com/v3/hosted/pay` });
  }
});

app.post('/api/pay/webhook', async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature || signature !== FLW_SECRET_HASH) {
    // return res.status(401).send('Unauthorized');
  }
  // ... logic to update DB ...
  res.status(200).send('OK');
});

// Vercel serverless: export the Express app instead of listening
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`YMOBooks backend listening on http://localhost:${PORT}`);
  });
}
