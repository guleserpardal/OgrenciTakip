// Testler icin kucuk statik sunucu. Uygulama ES modulu kullandigindan
// file:// ile calismaz; gercek bir HTTP kokeni gerekir.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WWW = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'www');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export async function startServer(root = WWW) {
  const server = createServer((req, res) => {
    let path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') path = '/index.html';
    const file = join(root, path);
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': `${MIME[extname(file)] || 'application/octet-stream'}; charset=utf-8`,
    });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

/** Playwright'in kullanacagi Chromium yolu (ortam degiskeniyle gecersiz kilinabilir). */
export function chromiumPath() {
  return process.env.CHROMIUM_PATH || undefined;
}

export function makeReporter(label) {
  const results = [];
  return {
    ok(name, pass, detail = '') {
      results.push({ name, pass, detail });
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
    },
    finish() {
      const failed = results.filter((r) => !r.pass);
      console.log(`\n${'='.repeat(49)}`);
      console.log(`${label}: ${results.length} test — ${results.length - failed.length} geçti, ${failed.length} başarısız`);
      if (failed.length) {
        console.log('\nBaşarısız olanlar:');
        for (const f of failed) console.log(` - ${f.name}${f.detail ? `  [${f.detail}]` : ''}`);
      }
      return failed.length;
    },
  };
}
