import * as esbuild from 'esbuild';
import { mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = new Set(process.argv.slice(2));
const production = args.has('--production');
const watch = args.has('--watch');
const tests = args.has('--tests');

const common = {
  absWorkingDir: root,
  bundle: true,
  sourcemap: production ? false : 'linked',
  minify: production,
  legalComments: 'none',
  logLevel: 'warning',
};
const node = { ...common, platform: 'node', format: 'cjs', target: 'node20' };
const web = { ...common, platform: 'browser', format: 'iife', target: 'chrome120' };

const builds = [
  { ...node, entryPoints: ['src/vscode/extension.ts'], outfile: 'dist/extension.js', external: ['vscode'] },
  { ...node, entryPoints: ['src/cli/main.ts'], outfile: 'dist/cli.js', banner: { js: '#!/usr/bin/env node' } },
  { ...web, entryPoints: ['src/webview/chat/main.ts'], outfile: 'dist/webview/chat.js' },
  { ...web, entryPoints: ['src/webview/chat/chat.css'], outfile: 'dist/webview/chat.css' },
  { ...web, entryPoints: ['src/webview/settings/main.ts'], outfile: 'dist/webview/settings.js' },
  { ...web, entryPoints: ['src/webview/settings/settings.css'], outfile: 'dist/webview/settings.css' },
];

if (tests) {
  const dir = path.join(root, 'test', 'unit');
  const entries = (await readdir(dir)).filter((name) => name.endsWith('.test.ts')).map((name) => `test/unit/${name}`);
  await rm(path.join(root, 'dist-test'), { recursive: true, force: true });
  await mkdir(path.join(root, 'dist-test'), { recursive: true });
  builds.length = 0;
  builds.push({ ...node, entryPoints: entries, outdir: 'dist-test', sourcemap: 'inline' });
} else {
  await rm(path.join(root, 'dist'), { recursive: true, force: true });
}

if (watch) {
  for (const options of builds) {
    const context = await esbuild.context(options);
    await context.watch();
  }
  console.log('watching for changes...');
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
