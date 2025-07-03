const bcrypt = require('bcryptjs');

const password = 'admin123';
const hash = bcrypt.hashSync(password, 10);

console.log('Password:', password);
console.log('Bcrypt Hash:', hash);
console.log('Verification:', bcrypt.compareSync(password, hash));

// Also test with the hash from the server.js file
const serverHash = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';
console.log('\nTesting server hash:');
console.log('Server hash verification:', bcrypt.compareSync(password, serverHash)); 