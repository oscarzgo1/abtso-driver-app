process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://imfgzhxdzxkifuncowrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('--- Cleaning live Supabase database: imfgzhxdzxkifuncowrl ---');

  // Authenticate as admin to bypass RLS policies
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@abtso.co.uk',
    password: 'admin123'
  });

  if (authError) {
    console.error('Authentication failed:', authError.message);
    return;
  }
  console.log('Successfully authenticated as admin.');

  // Delete in correct order to respect foreign key constraints
  console.log('Deleting gps_locations...');
  const { error: errGps } = await supabase.from('gps_locations').delete().neq('id', 0); // deletes all
  if (errGps) console.error('Error deleting gps_locations:', errGps.message);

  console.log('Deleting idle_alerts...');
  const { error: errIdle } = await supabase.from('idle_alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errIdle) console.error('Error deleting idle_alerts:', errIdle.message);

  console.log('Deleting sos_alerts (if any)...');
  try {
    const { error: errSos } = await supabase.from('sos_alerts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (errSos) console.error('Error deleting sos_alerts:', errSos.message);
  } catch (e) {
    console.log('sos_alerts table check done.');
  }

  console.log('Deleting shifts...');
  const { error: errShf } = await supabase.from('shifts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errShf) console.error('Error deleting shifts:', errShf.message);

  console.log('Deleting drivers...');
  const { error: errDrv } = await supabase.from('drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (errDrv) console.error('Error deleting drivers:', errDrv.message);

  console.log('--- Cleanup complete! Your database is now a clean slate for launch. ---');
}

run();
