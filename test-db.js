const { Pool } = require('pg');

// Test database connection
async function testConnection() {
  const connectionString = 'postgresql://postgres:kymsos-hisqe8-zeGqij@db.vfqxqgpmlybmbucpfnoc.supabase.co:5432/postgres';
  
  console.log('Testing database connection...');
  console.log('Connection string format looks correct');
  
  const pool = new Pool({ 
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('Attempting to connect...');
    const client = await pool.connect();
    console.log('✅ Database connection successful!');
    
    // Test a simple query
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Query test successful:', result.rows[0]);
    
    client.release();
    await pool.end();
    console.log('Connection closed successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.error('Error details:', error);
  }
}

testConnection(); 