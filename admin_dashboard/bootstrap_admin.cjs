/**
 * ABTSO Logistics — Break-glass admin bootstrap
 * =============================================
 * Creates or repairs a dashboard admin account and assigns its department,
 * for when nobody can sign in and the Team Access panel is unreachable.
 *
 * Unlike register_admin.cjs this uses the SERVICE ROLE key and admin.createUser,
 * so the account is created already confirmed — no mailbox required.
 *
 * Nothing secret is stored in this file: both values come from the environment.
 * Get the service role key from:
 *   Supabase Dashboard -> Project Settings -> API -> service_role (secret)
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_URL="https://<ref>.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
 *   node bootstrap_admin.cjs admin@abtso.co.uk "YourNewPassword" payroll_admin
 *
 * Usage (bash):
 *   SUPABASE_URL="https://<ref>.supabase.co" \
 *   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" \
 *   node bootstrap_admin.cjs admin@abtso.co.uk "YourNewPassword" payroll_admin
 *
 * The service role key bypasses every RLS policy. Never commit it, never put
 * it in the dashboard's .env (that file ships to the browser).
 */

const { createClient } = require('@supabase/supabase-js');

const VALID_ROLES = ['logistics', 'payroll_admin'];

async function run() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const [, , emailArg, password, roleArg] = process.argv;

  if (!url || !serviceKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    console.error('See the usage comment at the top of this file.');
    process.exit(1);
  }

  const email = (emailArg || '').toLowerCase().trim();
  const role = roleArg || 'payroll_admin';

  if (!email.includes('@') || !password) {
    console.error('Usage: node bootstrap_admin.cjs <email> <password> [logistics|payroll_admin]');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Role must be one of: ${VALID_ROLES.join(', ')}`);
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(`--- Bootstrapping ${email} as ${role} ---`);

  // 1. Does an auth user already exist for this address?
  let existing = null;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.error('Could not list users:', error.message);
      process.exit(1);
    }
    existing = data.users.find(u => (u.email || '').toLowerCase().trim() === email);
    if (existing || data.users.length < 200) break;
  }

  // 2. Create it, or reset the password and force-confirm it.
  if (existing) {
    console.log(`Auth user exists (id ${existing.id}); resetting password and confirming email.`);
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('Password reset failed:', error.message);
      process.exit(1);
    }
    console.log('Password reset and address confirmed.');
  } else {
    console.log('No auth user found — creating one.');
    const { error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) {
      console.error('User creation failed:', error.message);
      process.exit(1);
    }
    console.log('Auth user created (already confirmed).');
  }

  // 3. Assign the department. The deployed user_roles table is keyed by
  //    email and has no user_id column.
  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ email, role }, { onConflict: 'email' });

  if (roleError) {
    console.error('Department assignment failed:', roleError.message);
    process.exit(1);
  }

  console.log(`Department set to ${role}.`);
  console.log('\nDone. Sign in at the dashboard with this email and password.');
  console.log('Change the password from Team Access once you are in.');
}

run().catch(err => {
  console.error('Unexpected failure:', err.message);
  process.exit(1);
});
