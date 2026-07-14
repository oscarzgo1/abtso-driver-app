process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://imfgzhxdzxkifuncowrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('--- Inspecting supabase: imfgzhxdzxkifuncowrl ---');
  
  const { data: drivers, error: errDrv } = await supabase.from('drivers').select('*');
  if (errDrv) console.error('Drivers Error:', errDrv.message);
  else console.log('Drivers Count:', drivers.length, drivers);

  const { data: shifts, error: errShf } = await supabase.from('shifts').select('*');
  if (errShf) console.error('Shifts Error:', errShf.message);
  else {
    console.log('Shifts Count:', shifts.length);
    if (shifts.length > 0) {
      console.log('First 5 Shifts:', shifts.slice(0, 5));
    }
  }

  const { data: configs, error: errCfg } = await supabase.from('rate_configurations').select('*');
  if (errCfg) console.error('Rates Error:', errCfg.message);
  else console.log('Rates:', configs);
}

run();
