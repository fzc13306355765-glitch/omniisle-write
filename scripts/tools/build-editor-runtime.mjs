import { build } from 'esbuild';
import fs from 'node:fs';
import crypto from 'node:crypto';

await build({
  entryPoints: {
    runtime: 'scripts/editor/tiptap-runtime-entry.js',
    core: 'scripts/editor/tiptap-core-entry.js',
    starter: 'scripts/editor/tiptap-starter-entry.js',
    'pm-model': '@tiptap/pm/model',
    'pm-state': '@tiptap/pm/state',
    'pm-view': '@tiptap/pm/view',
    'pm-transform': '@tiptap/pm/transform',
    'pm-commands': '@tiptap/pm/commands',
    'pm-history': '@tiptap/pm/history',
    'pm-inputrules': '@tiptap/pm/inputrules',
    'pm-keymap': '@tiptap/pm/keymap',
    'pm-schema-list': '@tiptap/pm/schema-list'
  },
  outdir: 'scripts/vendor/tiptap',
  bundle: true,
  splitting: true,
  format: 'esm',
  platform: 'browser',
  target: ['chrome90', 'edge90', 'firefox90', 'safari15'],
  minify: true,
  legalComments: 'eof',
  banner: {
    js: '/*! Third-party license notices: see THIRD_PARTY_NOTICES.md in the source distribution. */'
  },
  sourcemap: false,
  charset: 'utf8',
  entryNames: '[name]',
  chunkNames: 'chunks/[name]-[hash]'
});

console.log('Built split TipTap runtime in scripts/vendor/tiptap/');
const fingerprint = crypto.createHash('sha256').update(fs.readFileSync('scripts/vendor/tiptap/runtime.js')).digest('hex').slice(0, 12);
const html = fs.readFileSync('index.html', 'utf8');
fs.writeFileSync('index.html', html.replace(/(scripts\/vendor\/tiptap\/runtime\.js\?v=)[^"']+/, '$1' + fingerprint));
