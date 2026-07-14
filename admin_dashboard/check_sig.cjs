const crypto = require('crypto');

// The token returned by the Edge function in our earlier test
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyZDg5MzQzYS0xNTE2LTQ1YTAtYTRmNi03MzhmNWRiZDcxNGQiLCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImRyaXZlcl9pZCI6IkRSVi0wMDEiLCJmdWxsX25hbWUiOiJKb2huIFNtaXRoIChUZXN0IERyaXZlcikiLCJpc3MiOiJzdXBhYmFzZSIsImlhdCI6MTc4MzQ1Nzk1NSwiZXhwIjoxNzgzNTAxMTU1LCJhdWQiOiJhdXRoZW50aWNhdGVkIn0.m2bXQc_yK_NChUPC7uahKpMldq1mh5ZM0aGhPou4NV4';

const [header, payload, signature] = token.split('.');

// Base64Url decode helper
function base64UrlDecode(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString();
}

console.log('Decoded Header:', base64UrlDecode(header));
console.log('Decoded Payload:', base64UrlDecode(payload));

// Verify signature using various fallback keys
const testSecrets = ['undefined', 'null', '', 'JWT_SECRET', 'supabase'];

for (const secret of testSecrets) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${header}.${payload}`);
  const calculatedSignature = hmac.digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  
  if (calculatedSignature === signature) {
    console.log(`\n🎉 MATCH FOUND! The token was signed with the secret: "${secret}"`);
    process.exit(0);
  }
}

console.log('\n❌ No match found with standard undefined/null placeholders.');
