process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://imfgzhxdzxkifuncowrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('--- Registering admin in Supabase auth system ---');

  const { data, error } = await supabase.auth.signUp({
    email: 'admin@abtso.co.uk',
    password: 'admin123'
  });

  if (error) {
    console.error('Registration failed:', error.message);
  } else {
    console.log('Successfully registered / checked admin user in Supabase auth!', data);
  }
}

run();
