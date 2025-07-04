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
const mammoth = require('mammoth');
const fetch = require('node-fetch');
const { config } = require('dotenv');

config();

// Cursor AI config (placeholder)
const CURSOR_API_KEY = process.env.CURSOR_API_KEY;
const CURSOR_API_ENDPOINT = process.env.CURSOR_API_ENDPOINT;

// Claude (Anthropic) API config
const CLAUDEAI_API_KEY = process.env.CLAUDEAI_API_KEY;
const CLAUDEAI_API_ENDPOINT = process.env.CLAUDEAI_API_ENDPOINT || 'https://api.anthropic.com/v1/messages';

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

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL
});

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

    // AI Lab Analysis table for comprehensive AI analysis
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_lab_analysis (
        id SERIAL PRIMARY KEY,
        user_id INTEGER,
        record_id INTEGER,
        analysis_type TEXT NOT NULL,
        test_name TEXT,
        summary TEXT,
        numerical_data JSONB,
        trends JSONB,
        recommendations TEXT,
        risk_level TEXT,
        analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        confidence_score REAL DEFAULT 0.8,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (record_id) REFERENCES pdf_records (id)
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

    // Password reset tokens table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )
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
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const stmt = await pool.query(
      `SELECT * FROM users WHERE username = $1`,
      [username]
    );
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
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Register endpoint
app.post('/api/register', async (req, res) => {
  const { username, password, email, full_name } = req.body;

  if (!username || !password || !email || !full_name) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);

  try {
    // Check for existing username or email
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $2',
      [username, email]
    );
    if (existingUser.rows.length > 0) {
      if (existingUser.rows[0].username === username) {
        return res.status(400).json({ error: 'Username already exists' });
      }
      if (existingUser.rows[0].email === email) {
        return res.status(400).json({ error: 'Email already exists' });
      }
    }

    const stmt = await pool.query(
      `INSERT INTO users (username, password, email, full_name) 
      VALUES ($1, $2, $3, $4)
      RETURNING id, username, email, full_name, role`,
      [username, hashedPassword, email, full_name]
    );
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
      // Fallback in case of race condition
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    console.error('Registration error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Forgot password endpoint
app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id, username, email, full_name FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not for security
      return res.json({ message: 'If an account with that email exists, a password reset link has been sent.' });
    }

    const user = userResult.rows[0];

    // Generate reset token
    const resetToken = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token expires in 1 hour

    // Store reset token
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, resetToken, expiresAt]
    );

    // In a real application, you would send an email here
    // For demo purposes, we'll just return the token
    res.json({ 
      message: 'Password reset link sent to your email',
      resetToken: resetToken, // Remove this in production
      expiresAt: expiresAt
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  try {
    // Find valid reset token
    const tokenResult = await pool.query(
      `SELECT prt.*, u.username, u.email 
       FROM password_reset_tokens prt 
       JOIN users u ON prt.user_id = u.id 
       WHERE prt.token = $1 AND prt.expires_at > NOW() AND prt.used = FALSE`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const resetToken = tokenResult.rows[0];

    // Hash new password
    const hashedPassword = bcrypt.hashSync(newPassword, 10);

    // Update user password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, resetToken.user_id]
    );

    // Mark token as used
    await pool.query(
      'UPDATE password_reset_tokens SET used = TRUE WHERE id = $1',
      [resetToken.id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Helper to call Claude API
async function analyzeWithClaudeAI(prompt) {
  if (!CLAUDEAI_API_KEY) {
    throw new Error('Claude API key not configured');
  }
  const response = await fetch(CLAUDEAI_API_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': CLAUDEAI_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-3-opus-20240229',
      max_tokens: 3000,
      temperature: 0.1,
      messages: [
        { role: 'user', content: prompt }
      ]
    })
  });
  if (!response.ok) {
    throw new Error('Claude API error: ' + response.statusText);
  }
  const data = await response.json();
  // Adjust this according to Claude's actual response format
  return data.content?.[0]?.text || data.completion || JSON.stringify(data);
}

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
        console.log('Extracted text:', extractedText.substring(0, 500)); // Log first 500 chars for debugging

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

        // Generate PDF analysis if Claude is available
        let pdfAnalysis = null;
        if (CLAUDEAI_API_KEY) {
          try {
            pdfAnalysis = await analyzeWithClaudeAI(extractedText.substring(0, 12000));
          } catch (claudeError) {
            console.error('Claude analysis failed:', claudeError);
            pdfAnalysis = null;
          }
        }

        const result = await pool.query(`
          INSERT INTO pdf_records (user_id, uploaded_by, filename, original_name, file_path, file_size, record_type, extracted_data, is_lab_report, pdf_analysis) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [req.user.id, req.user.id, file.filename, file.originalname, filePath, fileSize, record_type, extractedText, isLabReportInt, pdfAnalysis]);
        const recordId = result.rows[0].id;

        // Always perform AI analysis for medical documents
        if (CLAUDEAI_API_KEY) {
          try {
            await analyzeLabDataWithAI(extractedText, recordId, req.user.id, record_type);
          } catch (error) {
            console.error('AI analysis failed for file:', file.originalname, error);
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
    const userResult = await pool.query(`
      SELECT * FROM users WHERE id = $1
    `, [user_id]);
    const user = userResult.rows[0];
    
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
        console.log('Extracted text:', extractedText.substring(0, 500)); // Log first 500 chars for debugging

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

        // Generate PDF analysis if Claude is available
        let pdfAnalysis = null;
        if (CLAUDEAI_API_KEY) {
          try {
            pdfAnalysis = await analyzeWithClaudeAI(extractedText.substring(0, 12000));
          } catch (claudeError) {
            console.error('Claude analysis failed:', claudeError);
            pdfAnalysis = null;
          }
        }

        const result = await pool.query(`
          INSERT INTO pdf_records (user_id, uploaded_by, filename, original_name, file_path, file_size, record_type, extracted_data, is_lab_report, pdf_analysis) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
        `, [user_id, req.user.id, file.filename, file.originalname, filePath, fileSize, record_type, extractedText, isLabReportInt, pdfAnalysis]);
        const recordId = result.rows[0].id;

        // Always perform AI analysis for medical documents
        if (CLAUDEAI_API_KEY) {
          try {
            await analyzeLabDataWithAI(extractedText, recordId, user_id, record_type);
          } catch (error) {
            console.error('AI analysis failed for file:', file.originalname, error);
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
app.get('/api/records', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pr.*,
        u.username as uploaded_by_username,
        u.full_name as uploaded_by_name
      FROM pdf_records pr
      LEFT JOIN users u ON pr.uploaded_by = u.id
      WHERE pr.user_id = $1
      ORDER BY pr.upload_date DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching records:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Delete a record (user can only delete their own records)
app.delete('/api/records/:recordId', authenticateToken, async (req, res) => {
  try {
    // First, get the record to check ownership and file path
    const recordResult = await pool.query(`
      SELECT * FROM pdf_records WHERE id = $1 AND user_id = $2
    `, [req.params.recordId, req.user.id]);
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found or access denied' });
    }
    
    const record = recordResult.rows[0];
    
    // Delete associated lab values and AI analysis
    await pool.query(`
      DELETE FROM lab_values WHERE record_id = $1
    `, [req.params.recordId]);
    
    await pool.query(`
      DELETE FROM ai_lab_analysis WHERE record_id = $1
    `, [req.params.recordId]);
    
    // Delete the record from database
    await pool.query(`
      DELETE FROM pdf_records WHERE id = $1
    `, [req.params.recordId]);
    
    // Delete the physical file
    try {
      if (fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
        console.log(`Deleted file: ${record.file_path}`);
      }
    } catch (fileError) {
      console.error('Error deleting physical file:', fileError);
      // Continue even if file deletion fails
    }
    
    res.json({ 
      message: 'Record deleted successfully',
      deleted_record: {
        id: record.id,
        filename: record.original_name
      }
    });
  } catch (error) {
    console.error('Error deleting record:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get specific PDF record
app.get('/api/records/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pr.*,
        u.username as uploaded_by_username,
        u.full_name as uploaded_by_name
      FROM pdf_records pr
      LEFT JOIN users u ON pr.uploaded_by = u.id
      WHERE pr.id = $1 AND pr.user_id = $2
    `, [req.params.id, req.user.id]);
    const record = result.rows[0];
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('Error fetching record:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Serve PDF files
app.get('/api/pdf/:filename', (req, res) => {
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
  const filePath = path.join(uploadDir, req.params.filename);
  console.log('Download request for:', filePath);
  // Verify file exists
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
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

// AI-powered comprehensive lab analysis
async function analyzeLabDataWithAI(text, recordId, userId, recordType = null) {
  try {
    console.log(`Starting AI analysis for record ${recordId}`);
    
    // First, get existing lab data for this user to compare trends
    const existingDataResult = await pool.query(`
      SELECT 
        lv.test_name,
        lv.value,
        lv.unit,
        lv.test_date,
        lv.is_abnormal,
        pr.upload_date,
        pr.record_type
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.record_id != $2
      ORDER BY lv.test_date DESC, pr.upload_date DESC
      LIMIT 100
    `, [userId, recordId]);

    const existingData = existingDataResult.rows;
    const existingDataText = existingData.length > 0 
      ? `Previous lab data for comparison:\n${JSON.stringify(existingData, null, 2)}`
      : 'No previous lab data available for comparison.';

    const prompt = `
    You are an advanced medical AI analyst specializing in patient-friendly lab result interpretation. Analyze the following medical document and provide comprehensive insights that are easy for patients to understand.

    DOCUMENT TO ANALYZE:
    ${text.substring(0, 15000)}

    PREVIOUS LAB DATA FOR TREND ANALYSIS:
    ${existingDataText}

    DOCUMENT TYPE: ${recordType || 'Unknown'}

    Please provide a comprehensive analysis in the following JSON format:

    {
      "document_summary": "Patient-friendly summary of what this document contains in simple language",
      "patient_summary": {
        "overall_health_status": "Simple assessment of overall health (Good/Fair/Concerning)",
        "key_points": ["3-5 main points in simple language for the patient"],
        "what_this_means": "Explanation of what these results mean for the patient's health",
        "next_steps": ["Clear, actionable next steps for the patient"]
      },
      "lab_tests_found": [
        {
          "test_name": "Exact test name",
          "test_category": "Category (Hematology, Chemistry, Lipids, Thyroid, Diabetes, Liver, Kidney, Cardiac, Imaging, Other)",
          "value": numeric_value_or_null,
          "unit": "unit if available",
          "reference_range": "normal range if available",
          "is_abnormal": boolean,
          "test_date": "YYYY-MM-DD if found",
          "interpretation": "What this value means in simple terms",
          "patient_explanation": "Simple explanation for the patient about what this test measures and what their result means",
          "trend": "improving/declining/stable/unknown compared to previous data",
          "is_graphable": boolean,
          "graph_type": "line/bar/pie/scatter for bloodwork elements, chemicals, metals"
        }
      ],
      "medical_measurements": [
        {
          "measurement_name": "Name of measurement (e.g., Heart Rate, Blood Pressure, Ejection Fraction, Dimensions)",
          "measurement_category": "Category (Cardiac, Respiratory, Neurological, Imaging, Vital Signs, Other)",
          "value": numeric_value_or_null,
          "unit": "unit if available",
          "reference_range": "normal range if available",
          "is_abnormal": boolean,
          "measurement_date": "YYYY-MM-DD if found",
          "interpretation": "What this measurement means in simple terms",
          "patient_explanation": "Simple explanation for the patient about what this measurement means",
          "trend": "improving/declining/stable/unknown compared to previous data",
          "is_graphable": boolean,
          "graph_type": "line/bar/pie/scatter"
        }
      ],
      "non_data_content": {
        "clinical_notes": ["Extract any clinical notes, observations, or comments from healthcare providers"],
        "impressions": ["Extract radiologist impressions, clinical impressions, or diagnostic impressions"],
        "recommendations": ["Extract any medical recommendations or follow-up instructions"],
        "diagnoses": ["Extract any diagnoses mentioned"],
        "medications": ["Extract any medications mentioned or prescribed"],
        "procedures": ["Extract any procedures performed or recommended"]
      },
      "bloodwork_analysis": {
        "elements": [
          {
            "element_name": "Name of blood element (e.g., Hemoglobin, Iron, Calcium, Sodium, Potassium)",
            "element_type": "mineral/vitamin/protein/hormone/electrolyte",
            "value": numeric_value,
            "unit": "unit",
            "reference_range": "normal range",
            "is_abnormal": boolean,
            "patient_meaning": "What this element means for the patient's health",
            "graph_data": {
              "chart_type": "line/bar",
              "category": "blood_elements",
              "color": "hex_color_code"
            }
          }
        ],
        "chemicals": [
          {
            "chemical_name": "Name of chemical (e.g., Glucose, Creatinine, BUN, Bilirubin)",
            "chemical_type": "metabolic/liver/kidney/cardiac",
            "value": numeric_value,
            "unit": "unit",
            "reference_range": "normal range",
            "is_abnormal": boolean,
            "patient_meaning": "What this chemical means for the patient's health",
            "graph_data": {
              "chart_type": "line/bar",
              "category": "chemicals",
              "color": "hex_color_code"
            }
          }
        ],
        "metals": [
          {
            "metal_name": "Name of metal (e.g., Iron, Zinc, Copper, Lead, Mercury)",
            "metal_type": "essential/toxic/trace",
            "value": numeric_value,
            "unit": "unit",
            "reference_range": "normal range",
            "is_abnormal": boolean,
            "patient_meaning": "What this metal means for the patient's health",
            "graph_data": {
              "chart_type": "line/bar",
              "category": "metals",
              "color": "hex_color_code"
            }
          }
        ]
      },
      "key_findings": [
        "List of important findings from the document in patient-friendly language"
      ],
      "risk_assessment": {
        "overall_risk": "low/medium/high",
        "risk_factors": ["List of risk factors identified in simple terms"],
        "recommendations": ["List of recommendations based on findings in patient-friendly language"]
      },
      "trend_analysis": {
        "improving_measurements": ["Measurements showing improvement"],
        "declining_measurements": ["Measurements showing decline"],
        "stable_measurements": ["Measurements remaining stable"],
        "new_abnormalities": ["New abnormal findings"]
      },
      "comparison_insights": "Analysis of how current results compare to previous data in simple terms",
      "action_items": ["Specific actions the patient should consider in clear language"],
      "graph_data": {
        "chartable_values": [
          {
            "name": "Measurement name for chart",
            "value": numeric_value,
            "date": "YYYY-MM-DD",
            "category": "Chart category",
            "unit": "unit",
            "chart_type": "line/bar/pie/scatter",
            "color": "hex_color_code"
          }
        ],
        "bloodwork_charts": [
          {
            "chart_title": "Blood Elements Overview",
            "chart_type": "bar",
            "data": [
              {
                "name": "Element name",
                "value": numeric_value,
                "unit": "unit",
                "is_abnormal": boolean,
                "color": "hex_color_code"
              }
            ]
          }
        ],
        "chemical_charts": [
          {
            "chart_title": "Chemical Profile",
            "chart_type": "line",
            "data": [
              {
                "name": "Chemical name",
                "value": numeric_value,
                "unit": "unit",
                "is_abnormal": boolean,
                "color": "hex_color_code"
              }
            ]
          }
        ],
        "metal_charts": [
          {
            "chart_title": "Metal Levels",
            "chart_type": "bar",
            "data": [
              {
                "name": "Metal name",
                "value": numeric_value,
                "unit": "unit",
                "is_abnormal": boolean,
                "color": "hex_color_code"
              }
            ]
          }
        ]
      }
    }

    IMPORTANT GUIDELINES:
    1. Extract ALL numerical values from ANY medical document (labs, imaging, vital signs, etc.)
    2. For imaging reports (CT, MRI, X-ray, ECG, Echo), extract measurements like:
       - Heart rate, blood pressure, ejection fraction
       - Dimensions, volumes, percentages
       - Any numerical findings that can be tracked over time
    3. For CT scans, look for measurements like:
       - Dimensions, volumes, densities
       - Percentages, ratios, scores
       - Any quantitative findings
    4. Compare current findings with previous data when available
    5. Identify trends, improvements, or concerning changes
    6. Provide actionable recommendations in patient-friendly language
    7. Assess overall health risk level
    8. Create chartable data for graphs, especially for bloodwork elements, chemicals, and metals
    9. Be thorough but concise in analysis
    10. Focus on measurements that can be tracked over time
    11. Extract non-data content like clinical notes, impressions, and recommendations
    12. Provide simple, clear explanations that patients can understand
    13. Categorize bloodwork into elements, chemicals, and metals for better visualization
    14. Generate appropriate graph types for different data categories

    CRITICAL: Return ONLY valid JSON. Do not include any explanatory text, introductions, or conclusions. Start with { and end with }. Do not say "As an AI" or any other text.
    `;

    let response;
    if (CLAUDEAI_API_KEY) {
      // Use Claude AI
      console.log('Using Claude AI for analysis...');
      response = await analyzeWithClaudeAI(prompt);
    } else {
      throw new Error('No Claude AI provider configured');
    }
    
    // Clean the response to extract only JSON
    let jsonResponse = response;
    
    // Remove any text before the first {
    const jsonStart = response.indexOf('{');
    if (jsonStart > 0) {
      jsonResponse = response.substring(jsonStart);
    }
    
    // Remove any text after the last }
    const jsonEnd = jsonResponse.lastIndexOf('}');
    if (jsonEnd > 0 && jsonEnd < jsonResponse.length - 1) {
      jsonResponse = jsonResponse.substring(0, jsonEnd + 1);
    }
    
    console.log('Cleaned AI response:', jsonResponse.substring(0, 200) + '...');
    
    const analysis = JSON.parse(jsonResponse);

    console.log(`AI analysis completed for record ${recordId}`);

    // Store the comprehensive analysis with proper JSON validation
    const numericalData = analysis.lab_tests_found ? JSON.stringify(analysis.lab_tests_found) : '[]';
    const medicalMeasurements = analysis.medical_measurements ? JSON.stringify(analysis.medical_measurements) : '[]';
    const trendsData = analysis.trend_analysis ? JSON.stringify(analysis.trend_analysis) : '{}';
    const recommendationsData = analysis.recommendations ? JSON.stringify(analysis.recommendations) : '[]';
    const graphData = analysis.graph_data ? JSON.stringify(analysis.graph_data) : '{}';
    const patientSummaryData = analysis.patient_summary ? JSON.stringify(analysis.patient_summary) : '{}';
    const nonDataContentData = analysis.non_data_content ? JSON.stringify(analysis.non_data_content) : '{}';
    const bloodworkAnalysisData = analysis.bloodwork_analysis ? JSON.stringify(analysis.bloodwork_analysis) : '{}';
    
    await pool.query(`
      INSERT INTO ai_lab_analysis 
      (user_id, record_id, analysis_type, test_name, summary, numerical_data, trends, recommendations, risk_level, confidence_score)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      userId,
      recordId,
      'comprehensive',
      'all_tests',
      analysis.document_summary || 'No summary available',
      JSON.stringify({
        lab_tests: analysis.lab_tests_found || [],
        medical_measurements: analysis.medical_measurements || [],
        graph_data: analysis.graph_data || {},
        patient_summary: analysis.patient_summary || {},
        non_data_content: analysis.non_data_content || {},
        bloodwork_analysis: analysis.bloodwork_analysis || {}
      }),
      trendsData,
      recommendationsData,
      analysis.risk_assessment?.overall_risk || 'unknown',
      0.9
    ]);

    // Extract and store individual lab values and medical measurements if found
    const allMeasurements = [
      ...(analysis.lab_tests_found || []),
      ...(analysis.medical_measurements || [])
    ];
    
    if (allMeasurements.length > 0) {
      console.log(`Extracting ${allMeasurements.length} measurements from AI analysis`);
      
      for (const measurement of allMeasurements) {
        if (measurement.value !== null && measurement.value !== undefined) {
          try {
            await pool.query(`
              INSERT INTO lab_values 
              (user_id, record_id, test_name, test_category, value, unit, reference_range, is_abnormal, test_date, confidence_score)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [
              userId,
              recordId,
              measurement.test_name || measurement.measurement_name,
              measurement.test_category || measurement.measurement_category,
              measurement.value,
              measurement.unit,
              measurement.reference_range,
              measurement.is_abnormal,
              measurement.test_date || measurement.measurement_date,
              0.9
            ]);
          } catch (insertError) {
            console.error('Error inserting measurement:', insertError);
          }
        }
      }
    }

    // Mark record as analyzed
    await pool.query(`
      UPDATE pdf_records SET lab_data_extracted = TRUE WHERE id = $1
    `, [recordId]);

    return analysis;
  } catch (error) {
    console.error('Error in AI lab analysis:', error);
    return null;
  }
}

// Legacy function for backward compatibility
async function extractLabDataFromText(text, recordId, userId) {
  return await analyzeLabDataWithAI(text, recordId, userId);
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
      'red blood cells', 'wbc', 'rbc', 'hct', 'mcv', 'mch', 'mchc',
      'mg/dl', 'mmol/l', 'g/dl', 'units/l', 'mcg/dl', 'ng/ml',
      'reference', 'normal', 'abnormal', 'high', 'low', 'range'
    ];

    const medicalKeywords = [
      'ecg', 'ekg', 'electrocardiogram', 'echocardiography', 'echo',
      'ct scan', 'mri', 'x-ray', 'ultrasound', 'radiology',
      'cardiology', 'cardiac', 'heart', 'pulse', 'rhythm',
      'blood pressure', 'bp', 'systolic', 'diastolic',
      'medical', 'clinical', 'diagnostic', 'examination',
      'patient', 'physician', 'doctor', 'hospital', 'clinic'
    ];

    const textLower = text.toLowerCase();
    const labMatches = labKeywords.filter(keyword => textLower.includes(keyword));
    const medicalMatches = medicalKeywords.filter(keyword => textLower.includes(keyword));
    
    console.log(`Lab report detection: Found ${labMatches.length} lab keywords, ${medicalMatches.length} medical keywords`);
    console.log('Lab keywords:', labMatches);
    console.log('Medical keywords:', medicalMatches);
    
    // Consider it a medical document if it has lab keywords OR medical keywords
    return labMatches.length >= 1 || medicalMatches.length >= 2;
  } catch (error) {
    console.error('Error detecting lab report:', error);
    return false;
  }
}

