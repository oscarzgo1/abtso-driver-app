// Bypass SSL certificate checks for local network proxy
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lewwfurlewlbgikzunsi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxld3dmdXJsZXdsYmdpa3p1bnNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM0NDY2NzYsImV4cCI6MjA5OTAyMjY3Nn0.UK_GuiQHxFOqGUdvGihP-QmQ48ANc8dDRb9loqrZ5Ws';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  console.log('Logging in as admin...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@abtso.co.uk',
    password: 'admin123'
  });

  if (authError) {
    console.error('Auth Error:', authError.message);
    process.exit(1);
  }

  console.log('Successfully logged in! Fetching auth.users diagnostic info...');
  
  // Query auth.users columns and check for NULLs
  const { data, error } = await supabase
    .from('drivers')
    .select('*');

  if (error) {
    console.error('Database Error:', error.message);
    process.exit(1);
  }

  console.log('Driver Profiles in public.drivers:');
  console.log(data);
}

run();
