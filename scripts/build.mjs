import { build } from 'esbuild';
import fs from 'node:fs';
import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const result = await build({
  absWorkingDir: fileURLToPath(new URL('../', import.meta.url)),
  entryPoints: ['index.js'], outfile: 'dist/ccc.js',
  bundle: true, minify: true, platform: 'node', format: 'esm', target: 'node18',
  charset: 'utf8', legalComments: 'none', metafile: true,
  define: { CCC_VERSION: JSON.stringify(pkg.version) },
});
const builtins = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));
for (const output of Object.values(result.metafile.outputs)) {
  if (output.imports.some((entry) => !entry.external || !builtins.has(entry.path))) {
    throw new Error('Published CLI must depend only on Node built-ins');
  }
}
fs.chmodSync(new URL('../dist/ccc.js', import.meta.url), 0o755);
