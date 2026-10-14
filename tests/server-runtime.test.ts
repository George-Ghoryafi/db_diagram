import { test } from 'node:test';
import { mkdtempSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

test('the deployed API module graph initializes under native Node ESM, without tsx resolution', () => {
  const directory = mkdtempSync(join(tmpdir(), 'schema-api-runtime-'));
  try {
    execFileSync(join(process.cwd(), 'node_modules/.bin/tsc'), ['--outDir', directory, '--noEmit', 'false', '--allowImportingTsExtensions', 'false'], { timeout: 30000 });
    writeFileSync(join(directory, 'package.json'), '{"type":"module"}');
    symlinkSync(join(process.cwd(), 'node_modules'), join(directory, 'node_modules'), 'dir');
    execFileSync(process.execPath, ['--input-type=module', '--eval', `import { arrangedLayout } from ${JSON.stringify(pathToFileURL(join(directory, 'server/layout.js')).href)}; const result=await arrangedLayout('Table a { id int }', 'left-right'); if (!result['public.a']) throw new Error('Native layout failed');`], { timeout: 15000 });
    execFileSync(process.execPath, ['--input-type=module', '--eval', `import handler from ${JSON.stringify(pathToFileURL(join(directory, 'api/handler.js')).href)}; if (typeof handler !== 'function') throw new Error('API failed to initialize');`], { timeout: 15000 });
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
