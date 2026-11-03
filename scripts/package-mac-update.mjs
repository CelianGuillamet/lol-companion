#!/usr/bin/env node
// Produit un paquet local vérifié ; ne publie rien et ne touche pas à l'installation du Mac.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: repository, encoding: 'utf8', maxBuffer: 16 << 20 });
const allowedPath = (path) => /^[A-Za-z0-9_./ @()+-]+$/.test(path) &&
  !path.startsWith('/') && !path.split('/').some((part) => !part || part === '.' || part === '..');

function optionsOf(args) {
  const options = { base: 'origin/main', output: null };
  while (args.length) {
    const option = args.shift();
    if (option === '--help') return null;
    if (!['--base', '--output'].includes(option) || !args.length) throw new Error('Usage : node scripts/package-mac-update.mjs [--base <commit/ref>] [--output <archive.zip>]');
    const value = args.shift();
    if (option === '--base') options.base = value;
    else options.output = value;
  }
  return options;
}

const sourceFile = (path) =>
  /^(src|electron|docs|build)\//.test(path) ||
  /^scripts\/[^/]+\.(mjs|js|ts|sh)$/.test(path) ||
  ['package.json', 'package-lock.json', 'README.md', 'CHANGELOG.md', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'Lancer ARAM Companion.command'].includes(path);

async function filesUnder(directory, root = repository) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Lien symbolique interdit dans le paquet : ${relative(repository, path)}`);
    if (entry.isDirectory()) files.push(...await filesUnder(path, root));
    else if (entry.isFile()) files.push(relative(root, path));
    else throw new Error(`Fichier spécial interdit : ${relative(repository, path)}`);
  }
  return files;
}

async function packageUpdate(options) {
  if (git('ls-files', '-u').trim()) throw new Error('Résoudre la fusion Git avant de construire le paquet.');
  const baseCommit = git('rev-parse', '--verify', '--end-of-options', `${options.base}^{commit}`).trim();
  if (!/^[0-9a-f]{40,64}$/.test(baseCommit)) throw new Error('Référence de base invalide.');
  const version = (await readFile(join(repository, 'CHANGELOG.md'), 'utf8')).match(/^## (v\d+\.\d+(?:\.\d+)?) — /m)?.[1];
  if (!version) throw new Error('Version introuvable dans CHANGELOG.md.');
  const output = resolve(options.output ?? join(repository, '..', 'outputs', `ARAM-Companion-${version}-mac-update.zip`));
  if (!output.endsWith('.zip')) throw new Error('La sortie doit être une archive .zip.');
  for (const path of [output, `${output}.sha256`]) {
    try { await stat(path); throw new Error(`La sortie existe déjà : ${path}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }

  const known = git('ls-files', '--cached', '--others', '--exclude-standard', '-z').split('\0').filter(Boolean);
  const basePaths = new Set(git('ls-tree', '-r', '--name-only', '-z', baseCommit).split('\0').filter(Boolean));
  // Les scripts nouvellement créés sont inclus avant leur commit ; aucune fixture ni capture ne l'est.
  const sources = [...new Set(known.filter(sourceFile))];
  const generated = [
    'dist/electron/main.cjs', 'dist/electron/preload.cjs',
    ...await filesUnder(join(repository, 'dist/renderer')),
  ];
  const files = [...new Set([...sources, ...generated])].sort();
  if (!files.includes('scripts/mac-update-install.sh') || !files.includes('scripts/package-mac-update.mjs')) throw new Error('Scripts de distribution absents.');
  const fixedTime = new Date(Number(git('show', '-s', '--format=%ct', baseCommit).trim()) * 1000);
  if (!Number.isFinite(fixedTime.getTime())) throw new Error('Date du commit de base invalide.');
  const temporary = await mkdtemp(join(tmpdir(), 'aram-package-'));
  try {
    const rootName = `ARAM-Companion-${version}-mac-update`;
    const packageRoot = join(temporary, rootName);
    await mkdir(join(packageRoot, 'payload'), { recursive: true });
    const manifest = [];
    const checksums = [];
    for (const path of files) {
      if (!allowedPath(path)) throw new Error(`Chemin de source invalide : ${path}`);
      const source = join(repository, path);
      const info = await lstat(source);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Source non régulière : ${path}`);
      const content = await readFile(source);
      const digest = sha(content);
      let previous = path.startsWith('dist/') ? 'generated' : '-';
      if (previous !== 'generated' && basePaths.has(path)) previous = sha(execFileSync('git', ['show', `${baseCommit}:${path}`], { cwd: repository, maxBuffer: 16 << 20 }));
      const target = join(packageRoot, 'payload', path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
      await chmod(target, info.mode & 0o111 ? 0o755 : 0o644);
      await utimes(target, fixedTime, fixedTime);
      manifest.push(`${path}\t${previous}\t${digest}`);
      checksums.push(`${digest}  payload/${path}`);
    }
    const instructions = await readFile(join(repository, 'docs/mac-update.md'), 'utf8');
    const metadata = {
      version, baseCommit, files: files.length,
      manifestSha256: sha(Buffer.from(`${manifest.join('\n')}\n`)),
      runtime: 'Electron macOS de l’installation existante ; aucun runtime téléchargé ou modifié',
    };
    for (const [name, content] of [
      ['update-manifest.tsv', `${manifest.join('\n')}\n`],
      ['SHA256SUMS', `${checksums.join('\n')}\n`],
      ['LIRE-MOI.txt', instructions],
      ['RELEASE.json', `${JSON.stringify(metadata, null, 2)}\n`],
    ]) {
      const target = join(packageRoot, name);
      await writeFile(target, content, { mode: 0o644 });
      await utimes(target, fixedTime, fixedTime);
    }
    const installer = join(packageRoot, 'Installer ARAM Companion.command');
    await copyFile(join(repository, 'scripts/mac-update-install.sh'), installer);
    await chmod(installer, 0o755);
    await utimes(installer, fixedTime, fixedTime);

    // ZIP sans métadonnées dépendant de l'hôte, dans un ordre stable.
    const entries = (await filesUnder(packageRoot, temporary)).sort();
    const archive = join(temporary, 'update.zip');
    execFileSync('zip', ['-X', '-q', archive, '-@'], { cwd: temporary, input: `${entries.join('\n')}\n`, encoding: 'utf8' });
    const extracted = join(temporary, 'verification');
    await mkdir(extracted);
    execFileSync('unzip', ['-q', archive, '-d', extracted]);
    execFileSync('bash', [join(extracted, rootName, 'Installer ARAM Companion.command'), '--verify'], { encoding: 'utf8', maxBuffer: 2 << 20 });
    const digest = sha(await readFile(archive));
    await mkdir(dirname(output), { recursive: true });
    await copyFile(archive, output, constants.COPYFILE_EXCL);
    await writeFile(`${output}.sha256`, `${digest}  ${output.split('/').pop()}\n`, { flag: 'wx' });
    return { ...metadata, archive: output, bytes: (await stat(output)).size, sha256: digest, verification: 'passed' };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

try {
  const options = optionsOf(process.argv.slice(2));
  if (!options) console.log('Usage : node scripts/package-mac-update.mjs [--base <commit/ref>] [--output <archive.zip>]');
  else console.log(JSON.stringify(await packageUpdate(options), null, 2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
