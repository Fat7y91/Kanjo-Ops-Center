#!/usr/bin/env node
/* Kanjo Ops — bootstrap the first Founder / Super Admin.
 *
 * Why a script and not SQL: Supabase owns credential storage. Writing a row
 * straight into auth.users would bypass GoTrue's password hashing and its
 * identity tables (auth.identities), producing an account that cannot sign in.
 * The Admin API is the supported path and fires the same trigger that mirrors
 * the profile into app.users.
 *
 * Requirements:
 *   SUPABASE_URL               : https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY  : service-role secret (never commit, never print)
 *   app.permissions must be seeded first (20261029000200_seed_permissions.sql)
 *
 * Usage:
 *   node --env-file=.env.local scripts/bootstrap-founder.mjs
 *   node --env-file=.env.local scripts/bootstrap-founder.mjs --phone +201000000000
 *
 * The password is read from KANJO_FOUNDER_PASSWORD, or prompted for on a TTY.
 * It is never echoed and never logged.
 */

import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline/promises';

const DEFAULT_PHONE = '+201000000000';
const FULL_NAME = process.env.KANJO_FOUNDER_NAME ?? 'Founder';
const TITLE = process.env.KANJO_FOUNDER_TITLE ?? 'المؤسس';
const TEAM = process.env.KANJO_FOUNDER_TEAM ?? 'الإدارة التنفيذية';
const CLEARANCE_LEVEL = 4;

function fail(message) {
  console.error(`\n  ✗ ${message}\n`);
  process.exit(1);
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

async function readPassword() {
  const fromEnv = process.env.KANJO_FOUNDER_PASSWORD;
  if (fromEnv) return fromEnv;

  if (!process.stdin.isTTY) {
    fail('Set KANJO_FOUNDER_PASSWORD when running non-interactively.');
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const value = await rl.question('New founder password (min 12 chars): ');
    return value;
  } finally {
    rl.close();
  }
}

function assertPassword(password) {
  if (password.length < 12) fail('Password must be at least 12 characters.');
  // bcrypt truncates past 72 bytes; refuse rather than silently store a prefix.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    fail('Password exceeds 72 bytes; bcrypt would silently truncate it.');
  }
}

async function findUserByPhone(client, phone) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) fail(`Could not list auth users: ${error.message}`);

    const match = data.users.find((user) => user.phone === phone);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function ensureAuthUser(client, phone, password) {
  const { data, error } = await client.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

  if (!error && data.user) {
    console.log(`  · created auth user ${data.user.id}`);
    return data.user;
  }

  if (error?.code !== 'phone_exists' && error?.status !== 422) {
    fail(`Could not create auth user: ${error?.message ?? 'unknown error'}`);
  }

  const existing = await findUserByPhone(client, phone);
  if (!existing) fail('Phone reported as taken but no matching user was found.');

  // Re-converge an existing row: reset the password and confirm the phone so a
  // half-finished earlier attempt cannot leave a login that never works.
  const { error: updateError } = await client.auth.admin.updateUserById(
    existing.id,
    { password, phone_confirm: true },
  );
  if (updateError) fail(`Could not reset password: ${updateError.message}`);

  console.log(`  · reusing existing auth user ${existing.id} (password reset)`);
  return existing;
}

async function ensureProfile(client, userId) {
  const { data, error } = await client
    .schema('app')
    .from('users')
    .update({
      full_name: FULL_NAME,
      title: TITLE,
      team: TEAM,
      clearance_level: CLEARANCE_LEVEL,
      active: true,
    })
    .eq('id', userId)
    .select('id, phone, clearance_level, global_scope');

  if (error) fail(`Could not update profile: ${error.message}`);
  if (!data || data.length === 0) {
    fail('Profile row missing. Did the auth trigger run? Check the migration.');
  }

  const profile = data[0];
  console.log(
    `  · profile set: level ${profile.clearance_level}, global_scope ${profile.global_scope}`,
  );
}

async function grantAllPermissions(client, userId) {
  const { data: permissions, error } = await client
    .schema('app')
    .from('permissions')
    .select('key')
    .order('key');

  if (error) fail(`Could not read permissions: ${error.message}`);
  if (!permissions || permissions.length === 0) {
    fail('app.permissions is empty. Run 20261029000200_seed_permissions.sql first.');
  }

  const rows = permissions.map((permission) => ({
    user_id: userId,
    permission_key: permission.key,
    granted_by: userId,
  }));

  const { error: grantError } = await client
    .schema('app')
    .from('user_permissions')
    .upsert(rows, { onConflict: 'user_id,permission_key', ignoreDuplicates: true });

  if (grantError) fail(`Could not grant permissions: ${grantError.message}`);

  console.log(`  · granted ${rows.length} permissions`);
  return rows.length;
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    fail('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.');
  }

  const phone = argValue('--phone') ?? DEFAULT_PHONE;
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) {
    fail(`Phone must be E.164, got: ${phone}`);
  }

  const password = await readPassword();
  assertPassword(password);

  console.log('\nBootstrapping founder account');
  console.log(`  · phone ${phone}`);

  const client = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const user = await ensureAuthUser(client, phone, password);
  await ensureProfile(client, user.id);
  const granted = await grantAllPermissions(client, user.id);

  console.log('\n  ✓ Founder ready.');
  console.log(`    id:          ${user.id}`);
  console.log(`    phone:       ${phone}`);
  console.log(`    permissions: ${granted}`);
  console.log('\n  Next: sign in with phone + password once password login is wired.');
  console.log('');
}

main().catch((error) => fail(error?.message ?? String(error)));
