import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative } from 'node:path';

const root = process.cwd();
const excluded = new Set(['.git', '.github', '.imd', '.agents', '.aws', '.codex', '.playwright-mcp', 'test']);
const forbiddenDirectories = new Set(['node_modules', '.vite', '.cache', '.npm', 'npm-cache', 'playwright-report', 'test-results']);
const reportPath = 'artifacts/package-size.json';
const allowedRoot = new Set(['.gitignore', 'README.md', 'DESIGN.md', 'THIRD_PARTY.md', 'index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', 'playwright.config.ts', 'src', 'public', 'dist', 'scripts', 'tests', 'design', 'licenses', 'artifacts']);

async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === root && (excluded.has(entry.name) || entry.name.startsWith('.env'))) continue;
    if (directory === root && !allowedRoot.has(entry.name)) throw new Error(`Unexpected deliverable: ${entry.name}`);
    if (forbiddenDirectories.has(entry.name) || entry.isSymbolicLink()) throw new Error(`Generated directory or symlink: ${join(directory, entry.name)}`);
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await inventory(path));
    else if (entry.isFile()) files.push({ path: relative(root, path), bytes: (await stat(path)).size });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function budget(files, label, predicate, limit) {
  const bytes = files.filter((file) => predicate(file.path)).reduce((sum, file) => sum + file.bytes, 0);
  if (bytes > limit) throw new Error(`${label} exceeds budget: ${bytes} > ${limit}`);
  return { bytes, limit };
}

const html = await readFile('dist/index.html', 'utf8');
for (const required of ['<title>', 'name="description"', 'property="og:title"', 'property="og:image"', 'rel="icon"']) {
  if (!html.includes(required)) throw new Error(`Missing metadata: ${required}`);
}
const references = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]);
for (const reference of references.filter((value) => !/^https?:/.test(value))) {
  if (!reference.startsWith('./')) throw new Error(`Non-relative runtime asset: ${reference}`);
  await stat(join('dist', reference));
}
const expectedBundles = references.filter((path) => path.startsWith('./assets/')).map((path) => path.slice('./assets/'.length)).sort();
const actualBundles = (await readdir('dist/assets')).sort();
if (JSON.stringify(expectedBundles) !== JSON.stringify(actualBundles)) throw new Error('Unused or missing production bundle');
for (const path of ['og-image.png', 'favicon.svg', 'fonts/geist-latin.woff2', 'fonts/OFL.txt', 'licenses/react-MIT.txt']) {
  await stat(join('dist', path));
}

// Iterate to include this report's own byte count in the payload total.
let previous = '';
for (let attempt = 0; attempt < 8; attempt++) {
  const files = await inventory(root);
  const groups = {
    ignoreFile: budget(files, '.gitignore', (path) => path === '.gitignore', 512),
    export: budget(files, 'dist/', (path) => path.startsWith('dist/'), 1_048_576),
    sourceAndAssets: budget(files, 'Source and assets', (path) => /^(src|public|design)\//.test(path), 1_048_576),
    evidence: budget(files, 'Evidence', (path) => path.startsWith('artifacts/'), 3_145_728),
    remaining: budget(files, 'Other source/docs/config', (path) => !/^(dist|src|public|design|artifacts)\//.test(path), 1_048_576),
  };
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (totalBytes > 6_291_456) throw new Error('Payload leaves less than 2 MiB packaging headroom');
  const exportHashes = {};
  for (const file of files.filter((item) => item.path.startsWith('dist/'))) {
    exportHashes[file.path] = createHash('sha256').update(await readFile(file.path)).digest('hex');
  }
  const report = JSON.stringify({ totalBytes, fileCount: files.length, submissionLimitBytes: 8_388_608, uncompressedHeadroomBytes: 8_388_608 - totalBytes, groups, exportSha256: exportHashes, note: 'Delivered file payload including this report; excludes supplied inputs, protected metadata and disposable/ignored test output. No Git metadata was read or changed. Transport Git-bundle overhead is not measured.' }, null, 2) + '\n';
  await writeFile(reportPath, report);
  if (report === previous) {
    console.log(`Package audit passed: ${files.length} files, ${totalBytes} bytes; ${groups.export.bytes} bytes in dist/.`);
    process.exit(0);
  }
  previous = report;
}
throw new Error('Package-size report did not converge');
