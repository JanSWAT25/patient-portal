const fs = require('fs');
const path = require('path');

console.log('=== Build Verification Script ===');

// Check if client directory exists
const clientDir = path.join(__dirname, 'client');
if (!fs.existsSync(clientDir)) {
  console.error('❌ Client directory not found');
  process.exit(1);
}
console.log('✅ Client directory exists');

// Check if client/build directory exists
const buildDir = path.join(clientDir, 'build');
if (!fs.existsSync(buildDir)) {
  console.error('❌ Client/build directory not found');
  console.log('Current directory contents:');
  console.log(fs.readdirSync(clientDir));
  process.exit(1);
}
console.log('✅ Client/build directory exists');

// Check if index.html exists
const indexPath = path.join(buildDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  console.error('❌ index.html not found in build directory');
  console.log('Build directory contents:');
  console.log(fs.readdirSync(buildDir));
  process.exit(1);
}
console.log('✅ index.html exists');

// Check if static directory exists
const staticDir = path.join(buildDir, 'static');
if (!fs.existsSync(staticDir)) {
  console.error('❌ static directory not found in build');
  process.exit(1);
}
console.log('✅ static directory exists');

console.log('✅ Build verification completed successfully');
console.log('Build directory contents:');
console.log(fs.readdirSync(buildDir)); 