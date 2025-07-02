const { Pool } = require('pg');

// Test database connection with separate parameters
async function testConnectionAlt() {
  console.log('Testing database connection with separate parameters...');
  
  const pool = new Pool({ 
    host: 'db.vfqxqgpmlybmbucpfnoc.supabase.co',
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: 'kymsos-hisqe8-zeGqij',
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

testConnectionAlt(); 