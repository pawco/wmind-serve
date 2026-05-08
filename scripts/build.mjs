import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));

mkdirSync(resolve(root, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: ['src/cli.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/cli.mjs',
  packages: 'bundle',
  external: ['systeminformation'],
  define: {
    'import.meta.env.PACKAGE_VERSION': `"${pkg.version}"`,
  },
  banner: {
    js: `import{createRequire as _cr}from"node:module";import{fileURLToPath as _fu}from"node:url";import{dirname as _dn}from"node:path";var require=_cr(import.meta.url);var __filename=_fu(import.meta.url);var __dirname=_dn(__filename);`,
  },
  minify: false,
  sourcemap: false,
});

writeFileSync(
  resolve(root, 'dist', 'cli.cjs'),
  `#!/usr/bin/env node
const { pathToFileURL } = require('url');
const { join } = require('path');
import(pathToFileURL(join(__dirname, 'cli.mjs')).href);
`,
);

console.log(`Built dist/ (v${pkg.version})`);
