// Test the tarball consumers install, including its isolated dependency tree.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ccc-package-'));
function npm(args) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
    cwd: project, encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, result.stderr || result.error?.message);
  return result.stdout;
}
try {
  const [packed] = JSON.parse(npm(['pack', '--json', '--pack-destination', temp]));
  assert.deepEqual(packed.files.map((f) => f.path).sort(), ['README.md', 'dist/ccc.js', 'package.json']);
  assert.ok(packed.size < 32070, `Tarball regressed from v2.5.0: ${packed.size} bytes`);
  const install = path.join(temp, 'install');
  npm(['install', '--prefix', install, '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund', path.join(temp, packed.filename)]);
  const packageRoot = path.join(install, 'node_modules/@tkpdx01/ccc');
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
  assert.equal(fs.existsSync(path.join(install, 'node_modules/esbuild')), false);
  const entry = path.join(packageRoot, pkg.bin.ccc);
  const home = path.join(temp, 'home');
  fs.mkdirSync(path.join(home, '.ccc/profiles'), { recursive: true });
  fs.writeFileSync(path.join(home, '.ccc/profiles/demo.json'), JSON.stringify({ apiKey: 'test-key' }));
  const cli = (args) => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import os from 'node:os';
      os.homedir = () => process.env.CCC_PACKAGE_HOME;
      process.argv = [process.execPath, 'ccc', ...${JSON.stringify(args)}];
      await import(${JSON.stringify(pathToFileURL(entry).href)});
    `], { env: { ...process.env, CCC_PACKAGE_HOME: home }, encoding: 'utf8', input: '', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout;
  };
  assert.equal(cli(['--version']).trim(), pkg.version);
  assert.match(cli(['--help']), /ccc cleanup/);
  assert.match(cli(['list']), /demo/);
  cli(['default', 'demo']);
  assert.equal(cli(['default']).trim(), 'demo');
  assert.match(cli(['cleanup', '--keep', 'demo']), /Nothing to clean/);
  console.log(`Package verified: ${packed.size} bytes compressed, ${packed.unpackedSize} bytes installed, zero runtime dependencies.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
