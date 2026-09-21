#!/usr/bin/env node
// Web varliklarini dogrular. Capacitor dogrudan `www/` klasorunu paketledigi icin
// ayri bir bundler yoktur; bu adim paketlemeden once hatalari yakalar:
//   1. Tum JS dosyalari sozdizimi kontrolunden gecer.
//   2. Hicbir dis kaynak (CDN) referansi olmamalidir — uygulama tamamen offline.
//   3. index.html'in referans verdigi yerel dosyalar gercekten var olmalidir.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WWW = join(ROOT, 'www');

const errors = [];
const warnings = [];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

if (!existsSync(WWW)) {
  console.error('www/ klasoru bulunamadi.');
  process.exit(1);
}

const files = walk(WWW);
const jsFiles = files.filter((f) => f.endsWith('.js'));
const textFiles = files.filter((f) => /\.(js|html|css|json)$/.test(f));

/* 1 — sozdizimi */
for (const file of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    errors.push(`Sozdizimi hatasi: ${relative(ROOT, file)}\n${e.stderr?.toString() || e.message}`);
  }
}

/* 2 — dis kaynak yok */
const REMOTE = /\b(?:src|href)\s*=\s*["']https?:\/\//gi;
const REMOTE_FETCH = /\b(?:fetch|importScripts|import)\s*\(\s*["']https?:\/\//gi;
const CSS_REMOTE = /url\(\s*["']?https?:\/\//gi;
for (const file of textFiles) {
  const text = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  for (const [label, re] of [['etiket', REMOTE], ['dinamik yukleme', REMOTE_FETCH], ['css url()', CSS_REMOTE]]) {
    const hits = text.match(re);
    if (hits) errors.push(`Dis kaynak (${label}) bulundu — CDN kullanilmamali: ${rel} -> ${hits.join(', ')}`);
  }
}

/* 3 — index.html referanslari */
const indexPath = join(WWW, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
for (const m of indexHtml.matchAll(/(?:src|href)\s*=\s*["']([^"'#?]+)["']/g)) {
  const ref = m[1];
  if (/^(https?:)?\/\//.test(ref) || ref.startsWith('data:')) continue;
  const target = join(WWW, ref);
  if (!existsSync(target)) errors.push(`index.html eksik dosyaya referans veriyor: ${ref}`);
}

/* 4 — ozet */
const totalBytes = files.reduce((n, f) => n + statSync(f).size, 0);
if (totalBytes > 8 * 1024 * 1024) warnings.push(`www/ boyutu buyuk: ${(totalBytes / 1048576).toFixed(1)} MB`);

const verifyOnly = process.argv.includes('--verify-only');

console.log(`Evde Egitim Takip — web varliklari kontrolu`);
console.log(`  dosya    : ${files.length} (${jsFiles.length} JS)`);
console.log(`  boyut    : ${(totalBytes / 1024).toFixed(0)} KB`);
console.log(`  dis kaynak: yok (CDN bagimliligi olmamali)`);

for (const w of warnings) console.warn(`  UYARI: ${w}`);

if (errors.length) {
  console.error(`\n${errors.length} hata bulundu:\n`);
  for (const e of errors) console.error(` - ${e}`);
  process.exit(1);
}

console.log(verifyOnly ? '\nDogrulama tamam.' : '\nBuild tamam — `npx cap sync android` ile Android projesine kopyalanabilir.');
