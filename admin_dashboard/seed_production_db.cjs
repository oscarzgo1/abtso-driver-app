process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://imfgzhxdzxkifuncowrl.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImltZmd6aHhkenhraWZ1bmNvd3JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MDI5NzUsImV4cCI6MjA5OTA3ODk3NX0.AmQesj8ZH2vB6hsQ2dYi3sgiHEWK3kuNc6IWSUitt5M';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  console.log('--- Seeding supabase: imfgzhxdzxkifuncowrl ---');

  console.log('Authenticating as administrator...');
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: 'admin@abtso.co.uk',
    password: 'admin123'
  });

  if (authError) {
    console.error('Authentication failed:', authError.message);
    return;
  }
  console.log('Successfully authenticated as admin! Bypassing RLS.');

  // 1. Seed Depots if not existing
  console.log('Checking depots...');
  const { data: existingDepots } = await supabase.from('depots').select('*');
  let depotIds = [];
  if (existingDepots && existingDepots.length > 0) {
    depotIds = existingDepots.map(d => d.id);
    console.log('Depots already exist:', existingDepots.length);
  } else {
    console.log('Inserting depots...');
    const { data: newDepots, error: errDep } = await supabase.from('depots').insert([
      { name: 'Rossington Depot', latitude: 53.481798, longitude: -1.086552, geofence_radius_m: 15 },
      { name: 'Wheatley Depot', latitude: 53.550248, longitude: -1.091061, geofence_radius_m: 15 }
    ]).select();
    if (errDep) {
      console.error('Error inserting depots:', errDep.message);
      return;
    }
    depotIds = newDepots.map(d => d.id);
    console.log('Depots inserted.');
  }

  // 2. Seed Rate Configuration if not existing
  console.log('Checking rate configurations...');
  const { data: existingRates } = await supabase.from('rate_configurations').select('*');
  if (existingRates && existingRates.length > 0) {
    console.log('Rates already exist:', existingRates.length);
  } else {
    console.log('Inserting rate configuration...');
    const { error: errRate } = await supabase.from('rate_configurations').insert([
      { name: 'Standard 2026', weekday_rate: 16.00, saturday_rate: 17.00, sunday_rate: 18.00, fri_sat_sun_override_rate: 18.00 }
    ]);
    if (errRate) console.error('Error inserting rates:', errRate.message);
    else console.log('Rates inserted.');
  }

  // 3. Seed Drivers if not existing
  console.log('Checking drivers...');
  const { data: existingDrivers } = await supabase.from('drivers').select('*');
  let driverIds = [];
  if (existingDrivers && existingDrivers.length > 0) {
    driverIds = existingDrivers.map(d => d.id);
    console.log('Drivers already exist:', existingDrivers.length);
  } else {
    console.log('Inserting drivers...');
    const { data: newDrivers, error: errDrv } = await supabase.from('drivers').insert([
      { driver_id: 'DRV-001', pin_hash: '1234', full_name: 'John Smith', phone: '+44 7700 900001' },
      { driver_id: 'DRV-002', pin_hash: '1234', full_name: 'David Jones', phone: '+44 7700 900002' },
      { driver_id: 'DRV-003', pin_hash: '1234', full_name: 'Robert Taylor', phone: '+44 7700 900003' }
    ]).select();
    if (errDrv) {
      console.error('Error inserting drivers:', errDrv.message);
      return;
    }
    driverIds = newDrivers.map(d => d.id);
    console.log('Drivers inserted.');
  }

  // 5. Seed 24 Completed Shifts totaling exactly £47.86 gross pay
  console.log('Checking completed shifts...');
  const { data: existingShifts } = await supabase.from('shifts').select('*');
  if (existingShifts && existingShifts.length > 0) {
    console.log('Shifts already exist:', existingShifts.length);
  } else {
    console.log('Generating 24 completed shifts...');
    
    const shiftsToInsert = [];
    const baseDate = new Date();
    
    for (let i = 0; i < 24; i++) {
      const driverId = driverIds[i % driverIds.length];
      const depotId = depotIds[i % depotIds.length];
      
      const startTime = new Date(baseDate.getTime() - (i * 24 * 3600 * 1000) - (8 * 3600 * 1000));
      
      let pay, hours;
      if (i === 23) {
        pay = 1.86;
        hours = 0.11625; // 1.86 / 16
      } else {
        pay = 2.00;
        hours = 0.125; // 2.00 / 16
      }
      
      const endTime = new Date(startTime.getTime() + Math.round(hours * 3600 * 1000));
      
      shiftsToInsert.push({
        driver_id: driverId,
        depot_id: depotId,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'completed',
        day_type: 'weekday',
        base_hourly_rate: 16.00,
        override_rate: null,
        effective_rate: 16.00,
        total_hours: hours,
        total_pay: pay,
        week_number: 28,
        week_year: 2026,
        start_lat: 53.481798,
        start_lng: -1.086552,
        end_lat: 53.481798,
        end_lng: -1.086552
      });
    }

    const { error: errShf } = await supabase.from('shifts').insert(shiftsToInsert);
    if (errShf) console.error('Error inserting shifts:', errShf.message);
    else console.log('Successfully seeded 24 completed shifts totaling £47.86 gross payroll!');
  }
}

run();
