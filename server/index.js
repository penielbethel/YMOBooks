const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const dayjs = require('dayjs');

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://pbmsrvr:foraminiferans@ymobooks.4dyqe3f.mongodb.net/ymobooks?retryWrites=true&w=majority&appName=ymobooks';

app.use(cors());
app.use(express.json({ limit: '8mb' }));
// Serve generated files (PDFs)
const GENERATED_DIR = path.join(__dirname, 'generated');
const INVOICES_DIR = path.join(GENERATED_DIR, 'invoices');
fs.mkdirSync(INVOICES_DIR, { recursive: true });
app.use('/files', express.static(GENERATED_DIR));

// Mongo connection
mongoose
  .connect(MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => {
    console.log('Connected to MongoDB Atlas');
  })
  .catch((err) => {
    console.error('MongoDB connection error:', err.message);
  });

// Models
const CompanySchema = new mongoose.Schema(
  {
    companyId: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    address: { type: String },
    email: { type: String },
    phone: { type: String },
    logo: { type: String }, // base64 or URL
    signature: { type: String }, // base64 or URL (optional)
    // Bank details
    bankName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String },
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
  let exists;
  do {
    const suffix = Math.floor(100000 + Math.random() * 900000).toString().slice(0, 5);
    candidate = `${prefix}-${suffix}`;
    exists = await Company.findOne({ companyId: candidate }).lean();
  } while (exists);
  return candidate;
}

// Routes
app.post('/api/register-company', async (req, res) => {
  try {
    const { name, address, email, phone, logo, signature, bankName, accountName, accountNumber } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Company name is required' });

    const companyId = await generateCompanyId(name);

    const doc = new Company({ companyId, name, address, email, phone, logo, signature, bankName, accountName, accountNumber });
    await doc.save();

    return res.json({ success: true, companyId, message: 'Registration successful. Keep and save your Company ID.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

// Update company details (including bank info)
app.post('/api/update-company', async (req, res) => {
  try {
    const { companyId, name, address, email, phone, logo, signature, bankName, accountName, accountNumber } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
    const update = { name, address, email, phone, logo, signature, bankName, accountName, accountNumber };
    Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
    const company = await Company.findOneAndUpdate({ companyId }, { $set: update }, { new: true }).lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    return res.json({ success: true, company, message: 'Company updated' });
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
    const company = await Company.findOne({ companyId }).lean();
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
    const list = await Invoice.find({ companyId, createdAt: { $gte: since } })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
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
    const company = await Company.findOne({ companyId }).lean();
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
    const company = await Company.findOne({ companyId }).lean();
    if (!company) return res.status(404).json({ success: false, message: 'Company not found' });
    return res.json({ success: true, company });
  } catch (err) {
    console.error('Get company error:', err);
    return res.status(500).json({ success: false, message: 'Server error fetching company' });
  }
});

app.get('/', (req, res) => {
  res.send('YMOBooks backend is running');
});

// Simple health check for connectivity diagnostics
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`YMOBooks backend listening on http://localhost:${PORT}`);
});