import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const installer = join(__dirname, '../scripts/mac-update-install.sh');

interface Entry { path: string; content: string; base: string; }
function fixture(entries: Entry[] = [
  { path: 'src/main.ts', content: 'nouvelle source\n', base: digest('ancienne source\n') },
  { path: 'src/new.ts', content: 'nouveau module\n', base: '-' },
  { path: 'dist/electron/main.cjs', content: 'nouveau bundle\n', base: 'generated' },
]) {
  const root = mkdtempSync(join(tmpdir(), 'aram-update-install-'));
  const pkg = join(root, 'Mise à jour');
  const target = join(root, 'Application existante');
  mkdirSync(pkg);
  mkdirSync(target);
  const write = (base: string, path: string, content: string) => {
    mkdirSync(dirname(join(base, path)), { recursive: true });
    writeFileSync(join(base, path), content);
  };
  write(target, 'package.json', JSON.stringify({ name: 'aram-companion', main: 'dist/electron/main.cjs' }));
  write(target, 'src/main.ts', 'ancienne source\n');
  write(target, 'dist/electron/main.cjs', 'ancien bundle\n');
  write(target, 'data/history.json', 'HISTORIQUE PERSONNEL');
  write(target, 'probe-output/usage.json', 'CAPTURE PERSONNELLE');
  write(target, 'node_modules/runtime.txt', 'MOTEUR EXISTANT');
  write(target, '.env', 'SECRET LOCAL');
  write(target, '.install/archive-existante.tgz', 'ARCHIVE EXISTANTE');
  copyFileSync(installer, join(pkg, 'Installer ARAM Companion.command'));
  chmodSync(join(pkg, 'Installer ARAM Companion.command'), 0o755);
  for (const entry of entries) write(join(pkg, 'payload'), entry.path, entry.content);
  writeFileSync(join(pkg, 'update-manifest.tsv'), entries.map((e) => `${e.path}\t${e.base}\t${digest(e.content)}\n`).join(''));
  writeFileSync(join(pkg, 'SHA256SUMS'), entries.map((e) => `${digest(e.content)}  payload/${e.path}\n`).join(''));
  const run = (...args: string[]) => spawnSync('bash', [join(pkg, 'Installer ARAM Companion.command'), ...args], { encoding: 'utf8' });
  return { root, pkg, target, run, write };
}