// Admin Routes

// Get all users (admin only)
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, email, full_name, role, created_at FROM users ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin users:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get all records from all users (admin only)
app.get('/api/admin/records', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        pr.*,
        u.username,
        u.full_name,
        u.email
      FROM pdf_records pr
      JOIN users u ON pr.user_id = u.id
      ORDER BY pr.upload_date DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching admin records:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get records for a specific user (admin only)
app.get('/api/admin/users/:userId/records', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
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
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching user records:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Update user role (admin only)
app.put('/api/admin/users/:userId/role', authenticateToken, requireAdmin, async (req, res) => {
  const { role } = req.body;
  
  if (!role || !['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Valid role required (admin or user)' });
  }

  try {
    const result = await pool.query(`
      UPDATE users SET role = $1 WHERE id = $2
    `, [role, req.params.userId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User role updated successfully' });
  } catch (error) {
    console.error('Error updating user role:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Delete user (admin only)
app.delete('/api/admin/users/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // First delete all lab values for this user
    await pool.query(`
      DELETE FROM lab_values WHERE user_id = $1
    `, [req.params.userId]);
    
    // Then delete all records for this user
    await pool.query(`
      DELETE FROM pdf_records WHERE user_id = $1
    `, [req.params.userId]);
    
    // Then delete the user
    const deleteUser = await pool.query(`
      DELETE FROM users WHERE id = $1
    `, [req.params.userId]);
    
    if (deleteUser.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User and all associated records deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Delete any record (admin only)
app.delete('/api/admin/records/:recordId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Get the record
    const recordResult = await pool.query(`
      SELECT * FROM pdf_records WHERE id = $1
    `, [req.params.recordId]);
    
    if (recordResult.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }
    
    const record = recordResult.rows[0];
    
    // Delete associated lab values and AI analysis
    await pool.query(`
      DELETE FROM lab_values WHERE record_id = $1
    `, [req.params.recordId]);
    
    await pool.query(`
      DELETE FROM ai_lab_analysis WHERE record_id = $1
    `, [req.params.recordId]);
    
    // Delete the record from database
    await pool.query(`
      DELETE FROM pdf_records WHERE id = $1
    `, [req.params.recordId]);
    
    // Delete the physical file
    try {
      if (fs.existsSync(record.file_path)) {
        fs.unlinkSync(record.file_path);
        console.log(`Admin deleted file: ${record.file_path}`);
      }
    } catch (fileError) {
      console.error('Error deleting physical file:', fileError);
      // Continue even if file deletion fails
    }
    
    res.json({ 
      message: 'Record deleted successfully by admin',
      deleted_record: {
        id: record.id,
        filename: record.original_name,
        user_id: record.user_id
      }
    });
  } catch (error) {
    console.error('Error deleting record:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Lab Data Routes

// Get user's lab values
app.get('/api/lab-values', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1
      ORDER BY lv.test_date DESC, lv.extraction_date DESC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lab values:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab values by test name (for trending)
app.get('/api/lab-values/:testName', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.test_name LIKE $2
      ORDER BY lv.test_date ASC, lv.extraction_date ASC
    `, [req.user.id, `%${req.params.testName}%`]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lab values by test name:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab categories
app.get('/api/lab-categories', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM lab_categories ORDER BY category_name
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lab categories:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab values by category
app.get('/api/lab-values/category/:category', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        lv.*,
        pr.original_name as record_name,
        pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 AND lv.test_category = $2
      ORDER BY lv.test_date DESC, lv.extraction_date DESC
    `, [req.user.id, req.params.category]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lab values by category:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab trends for a specific test
app.get('/api/lab-values/trends/:testName', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
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
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching lab trends:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab analytics summary
app.get('/api/lab-analytics/summary', authenticateToken, async (req, res) => {
  try {
    // Get total lab values
    const totalResult = await pool.query(`
      SELECT COUNT(*) as total FROM lab_values WHERE user_id = $1
    `, [req.user.id]);
    const total = totalResult.rows[0].total;

    // Get values by category
    const categoryResult = await pool.query(`
      SELECT test_category, COUNT(*) as count 
      FROM lab_values 
      WHERE user_id = $1 
      GROUP BY test_category
    `, [req.user.id]);
    const categories = categoryResult.rows;

    // Get abnormal values
    const abnormalResult = await pool.query(`
      SELECT COUNT(*) as count FROM lab_values 
      WHERE user_id = $1 AND is_abnormal = TRUE
    `, [req.user.id]);
    const abnormal = abnormalResult.rows[0].count;

    // Get recent trends (last 30 days)
    const recentResult = await pool.query(`
      SELECT lv.test_name, lv.value, lv.unit, lv.test_date, pr.upload_date
      FROM lab_values lv
      LEFT JOIN pdf_records pr ON lv.record_id = pr.id
      WHERE lv.user_id = $1 
      AND lv.extraction_date >= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY lv.extraction_date DESC
      LIMIT 20
    `, [req.user.id]);
    const recent = recentResult.rows;

    res.json({
      total_lab_values: total,
      by_category: categories,
      abnormal_count: abnormal,
      recent_trends: recent
    });
  } catch (error) {
    console.error('Error fetching lab analytics summary:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get all available test names for a user
app.get('/api/lab-values/test-names', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT test_name, test_category, COUNT(*) as count
      FROM lab_values 
      WHERE user_id = $1
      GROUP BY test_name, test_category
      ORDER BY count DESC, test_name ASC
    `, [req.user.id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching test names:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Re-analyze document with AI
app.post('/api/lab-values/extract/:recordId', authenticateToken, async (req, res) => {
  try {
    // Get the record
    const recordResult = await pool.query(`
      SELECT * FROM pdf_records WHERE id = $1 AND user_id = $2
    `, [req.params.recordId, req.user.id]);
    const record = recordResult.rows[0];
    
    if (!record) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // Delete existing lab values and AI analysis for this record
    await pool.query(`
      DELETE FROM lab_values WHERE record_id = $1
    `, [req.params.recordId]);
    
    await pool.query(`
      DELETE FROM ai_lab_analysis WHERE record_id = $1
    `, [req.params.recordId]);

    // Re-analyze with AI
    if (CLAUDEAI_API_KEY) {
      const analysis = await analyzeLabDataWithAI(record.extracted_data, req.params.recordId, req.user.id, record.record_type);
      res.json({ 
        message: 'Document re-analyzed successfully',
        extracted_tests: analysis?.lab_tests_found?.length || 0,
        summary: analysis?.document_summary
      });
    } else {
      res.status(400).json({ error: 'Claude API key not configured' });
    }
  } catch (error) {
    console.error('Error re-analyzing document:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get AI analysis for a specific record
app.get('/api/ai-analysis/:recordId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM ai_lab_analysis 
      WHERE record_id = $1 AND user_id = $2
      ORDER BY analysis_date DESC
      LIMIT 1
    `, [req.params.recordId, req.user.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'AI analysis not found' });
    }
    
    const analysis = result.rows[0];
    
    try {
      let parsedNumericalData = { 
        lab_tests: [], 
        medical_measurements: [], 
        graph_data: {},
        patient_summary: {},
        non_data_content: {},
        bloodwork_analysis: {}
      };
      
      // Handle both string and JSONB types
      if (analysis.numerical_data) {
        if (typeof analysis.numerical_data === 'string') {
          // String type - parse JSON
          if (analysis.numerical_data.trim() !== '') {
            parsedNumericalData = JSON.parse(analysis.numerical_data);
          }
        } else {
          // JSONB type - already parsed
          parsedNumericalData = analysis.numerical_data;
        }
      }
      
      let parsedTrends = {};
      if (analysis.trends) {
        if (typeof analysis.trends === 'string') {
          if (analysis.trends.trim() !== '') {
            parsedTrends = JSON.parse(analysis.trends);
          }
        } else {
          parsedTrends = analysis.trends;
        }
      }
      
      let parsedRecommendations = [];
      if (analysis.recommendations) {
        if (typeof analysis.recommendations === 'string') {
          if (analysis.recommendations.trim() !== '') {
            parsedRecommendations = JSON.parse(analysis.recommendations);
          }
        } else {
          parsedRecommendations = analysis.recommendations;
        }
      }
      
      res.json({
        ...analysis,
        numerical_data: parsedNumericalData,
        lab_tests: parsedNumericalData.lab_tests || [],
        medical_measurements: parsedNumericalData.medical_measurements || [],
        graph_data: parsedNumericalData.graph_data || {},
        patient_summary: parsedNumericalData.patient_summary || {},
        non_data_content: parsedNumericalData.non_data_content || {},
        bloodwork_analysis: parsedNumericalData.bloodwork_analysis || {},
        trends: parsedTrends,
        recommendations: parsedRecommendations
      });
    } catch (parseError) {
      console.error('Error parsing JSON for analysis ID:', analysis.id, parseError);
      // Return the analysis with default values if JSON parsing fails
      res.json({
        ...analysis,
        numerical_data: { 
          lab_tests: [], 
          medical_measurements: [], 
          graph_data: {},
          patient_summary: {},
          non_data_content: {},
          bloodwork_analysis: {}
        },
        lab_tests: [],
        medical_measurements: [],
        graph_data: {},
        patient_summary: {},
        non_data_content: {},
        bloodwork_analysis: {},
        trends: {},
        recommendations: []
      });
    }
  } catch (error) {
    console.error('Error fetching AI analysis:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get all AI analysis for user
app.get('/api/ai-analysis', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ala.*,
        pr.original_name as record_name,
        pr.record_type,
        pr.upload_date
      FROM ai_lab_analysis ala
      LEFT JOIN pdf_records pr ON ala.record_id = pr.id
      WHERE ala.user_id = $1
      ORDER BY ala.analysis_date DESC
    `, [req.user.id]);
    
    const analyses = result.rows.map(row => {
      try {
        let parsedNumericalData = { 
          lab_tests: [], 
          medical_measurements: [], 
          graph_data: {},
          patient_summary: {},
          non_data_content: {},
          bloodwork_analysis: {}
        };
        
        // Handle both string and JSONB types
        if (row.numerical_data) {
          if (typeof row.numerical_data === 'string') {
            // String type - parse JSON
            if (row.numerical_data.trim() !== '') {
              parsedNumericalData = JSON.parse(row.numerical_data);
            }
          } else {
            // JSONB type - already parsed
            parsedNumericalData = row.numerical_data;
          }
        }
        
        let parsedTrends = {};
        if (row.trends) {
          if (typeof row.trends === 'string') {
            if (row.trends.trim() !== '') {
              parsedTrends = JSON.parse(row.trends);
            }
          } else {
            parsedTrends = row.trends;
          }
        }
        
        let parsedRecommendations = [];
        if (row.recommendations) {
          if (typeof row.recommendations === 'string') {
            if (row.recommendations.trim() !== '') {
              parsedRecommendations = JSON.parse(row.recommendations);
            }
          } else {
            parsedRecommendations = row.recommendations;
          }
        }
        
        return {
          ...row,
          numerical_data: parsedNumericalData,
          lab_tests: parsedNumericalData.lab_tests || [],
          medical_measurements: parsedNumericalData.medical_measurements || [],
          graph_data: parsedNumericalData.graph_data || {},
          patient_summary: parsedNumericalData.patient_summary || {},
          non_data_content: parsedNumericalData.non_data_content || {},
          bloodwork_analysis: parsedNumericalData.bloodwork_analysis || {},
          trends: parsedTrends,
          recommendations: parsedRecommendations
        };
      } catch (parseError) {
        console.error('Error parsing JSON for analysis ID:', row.id, parseError);
        // Return the row with default values if JSON parsing fails
        return {
          ...row,
          numerical_data: { 
            lab_tests: [], 
            medical_measurements: [], 
            graph_data: {},
            patient_summary: {},
            non_data_content: {},
            bloodwork_analysis: {}
          },
          lab_tests: [],
          medical_measurements: [],
          graph_data: {},
          patient_summary: {},
          non_data_content: {},
          bloodwork_analysis: {},
          trends: {},
          recommendations: []
        };
      }
    });
    
    res.json(analyses);
  } catch (error) {
    console.error('Error fetching AI analyses:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get bloodwork analysis specifically
app.get('/api/bloodwork-analysis', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ala.numerical_data,
        pr.original_name as record_name,
        pr.record_type,
        pr.upload_date
      FROM ai_lab_analysis ala
      LEFT JOIN pdf_records pr ON ala.record_id = pr.id
      WHERE ala.user_id = $1
      ORDER BY ala.analysis_date DESC
    `, [req.user.id]);
    
    const bloodworkData = result.rows.map(row => {
      try {
        let parsedNumericalData = { bloodwork_analysis: {} };
        
        if (row.numerical_data) {
          if (typeof row.numerical_data === 'string') {
            if (row.numerical_data.trim() !== '') {
              parsedNumericalData = JSON.parse(row.numerical_data);
            }
          } else {
            parsedNumericalData = row.numerical_data;
          }
        }
        
        return {
          record_name: row.record_name,
          record_type: row.record_type,
          upload_date: row.upload_date,
          bloodwork_analysis: parsedNumericalData.bloodwork_analysis || {}
        };
      } catch (parseError) {
        console.error('Error parsing bloodwork data:', parseError);
        return {
          record_name: row.record_name,
          record_type: row.record_type,
          upload_date: row.upload_date,
          bloodwork_analysis: {}
        };
      }
    });
    
    res.json(bloodworkData);
  } catch (error) {
    console.error('Error fetching bloodwork analysis:', error);
    return res.status(500).json({ error: 'Database error' });
  }
});

// Get lab trends grouped by record_type and test_name
app.get('/api/lab-values/grouped-trends', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
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
    const rows = result.rows;
    // Group by record_type and test_name
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.record_type]) grouped[row.record_type] = {};
      if (!grouped[row.record_type][row.test_name]) grouped[row.record_type][row.test_name] = [];
      grouped[row.record_type][row.test_name].push(row);
    }
    res.json(grouped);
  } catch (error) {
    console.error('Error fetching grouped trends:', error);
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