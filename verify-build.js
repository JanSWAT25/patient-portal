const fs = require('fs');
const path = require('path');

console.log('=== Build Verification ===');
console.log('Current directory:', process.cwd());
console.log('Directory contents:', fs.readdirSync('.'));

const clientDir = path.join(process.cwd(), 'client');
if (fs.existsSync(clientDir)) {
  console.log('Client directory exists');
  console.log('Client directory contents:', fs.readdirSync(clientDir));
  
  const buildDir = path.join(clientDir, 'build');
  if (fs.existsSync(buildDir)) {
    console.log('Build directory exists');
    console.log('Build directory contents:', fs.readdirSync(buildDir));
    
    const indexPath = path.join(buildDir, 'index.html');
    if (fs.existsSync(indexPath)) {
      console.log('✅ index.html exists');
    } else {
      console.log('❌ index.html not found');
    }
  } else {
    console.log('❌ Build directory not found');
  }
} else {
  console.log('❌ Client directory not found');
} 