describe('mise à jour précompilée : vrai moteur de fichiers, sans exécution native macOS', () => {
  it('vérifie le paquet sans modifier une installation', () => {
    const f = fixture();
    expect(f.run('--verify')).toMatchObject({ status: 0 });
    expect(readFileSync(join(f.target, 'src/main.ts'), 'utf8')).toBe('ancienne source\n');
    expect(readdirSync(join(f.target, '.install'))).toEqual(['archive-existante.tgz']);
  });

  it('rejette un payload altéré avant toute modification', () => {
    const f = fixture();
    f.write(join(f.pkg, 'payload'), 'src/main.ts', 'CONTENU ALTÉRÉ');
    const result = f.run('--target', f.target);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Vérification des fichiers échouée');
    expect(readFileSync(join(f.target, 'src/main.ts'), 'utf8')).toBe('ancienne source\n');
  });

  it('installe les fichiers, vérifie une sauvegarde récupérable et conserve toutes les données locales', () => {
    const f = fixture();
    const result = f.run('--target', f.target);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('Mise à jour installée, sans compilation');
    expect(readFileSync(join(f.target, 'src/main.ts'), 'utf8')).toBe('nouvelle source\n');
    expect(readFileSync(join(f.target, 'src/new.ts'), 'utf8')).toBe('nouveau module\n');
    expect(readFileSync(join(f.target, 'dist/electron/main.cjs'), 'utf8')).toBe('nouveau bundle\n');
    for (const [path, expected] of [
      ['data/history.json', 'HISTORIQUE PERSONNEL'], ['probe-output/usage.json', 'CAPTURE PERSONNELLE'],
      ['node_modules/runtime.txt', 'MOTEUR EXISTANT'], ['.env', 'SECRET LOCAL'], ['.install/archive-existante.tgz', 'ARCHIVE EXISTANTE'],
    ]) expect(readFileSync(join(f.target, path), 'utf8')).toBe(expected);
    const archive = readdirSync(join(f.target, '.install')).find((name) => name.startsWith('mac-update-') && name.endsWith('.tgz'))!;
    expect(archive).toBeTruthy();
    const original = spawnSync('tar', ['-xOzf', join(f.target, '.install', archive), 'src/main.ts'], { encoding: 'utf8' });
    expect(original).toMatchObject({ status: 0, stdout: 'ancienne source\n' });
    expect(readFileSync(join(f.target, '.install', `${archive}.created.txt`), 'utf8')).toContain('src/new.ts');
    expect(existsSync(join(f.target, '.install/mac-update.lock'))).toBe(false);
  });

  it('peut être appliquée deux fois et conserve des archives distinctes', () => {
    const f = fixture();
    expect(f.run('--target', f.target).status).toBe(0);
    expect(f.run('--target', f.target).status).toBe(0);
    expect(readdirSync(join(f.target, '.install')).filter((name) => name.startsWith('mac-update-') && name.endsWith('.tgz'))).toHaveLength(2);
    expect(readFileSync(join(f.target, 'data/history.json'), 'utf8')).toBe('HISTORIQUE PERSONNEL');
  });

  it('préserve une source locale différente au lieu de l’écraser', () => {
    const f = fixture();
    f.write(f.target, 'src/main.ts', 'MODIFICATION UTILISATEUR');
    const result = f.run('--target', f.target);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Modification locale préservée');
    expect(readFileSync(join(f.target, 'dist/electron/main.cjs'), 'utf8')).toBe('ancien bundle\n');
    expect(readFileSync(join(f.target, 'src/main.ts'), 'utf8')).toBe('MODIFICATION UTILISATEUR');
    expect(readdirSync(join(f.target, '.install'))).toEqual(['archive-existante.tgz']);
  });

  it('refuse une collision sur un nouveau fichier', () => {
    const f = fixture();
    f.write(f.target, 'src/new.ts', 'FICHIER UTILISATEUR');
    expect(f.run('--target', f.target).stderr).toContain('Modification locale préservée');
    expect(readFileSync(join(f.target, 'src/new.ts'), 'utf8')).toBe('FICHIER UTILISATEUR');
  });

  it('rejette les traversées, chemins protégés et déclarations générées sur les sources', () => {
    for (const path of ['../hors-dossier.txt', 'src/../../hors-dossier.txt', 'node_modules/new.js', 'data/history.json', '.env', 'test/probe-output/capture.json']) {
      const f = fixture();
      writeFileSync(join(f.pkg, 'update-manifest.tsv'), `${path}\t-\t${digest('x')}\n`);
      expect(f.run('--verify').status, path).toBe(1);
    }
    const f = fixture([{ path: 'src/invalid.ts', base: 'generated', content: 'x' }]);
    expect(f.run('--verify').stderr).toContain('Une source ne peut pas être déclarée');
  });

  it('rejette les liens symboliques dans le payload et les parents de destination', () => {
    const f = fixture();
    symlinkSync(join(f.target, '.env'), join(f.pkg, 'payload/secret.txt'));
    expect(f.run('--verify').stderr).toContain('lien ou un fichier spécial');
    const g = fixture([{ path: 'electron/new.ts', content: 'nouveau', base: '-' }]);
    const outside = join(g.root, 'outside');
    mkdirSync(outside);
    symlinkSync(outside, join(g.target, 'electron'));
    expect(g.run('--target', g.target).stderr).toContain('Lien symbolique');
    expect(existsSync(join(outside, 'new.ts'))).toBe(false);
  });

  it('respecte un verrou de session récent et un installateur concurrent', () => {
    const f = fixture();
    f.write(f.target, '.install/LOCK', `${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}\nautre session\n`);
    expect(f.run('--target', f.target).stderr).toContain('Une autre session travaille');
    f.write(f.target, '.install/LOCK', 'LIBRE\n');
    mkdirSync(join(f.target, '.install/mac-update.lock'));
    expect(f.run('--target', f.target).stderr).toContain('Une autre mise à jour');
    expect(existsSync(join(f.target, '.install/mac-update.lock'))).toBe(true);
  });

  it('refuse un manifeste tronqué ou une empreinte ajoutée hors inventaire', () => {
    const f = fixture();
    writeFileSync(join(f.pkg, 'update-manifest.tsv'), readFileSync(join(f.pkg, 'update-manifest.tsv'), 'utf8').trimEnd());
    expect(f.run('--verify').status).toBe(1);
    const g = fixture();
    writeFileSync(join(g.pkg, 'SHA256SUMS'), `${readFileSync(join(g.pkg, 'SHA256SUMS'), 'utf8')}${digest('SECRET LOCAL')}  ../Application existante/.env\n`);
    expect(g.run('--verify').stderr).toContain('Liste des empreintes incohérente');
  });

  it('restaure les fichiers déjà remplacés et retire uniquement les nouveaux fichiers si une écriture échoue', () => {
    const f = fixture();
    // Véritable échec de permissions après les deux premiers déplacements atomiques.
    // Ce test Linux exerce les fichiers ; il ne simule pas une validation native macOS.
    const blocked = join(f.target, 'dist/electron');
    chmodSync(blocked, 0o555);
    try {
      const result = f.run('--target', f.target);
      expect(result.status, result.stdout).not.toBe(0);
      expect(result.stderr).toContain('Les fichiers modifiés ont été restaurés');
      expect(readFileSync(join(f.target, 'src/main.ts'), 'utf8')).toBe('ancienne source\n');
      expect(readFileSync(join(f.target, 'dist/electron/main.cjs'), 'utf8')).toBe('ancien bundle\n');
      expect(existsSync(join(f.target, 'src/new.ts'))).toBe(false);
      expect(readFileSync(join(f.target, '.env'), 'utf8')).toBe('SECRET LOCAL');
      expect(existsSync(join(f.target, '.install/mac-update.lock'))).toBe(false);
    } finally {
      chmodSync(blocked, 0o755);
    }
  });
});
