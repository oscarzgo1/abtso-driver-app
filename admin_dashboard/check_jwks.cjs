process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function checkJWKS() {
  const url = 'https://lewwfurlewlbgikzunsi.supabase.co/auth/v1/.well-known/jwks.json';
  console.log('Fetching JWKS from:', url);
  try {
    const res = await fetch(url);
    console.log('Status Code:', res.status);
    const data = await res.json();
    console.log('JWKS keys:', JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

checkJWKS();
