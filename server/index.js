const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI; // Set in environment. If unset, server uses file fallback.
const PUBLIC_DIR = path.join(__dirname, 'public');

app.use(cors());
app.use(express.json({ limit: '8mb' }));
// Serve static public assets (landing page)
app.use(express.static(PUBLIC_DIR));
// Serve generated files (PDFs)
const GENERATED_DIR = path.join(process.env.GENERATED_ROOT || __dirname, 'generated');
const INVOICES_DIR = path.join(GENERATED_DIR, 'invoices');
fs.mkdirSync(INVOICES_DIR, { recursive: true });
app.use('/files', express.static(GENERATED_DIR));

// Local file fallback store for companies when Mongo is unavailable
const COMPANIES_FILE = process.env.COMPANIES_FILE || path.join(__dirname, 'companies.json');
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

// Mongo connection (optional)
let DB_CONNECTED = false;
if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
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
const CompanySchema = new mongoose.Schema(
  {
    companyId: { type: String, unique: true, index: true },
    name: { type: String, required: true, unique: true, sparse: true },
    address: { type: String },
    email: { type: String, unique: true, sparse: true },
    phone: { type: String, unique: true, sparse: true },
    logo: { type: String }, // base64 or URL
    signature: { type: String }, // base64 or URL (optional)
    // Bank details
    bankName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String, unique: true, sparse: true },
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

// Helpers
async function generateCompanyId(name) {
  const prefix = (name || 'CMP').replace(/[^a-zA-Z0-9]/g, '').slice(0, 3).toUpperCase();
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

// Routes
app.post('/api/register-company', async (req, res) => {
  try {
    const { name, address, email, phone, logo, signature, bankName, accountName, accountNumber, bankAccountName, bankAccountNumber } = req.body;
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

    const companyId = await generateCompanyId(name);
    const entry = {
      companyId,
      name,
      address,
      email,
      phone,
      logo,
      signature,
      bankName,
      accountName: accountName || bankAccountName,
      accountNumber: accountNumber || bankAccountNumber,
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
app.post('/api/update-company', async (req, res) => {
  try {
    const { companyId, name, address, email, phone, logo, signature, bankName, accountName, accountNumber, bankAccountName, bankAccountNumber } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    const update = {
      name,
      address,
      email,
      phone,
      logo,
      signature,
      bankName,
      accountName: accountName || bankAccountName,
      accountNumber: accountNumber || bankAccountNumber,
    };
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    // Duplicate checks for updates (exclude current company)
    const uniqueUpdateFields = {};
    if (update.name) uniqueUpdateFields.name = update.name;
    if (update.email) uniqueUpdateFields.email = update.email;
    if (update.phone) uniqueUpdateFields.phone = update.phone;
    if (update.accountNumber) uniqueUpdateFields.accountNumber = update.accountNumber;
    if (Object.keys(uniqueUpdateFields).length > 0) {
      const conflicts = await detectConflicts(uniqueUpdateFields, companyId);
      if (conflicts.length > 0) {
        return res.status(409).json({ success: false, message: 'Duplicate company details detected. Name, email, phone, and account number must be unique.', conflicts });
      }
    }

    // Prefer merging existing DB data with file fallback to preserve logo/signature
    let company;
    try {
      const existing = await Company.findOne({ companyId }).lean();
      const fileExisting = findCompanyFile(companyId) || {};
      const mergedUpdate = { ...(existing || {}), ...(fileExisting || {}), ...update };
      // Ensure we don't set undefined keys
      Object.keys(mergedUpdate).forEach((k) => mergedUpdate[k] === undefined && delete mergedUpdate[k]);
      company = await Company.findOneAndUpdate({ companyId }, { $set: mergedUpdate }, { new: true, upsert: false }).lean();
    } catch (dbErr) {
      console.warn('Update company DB failed, updating file fallback:', dbErr.message);
    }

    // File fallback update
    const fileExisting = findCompanyFile(companyId);
    if (!company && !fileExisting) return res.status(404).json({ success: false, message: 'Company not found' });
    const merged = { ...(fileExisting || {}), companyId, ...update };
    upsertCompanyFile(merged);

    return res.json({ success: true, company: company || merged, message: 'Company updated' });
  } catch (err) {
    console.error('Update company error:', err);
    return res.status(500).json({ success: false, message: 'Server error updating company' });
  }
});

// Create invoice PDF (A4, multi-page if needed)
app.post('/api/invoice/create', async (req, res) => {
  try {
    const { companyId, invoiceNumber, invoiceDate, dueDate, customer = {}, items = [] } = req.body;
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

    // Header: Company name and contact
    doc.fontSize(18).text(company.name || 'Company', { align: 'left' });
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor('#333');
    if (company.address) doc.text(company.address);
    if (company.email) doc.text(company.email);
    if (company.phone) doc.text(company.phone);
    doc.moveDown(0.4);
    // Bank details
    if (company.bankName || company.accountName || company.accountNumber) {
      doc.fontSize(10).fillColor('#000').text(`Bank: ${company.bankName || ''}`);
      doc.text(`Account Name: ${company.accountName || ''}`);
      doc.text(`Account Number: ${company.accountNumber || ''}`);
    }

    // Invoice Meta
    doc.moveDown(0.6);
    doc.fontSize(14).fillColor('#000').text('Invoice', { align: 'right' });
    doc.fontSize(10);
    doc.text(`Invoice No: ${invNo}`, { align: 'right' });
    doc.text(`Invoice Date: ${dayjs(invoiceDate || undefined).isValid() ? dayjs(invoiceDate).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD')}`, { align: 'right' });
    if (dueDate) doc.text(`Due Date: ${dueDate}`, { align: 'right' });

    // Customer section
    doc.moveDown(1);
    doc.fontSize(12).text('Bill To:', { underline: true });
    doc.fontSize(10).fillColor('#333');
    if (customer.name) doc.text(customer.name);
    if (customer.address) doc.text(customer.address);
    if (customer.contact) doc.text(`Contact: ${customer.contact}`);

    // Items table
    doc.moveDown(1);
    const tableTop = doc.y;
    const colQty = 60;
    const colDesc = 260;
    const colUnit = 100;
    const colTotal = 100;
    const startX = doc.page.margins.left;
    const startY = tableTop;
    const rowHeight = 22;

    function drawRow(y, qty, desc, unit, total, header = false) {
      doc.fontSize(header ? 11 : 10).fillColor(header ? '#000' : '#333');
      doc.text(qty, startX, y, { width: colQty });
      doc.text(desc, startX + colQty, y, { width: colDesc });
      doc.text(unit, startX + colQty + colDesc, y, { width: colUnit, align: 'right' });
      doc.text(total, startX + colQty + colDesc + colUnit, y, { width: colTotal, align: 'right' });
    }

    drawRow(startY, 'Qty', 'Description', 'Unit Price', 'Total', true);
    let y = startY + rowHeight;
    let grandTotal = 0;
    items.forEach((it, idx) => {
      const qty = Number(it.qty || 0);
      const unit = Number(it.price || 0);
      const lineTotal = qty * unit;
      grandTotal += lineTotal;

      // Add page if needed
      if (y > doc.page.height - doc.page.margins.bottom - 40) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(y, 'Qty', 'Description', 'Unit Price', 'Total', true);
        y += rowHeight;
      }

      drawRow(y, String(qty), String(it.description || ''), unit.toFixed(2), lineTotal.toFixed(2));
      y += rowHeight;
    });

    doc.moveTo(startX, y).lineTo(startX + colQty + colDesc + colUnit + colTotal, y).stroke('#ddd');
    y += 10;
    doc.fontSize(12).fillColor('#000').text(`Total: ${grandTotal.toFixed(2)}`, startX + colQty + colDesc + colUnit, y, { width: colTotal, align: 'right' });

    // Attachments removed as per requirements

    // Footer
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#777').text('Powered by YMOBooks', { align: 'right' });

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
        await Invoice.create({
          companyId,
          invoiceNumber: invNo,
          invoiceDate: invoiceDate ? dayjs(invoiceDate).toDate() : new Date(),
          dueDate: dueDate ? dayjs(dueDate).toDate() : undefined,
          customer: {
            name: customer.name,
            address: customer.address,
            contact: customer.contact,
          },
          items: persistedItems,
          grandTotal,
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
app.post('/api/login', async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    console.log('Login attempt:', companyId);
    let company;
    try {
      company = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Login DB query failed, using file fallback:', dbErr.message);
    }
    // Only use file fallback when DB is not connected
    if (!company && !DB_CONNECTED) {
      company = findCompanyFile(companyId);
    }
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    return res.json({ success: true, company });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login' });
  }
});

app.get('/api/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    let company;
    try {
      company = await Company.findOne({ companyId }).lean();
    } catch (dbErr) {
      console.warn('Get company DB failed, using file fallback:', dbErr.message);
    }
    if (!company && !DB_CONNECTED) {
      company = findCompanyFile(companyId);
    }
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
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

app.listen(PORT, () => {
  console.log(`YMOBooks backend listening on http://localhost:${PORT}`);
});