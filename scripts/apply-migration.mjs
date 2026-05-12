#!/usr/bin/env node
// A.D.A.M. — Aplica una migration SQL directa contra la BD de Supabase.
// Uso:
//   node --env-file=.env.local scripts/apply-migration.mjs supabase/migrations/0001_init.sql
//
// Lee POSTGRES_URL_NON_POOLING de .env.local (el non-pooling es preferible para
// DDL multi-statement, evita problemas con prepared statements del pooler).

import { readFileSync } from 'node:fs';
import postgres from 'postgres';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-migration.mjs <path.sql>');
  process.exit(1);
}

const url = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
if (!url) {
  console.error('POSTGRES_URL_NON_POOLING o POSTGRES_URL no estan definidos en .env.local');
  process.exit(1);
}

const sql = postgres(url, {
  ssl: 'require',
  max: 1,
  idle_timeout: 5,
  prepare: false,
});

const script = readFileSync(file, 'utf8');
console.log(`[migration] aplicando ${file} (${script.length} bytes)...`);

try {
  await sql.unsafe(script);
  console.log('[migration] OK');

  const tables = await sql`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;
  console.log('[migration] tablas en public:', tables.map((t) => t.table_name).join(', '));

  const policies = await sql`
    select count(*)::int as n from pg_policies where schemaname = 'public'
  `;
  console.log('[migration] RLS policies en public:', policies[0].n);
} catch (err) {
  console.error('[migration] FALLO:', err.message);
  process.exit(2);
} finally {
  await sql.end();
}
