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
const { Pool } = require('pg');
const OpenAI = require('openai');
const mammoth = require('mammoth');

// Initialize OpenAI (optional)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const app = express();
const PORT = process.env.PORT || 10000;

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
console.log('Database URL configured:', process.env.DATABASE_URL ? 'Yes' : 'No');
console.log('NODE_ENV:', process.env.NODE_ENV);

let pool;
if (process.env.DATABASE_URL) {
  // Try connection string first
  pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
} else {
  // Fallback to individual parameters
  pool = new Pool({ 
    host: process.env.DB_HOST || 'db.vfqxqgpmlybmbucpfnoc.supabase.co',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'kymsos-hisqe8-zeGqij',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });
}

// Initialize database tables
async function initializeDatabase() {
  try {
    console.log('Initializing database...');
    
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // PDF records table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pdf_records (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        uploaded_by INTEGER,
        filename TEXT NOT NULL,
        original_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        record_type TEXT,
        extracted_data TEXT,
        is_lab_report BOOLEAN DEFAULT FALSE,
        lab_data_extracted BOOLEAN DEFAULT FALSE,
        pdf_analysis TEXT,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (uploaded_by) REFERENCES users (id)
      )
    `);

    // Lab values table for storing extracted numerical data
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lab_values (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        record_id INTEGER,
        test_name TEXT NOT NULL,
        test_category TEXT,
        value REAL,
        unit TEXT,
        reference_range TEXT,
        is_abnormal BOOLEAN DEFAULT FALSE,
        test_date TIMESTAMP,
        extraction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confidence_score REAL DEFAULT 0.0,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (record_id) REFERENCES pdf_records (id)
      )
    `);

    // Lab test categories for organization
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lab_categories (
        id SERIAL PRIMARY KEY,
        category_name TEXT UNIQUE NOT NULL,
        description TEXT,
        color TEXT DEFAULT '#3B82F6'
      )
    `);

    // Insert default lab categories
    await pool.query(`
      INSERT INTO lab_categories (category_name, description, color) VALUES 
        ('Hematology', 'Blood cell counts and hemoglobin', '#EF4444'),
        ('Chemistry', 'Basic metabolic panel and electrolytes', '#10B981'),
        ('Lipids', 'Cholesterol and triglycerides', '#F59E0B'),
        ('Thyroid', 'TSH, T3, T4 levels', '#8B5CF6'),
        ('Diabetes', 'Glucose and HbA1c', '#EC4899'),
        ('Liver', 'Liver function tests', '#06B6D4'),
        ('Kidney', 'Kidney function tests', '#84CC16'),
        ('Other', 'Other laboratory tests', '#6B7280')
      ON CONFLICT (category_name) DO NOTHING
    `);

    // Create default admin user
    const adminPassword = bcrypt.hashSync('admin123', 10);
    await pool.query(`
      INSERT INTO users (username, password, email, full_name, role) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (username) DO NOTHING
    `, ['admin', adminPassword, 'admin@medicalportal.com', 'Administrator', 'admin']);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads/';
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error('Error creating upload directory:', error);
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and DOCX files are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 10 // Allow up to 10 files at once
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

// Admin authorization middleware
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Routes

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  try {
    const stmt = pool.query(`
      SELECT * FROM users WHERE username = $1
    `, [username]);
    const user = stmt.rows[0];
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        role: user.role
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
    const stmt = pool.query(`
      INSERT INTO users (username, password, email, full_name) 
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, full_name, role
    `, [username, hashedPassword, email, full_name]);
    const result = stmt.rows[0];

    const token = jwt.sign(
      { id: result.id, username, role: 'user' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: result.id,
        username,
        email,
        full_name,
        role: 'user'
      }
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint violation
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    return res.status(500).json({ error: 'Database error' });
  }
});

// Upload PDF endpoint
app.post('/api/upload', authenticateToken, upload.array('pdf', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let record_type = req.body.record_type;
    if (Array.isArray(record_type)) {
      record_type = record_type[0];
    }
    const results = [];
    const errors = [];

    // Process each file
    for (const file of req.files) {
      try {
        const filePath = file.path;
        const fileSize = file.size;

        // Extract text from PDF or DOCX
        let extractedText = '';
        if (file.mimetype === 'application/pdf') {
          const dataBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(dataBuffer);
          extractedText = pdfData.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const docxBuffer = fs.readFileSync(filePath);
          const result = await mammoth.extractRawText({ buffer: docxBuffer });
          extractedText = result.value;
        } else {
          extractedText = '';
        }

        // Detect if this is a lab report
        const isLabReport = await detectLabReport(extractedText);
        const isLabReportInt = isLabReport ? 1 : 0;

        // Store in database
        console.log('Attempting to insert pdf record:', {
          user_id: req.user.id,
          uploaded_by: req.user.id,
          filename: file.filename,
          original_name: file.originalname
        });
        const stmt = pool.query(`
          INSERT INTO pdf_records (user_id, uploaded_by, filename, original_name, file_path, file_size, record_type, extracted_data, is_lab_report, pdf_analysis) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [req.user.id, req.user.id, file.filename, file.originalname, filePath, fileSize, record_type, extractedText, isLabReportInt, await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a medical data extraction specialist. Extract all relevant medical and lab data from the following document. Return a JSON object with a summary, lab values, and any other relevant information." },
            { role: "user", content: extractedText.substring(0, 12000) }
          ],
          temperature: 0.1,
          max_tokens: 2000
        }).then(response => response.data.choices[0].message.content)]);
        const result = stmt.rows[0];

        const recordId = result.id;

        // If it's a lab report, extract lab data
        if (isLabReport && openai) {
          try {
            await extractLabDataFromText(extractedText, recordId, req.user.id);
          } catch (error) {
            console.error('Lab data extraction failed for file:', file.originalname, error);
          }
        }

        results.push({
          filename: file.originalname,
          record_id: recordId,
          is_lab_report: isLabReport,
          status: 'success'
        });
      } catch (error) {
        console.error('Error processing file:', file.originalname, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
          status: 'failed'
        });
      }
    }

    // Return results
    const response = {
      message: `Processed ${req.files.length} files`,
      successful: results.length,
      failed: errors.length,
      results: results,
      errors: errors
    };

    if (errors.length > 0) {
      res.status(207).json(response); // 207 Multi-Status
    } else {
      res.status(201).json(response);
    }
  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ error: 'PDF processing failed' });
  }
});

