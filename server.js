const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Database setup
const db = new Database('./patient_portal.db');

// Initialize database tables
// Users table
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

// PDF records table
db.exec(`CREATE TABLE IF NOT EXISTS pdf_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  upload_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  record_type TEXT,
  extracted_data TEXT,
  FOREIGN KEY (user_id) REFERENCES users (id)
)`);

// Create default admin user
const adminPassword = bcrypt.hashSync('admin123', 10);
const insertAdmin = db.prepare(`INSERT OR IGNORE INTO users (username, password, email, full_name) 
        VALUES ('admin', ?, 'admin@medicalportal.com', 'Administrator')`);
insertAdmin.run(adminPassword);

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  try {
    const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
    const user = stmt.get(username);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Register endpoint
app.post('/api/register', (req, res) => {
  const { username, password, email, full_name } = req.body;

  if (!username || !password || !email || !full_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    const stmt = db.prepare('INSERT INTO users (username, password, email, full_name) VALUES (?, ?, ?, ?)');
    const result = stmt.run(username, hashedPassword, email, full_name);

    const token = jwt.sign(
      { id: result.lastInsertRowid, username },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.lastInsertRowid,
        username,
        email,
        full_name
      }
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
});

// Upload PDF endpoint
app.post('/api/upload', authenticateToken, upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { record_type } = req.body;
    const filePath = req.file.path;
    const fileSize = req.file.size;

    // Extract text from PDF
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    const extractedText = pdfData.text;

    // Store in database
    try {
      const stmt = db.prepare(`INSERT INTO pdf_records (user_id, filename, original_name, file_path, file_size, record_type, extracted_data) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const result = stmt.run(req.user.id, req.file.filename, req.file.originalname, filePath, fileSize, record_type, extractedText);

      res.status(201).json({
        message: 'PDF uploaded successfully',
        record_id: result.lastInsertRowid,
        filename: req.file.filename
      });
    } catch (error) {
      return res.status(500).json({ error: 'Database error' });
    }
  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ error: 'PDF processing failed' });
  }
});

// Get user's PDF records
app.get('/api/records', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM pdf_records WHERE user_id = ? ORDER BY upload_date DESC');
    const records = stmt.all(req.user.id);
    res.json(records);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get specific PDF record
app.get('/api/records/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM pdf_records WHERE id = ? AND user_id = ?');
    const record = stmt.get(req.params.id, req.user.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Serve PDF files
app.get('/api/pdf/:filename', authenticateToken, (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  // Verify user has access to this file
  try {
    const stmt = db.prepare('SELECT * FROM pdf_records WHERE filename = ? AND user_id = ?');
    const record = stmt.get(req.params.filename, req.user.id);
    
    if (!record) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${record.original_name}"`);
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (error) {
    return res.status(404).json({ error: 'File not found or access denied' });
  }
});

// Extract and analyze data from PDF
app.get('/api/analyze/:id', authenticateToken, (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM pdf_records WHERE id = ? AND user_id = ?');
    const record = stmt.get(req.params.id, req.user.id);
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Basic data extraction and analysis
    const text = record.extracted_data;
    const analysis = {
      wordCount: text.split(/\s+/).length,
      characterCount: text.length,
      recordType: record.record_type,
      uploadDate: record.upload_date,
      fileSize: record.file_size,
      // Extract common medical terms
      medicalTerms: extractMedicalTerms(text),
      // Extract potential numerical values
      numericalData: extractNumericalData(text)
    };

    res.json(analysis);
  } catch (error) {
    return res.status(404).json({ error: 'Record not found' });
  }
});

// Helper functions for data extraction
function extractMedicalTerms(text) {
  const medicalKeywords = [
    'ECG', 'EKG', 'echocardiography', 'CT', 'MRI', 'blood pressure', 'heart rate',
    'cholesterol', 'glucose', 'hemoglobin', 'white blood cells', 'platelets',
    'systolic', 'diastolic', 'bpm', 'mg/dL', 'mmol/L', 'normal', 'abnormal',
    'elevated', 'decreased', 'positive', 'negative'
  ];

  const foundTerms = medicalKeywords.filter(term => 
    text.toLowerCase().includes(term.toLowerCase())
  );

  return foundTerms;
}

function extractNumericalData(text) {
  const numberPattern = /(\d+(?:\.\d+)?)\s*(mg\/dL|mmol\/L|bpm|mmHg|%|g\/dL)/gi;
  const matches = [];
  let match;

  while ((match = numberPattern.exec(text)) !== null) {
    matches.push({
      value: parseFloat(match[1]),
      unit: match[2],
      context: text.substring(Math.max(0, match.index - 50), match.index + 50)
    });
  }

  return matches;
}

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'client/build')));

// Catch all handler for React app
app.get('*', (req, res) => {
  // Check if the request is for an API endpoint
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Serve React app for all other routes
  const indexPath = path.join(__dirname, 'client/build', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('React build not found. Please ensure the build process completed successfully.');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Access the application at http://localhost:${PORT}`);
}); 