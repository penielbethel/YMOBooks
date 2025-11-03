const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 4000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://pbmsrvr:foraminiferans@ymobooks.4dyqe3f.mongodb.net/ymobooks?retryWrites=true&w=majority&appName=ymobooks';

app.use(cors());
app.use(express.json({ limit: '8mb' }));

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
  },
  { timestamps: true }
);

const Company = mongoose.model('Company', CompanySchema);

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
    const { name, address, email, phone, logo, signature } = req.body;
    if (!name) return res.status(400).json({ success: false, message: 'Company name is required' });

    const companyId = await generateCompanyId(name);

    const doc = new Company({ companyId, name, address, email, phone, logo, signature });
    await doc.save();

    return res.json({ success: true, companyId, message: 'Registration successful. Keep and save your Company ID.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { companyId } = req.body;
    if (!companyId) return res.status(400).json({ success: false, message: 'Company ID is required' });
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

app.listen(PORT, () => {
  console.log(`YMOBooks backend listening on http://localhost:${PORT}`);
});