// Admin upload PDF for specific user endpoint
app.post('/api/admin/upload', authenticateToken, requireAdmin, upload.array('pdf', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    let record_type = req.body.record_type;
    if (Array.isArray(record_type)) {
      record_type = record_type[0];
    }
    const { user_id } = req.body;
    
    if (!user_id) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Verify user exists
    const userStmt = pool.query(`
      SELECT * FROM users WHERE id = $1
    `, [user_id]);
    const user = userStmt.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const results = [];
    const errors = [];

    // Process each file
    for (const file of req.files) {
      try {
        const filePath = file.path;
        const fileSize = file.size;

        // Extract text from PDF or DOCX
        let extractedText = '';
        if (file.mimetype === 'application/pdf') {
          const dataBuffer = fs.readFileSync(filePath);
          const pdfData = await pdfParse(dataBuffer);
          extractedText = pdfData.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
          const docxBuffer = fs.readFileSync(filePath);
          const result = await mammoth.extractRawText({ buffer: docxBuffer });
          extractedText = result.value;
        } else {
          extractedText = '';
        }

        // Detect if this is a lab report
        const isLabReport = await detectLabReport(extractedText);
        const isLabReportInt = isLabReport ? 1 : 0;

        // Store in database
        console.log('Attempting to insert pdf record:', {
          user_id,
          uploaded_by: req.user.id,
          filename: file.filename,
          original_name: file.originalname
        });
        const stmt = pool.query(`
          INSERT INTO pdf_records (user_id, uploaded_by, filename, original_name, file_path, file_size, record_type, extracted_data, is_lab_report, pdf_analysis) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [user_id, req.user.id, file.filename, file.originalname, filePath, fileSize, record_type, extractedText, isLabReportInt, await openai.chat.completions.create({
          model: "gpt-4",
          messages: [
            { role: "system", content: "You are a medical data extraction specialist. Extract all relevant medical and lab data from the following document. Return a JSON object with a summary, lab values, and any other relevant information." },
            { role: "user", content: extractedText.substring(0, 12000) }
          ],
          temperature: 0.1,
          max_tokens: 2000
        }).then(response => response.data.choices[0].message.content)]);
        const result = stmt.rows[0];

        const recordId = result.id;

        // If it's a lab report, extract lab data
        if (isLabReport && openai) {
          try {
            await extractLabDataFromText(extractedText, recordId, user_id);
          } catch (error) {
            console.error('Lab data extraction failed for file:', file.originalname, error);
          }
        }

        results.push({
          filename: file.originalname,
          record_id: recordId,
          is_lab_report: isLabReport,
          status: 'success'
        });
      } catch (error) {
        console.error('Error processing file:', file.originalname, error);
        errors.push({
          filename: file.originalname,
          error: error.message,
          status: 'failed'
        });
      }
    }

    // Return results
    const response = {
      message: `Processed ${req.files.length} files for user`,
      successful: results.length,
      failed: errors.length,
      results: results,
      errors: errors,
      user: {
        id: user.id,
        username: user.username,
        full_name: user.full_name
      }
    };

    if (errors.length > 0) {
      res.status(207).json(response); // 207 Multi-Status
    } else {
      res.status(201).json(response);
    }
  } catch (error) {
    console.error('PDF processing error:', error);
    res.status(500).json({ error: 'PDF processing failed' });
  }
});

// Get user's PDF records
app.get('/api/records', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        pr.*,
        u.username as uploaded_by_username,
        u.full_name as uploaded_by_name
      FROM pdf_records pr
      LEFT JOIN users u ON pr.uploaded_by = u.id
      WHERE pr.user_id = $1 
      ORDER BY pr.upload_date DESC
    `, [req.user.id]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get specific PDF record
app.get('/api/records/:id', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        pr.*,
        u.username as uploaded_by_username,
        u.full_name as uploaded_by_name
      FROM pdf_records pr
      LEFT JOIN users u ON pr.uploaded_by = u.id
      WHERE pr.id = $1 AND pr.user_id = $2
    `, [req.params.id, req.user.id]);
    const record = stmt.rows[0];
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Serve PDF files
app.get('/api/pdf/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Try to find the record for original name (optional, fallback to filename)
  let originalName = req.params.filename;
  try {
    const stmt = pool.query(`
      SELECT * FROM pdf_records WHERE filename = $1
    `, [req.params.filename]);
    const record = stmt.rows[0];
    if (record && record.original_name) {
      originalName = record.original_name;
    }
  } catch (e) {}

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
  fs.createReadStream(filePath).pipe(res);
});

// Extract and analyze data from PDF
app.get('/api/analyze/:id', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT * FROM pdf_records WHERE id = $1 AND user_id = $2
    `, [req.params.id, req.user.id]);
    const record = stmt.rows[0];
    
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

// AI-powered lab data extraction
async function extractLabDataFromText(text, recordId, userId) {
  if (!openai) {
    console.log('OpenAI not configured - skipping lab data extraction');
    return [];
  }

  try {
    const prompt = `
    You are a medical data extraction specialist. Extract ALL laboratory test results from the following medical document text.
    
    IMPORTANT: Extract EVERY lab test with numerical values, including:
    - Complete Blood Count (CBC): Hemoglobin, Hematocrit, WBC, RBC, Platelets, MCV, MCH, MCHC
    - Basic Metabolic Panel: Glucose, BUN, Creatinine, Sodium, Potassium, Chloride, CO2, Calcium
    - Lipid Panel: Total Cholesterol, HDL, LDL, Triglycerides
    - Liver Function: ALT, AST, Alkaline Phosphatase, Bilirubin, Albumin
    - Thyroid: TSH, T3, T4, Free T3, Free T4
    - Diabetes: HbA1c, Fasting Glucose
    - Kidney Function: Creatinine, BUN, eGFR
    - Any other numerical lab values found
    
    Return ONLY a JSON array of objects with this exact structure:
    [
      {
        "test_name": "Exact test name as written (e.g., Hemoglobin, Glucose, Total Cholesterol)",
        "test_category": "Category (Hematology, Chemistry, Lipids, Thyroid, Diabetes, Liver, Kidney, Other)",
        "value": numeric_value,
        "unit": "unit (mg/dL, mmol/L, g/dL, %, etc.)",
        "reference_range": "normal range (e.g., 12.0-15.5 g/dL or 135-145 mEq/L)",
        "is_abnormal": boolean,
        "test_date": "YYYY-MM-DD if found in document, otherwise null"
      }
    ]
    
    Rules:
    1. Extract ALL numerical lab values, even if they appear normal
    2. Use exact test names as written in the document
    3. Include reference ranges if provided
    4. Mark as abnormal if value is outside reference range or marked as high/low
    5. If no lab data is found, return an empty array
    6. Be thorough - don't miss any lab values
    
    Text to analyze:
    ${text.substring(0, 12000)} // Increased text length for better extraction
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a medical data extraction specialist. Extract only laboratory test results with numerical values and return them in the specified JSON format."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000
    });

    const response = completion.data.choices[0].message.content;
    const labData = JSON.parse(response);

    // Store extracted data in database
    if (Array.isArray(labData) && labData.length > 0) {
      const insertStmt = pool.query(`
        INSERT INTO lab_values 
        (user_id, record_id, test_name, test_category, value, unit, reference_range, is_abnormal, test_date, confidence_score)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, labData.map((lab, index) => [
        userId,
        recordId,
        lab.test_name,
        lab.test_category,
        lab.value,
        lab.unit,
        lab.reference_range,
        lab.is_abnormal,
        lab.test_date,
        0.9 // High confidence for AI extraction
      ]));
    }

    // Mark record as lab data extracted
    const updateStmt = pool.query(`
      UPDATE pdf_records SET lab_data_extracted = TRUE WHERE id = $1
    `, [recordId]);

    return labData;
  } catch (error) {
    console.error('Error extracting lab data:', error);
    return [];
  }
}

// Detect if PDF is a lab report
async function detectLabReport(text) {
  try {
    const labKeywords = [
      'laboratory', 'lab', 'blood test', 'chemistry', 'hematology',
      'hemoglobin', 'glucose', 'cholesterol', 'creatinine', 'bun',
      'sodium', 'potassium', 'chloride', 'bicarbonate', 'calcium',
      'albumin', 'bilirubin', 'alt', 'ast', 'alkaline phosphatase',
      'tsh', 't3', 't4', 'hba1c', 'platelets', 'white blood cells',
      'red blood cells', 'wbc', 'rbc', 'hct', 'mcv', 'mch', 'mchc'
    ];

    const textLower = text.toLowerCase();
    const matches = labKeywords.filter(keyword => textLower.includes(keyword));
    
    return matches.length >= 3; // If 3 or more lab keywords found, consider it a lab report
  } catch (error) {
    console.error('Error detecting lab report:', error);
    return false;
  }
}

// Admin Routes

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT id, username, email, full_name, role, created_at FROM users ORDER BY created_at DESC
    `);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get all records from all users (admin only)
app.get('/api/admin/records', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        pr.*,
        u.username,
        u.full_name,
        u.email
      FROM pdf_records pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.upload_date DESC
    `);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get records for a specific user (admin only)
app.get('/api/admin/users/:userId/records', authenticateToken, requireAdmin, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        pr.*,
        u.username,
        u.full_name,
        u.email
      FROM pdf_records pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.user_id = $1
      ORDER BY pr.upload_date DESC
    `, [req.params.userId]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Update user role (admin only)
app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, (req, res) => {
  const { role } = req.body;
  
  if (!role || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Valid role required (admin or user)' });
  }

  try {
    const stmt = pool.query(`
      UPDATE users SET role = $1 WHERE id = $2
    `, [role, req.params.userId]);
    
    if (stmt.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, (req, res) => {
  try {
    // First delete all lab values for this user
    const deleteLabValues = pool.query(`
      DELETE FROM lab_values WHERE user_id = $1
    `, [req.params.userId]);
    
    // Then delete all records for this user
    const deleteRecords = pool.query(`
      DELETE FROM pdf_records WHERE user_id = $1
    `, [req.params.userId]);
    
    // Then delete the user
    const deleteUser = pool.query(`
      DELETE FROM users WHERE id = $1
    `, [req.params.userId]);
    
    if (deleteUser.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User and all associated records deleted successfully' });
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Lab Data Routes

// Get user's lab values
app.get('/api/lab-values', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1
      ORDER BY lv.test_date DESC, lv.extraction_date DESC
    `, [req.user.id]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab values by test name (for trending)
app.get('/api/lab-values/:testName', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.test_name LIKE $2
      ORDER BY lv.test_date ASC, lv.extraction_date ASC
    `, [req.user.id, `%${req.params.testName}%`]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab categories
app.get('/api/lab-categories', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT * FROM lab_categories ORDER BY category_name
    `);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab values by category
app.get('/api/lab-values/category/:category', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.test_category = $2
      ORDER BY lv.test_date DESC, lv.extraction_date DESC
    `, [req.user.id, req.params.category]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab trends for a specific test
app.get('/api/lab-values/trends/:testName', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date,
        pr.record_type
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.test_name LIKE $2
      ORDER BY lv.test_date ASC, lv.extraction_date ASC
    `, [req.user.id, `%${req.params.testName}%`]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab analytics summary
app.get('/api/lab-analytics/summary', authenticateToken, (req, res) => {
  try {
    // Get total lab values
    const totalStmt = pool.query(`
      SELECT COUNT(*) as total FROM lab_values WHERE user_id = $1
    `, [req.user.id]);
    const total = totalStmt.rows[0].total;

    // Get values by category
    const categoryStmt = pool.query(`
      SELECT test_category, COUNT(*) as count 
      FROM lab_values 
      WHERE user_id = $1 
      GROUP BY test_category
    `, [req.user.id]);
    const categories = categoryStmt.rows;

    // Get abnormal values
    const abnormalStmt = pool.query(`
      SELECT COUNT(*) as count FROM lab_values 
      WHERE user_id = $1 AND is_abnormal = TRUE
    `, [req.user.id]);
    const abnormal = abnormalStmt.rows[0].count;

    // Get recent trends (last 30 days)
    const recentStmt = pool.query(`
      SELECT lv.test_name, lv.value, lv.unit, lv.test_date, pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 
      AND lv.extraction_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY lv.extraction_date DESC
      LIMIT 20
    `, [req.user.id]);
    const recent = recentStmt.rows;

    res.json({
      total_lab_values: total,
      by_category: categories,
      abnormal_count: abnormal,
      recent_trends: recent
    });
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get all available test names for a user
app.get('/api/lab-values/test-names', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT DISTINCT test_name, test_category, COUNT(*) as count
      FROM lab_values 
      WHERE user_id = $1
      GROUP BY test_name, test_category
      ORDER BY count DESC, test_name ASC
    `, [req.user.id]);
    res.json(stmt.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Re-extract lab data from existing record
app.post('/api/lab-values/extract/:recordId', authenticateToken, async (req, res) => {
  try {
    // Get the record
    const recordStmt = pool.query(`
      SELECT * FROM pdf_records WHERE id = $1 AND user_id = $2
    `, [req.params.recordId, req.user.id]);
    const record = recordStmt.rows[0];
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Delete existing lab values for this record
    const deleteStmt = pool.query(`
      DELETE FROM lab_values WHERE record_id = $1
    `, [req.params.recordId]);

    // Re-extract lab data
    if (openai) {
      const labData = await extractLabDataFromText(record.extracted_data, req.params.recordId, req.user.id);
      res.json({ 
        message: 'Lab data re-extracted successfully',
        extracted_tests: labData.length
      });
    } else {
      res.status(400).json({ error: 'OpenAI API key not configured' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab trends grouped by record_type and test_name
app.get('/api/lab-values/grouped-trends', authenticateToken, (req, res) => {
  try {
    const stmt = pool.query(`
      SELECT 
        pr.record_type,
        lv.test_name,
        lv.value,
        lv.unit,
        lv.test_date,
        lv.is_abnormal,
        lv.reference_range,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1
      ORDER BY pr.record_type, lv.test_name, lv.test_date ASC, lv.extraction_date ASC
    `, [req.user.id]);
    const rows = stmt.rows;
    // Group by record_type and test_name
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.record_type]) grouped[row.record_type] = {};
      if (!grouped[row.record_type][row.test_name]) grouped[row.record_type][row.test_name] = [];
      grouped[row.record_type][row.test_name].push(row);
    }
    res.json(grouped);
  } catch (error) {
    return res.status(500).json({ error: 'Database error' });
  }
});

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

// Start server
async function startServer() {
  try {
    // Initialize database first
    await initializeDatabase();
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Access the application at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer(); 