import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  autoRunes: true,
  autoSpells: true,
  autoItemSet: false, // désactivé par défaut : modifie tes item sets dans le client
  overlay: true,
  overlayDisplay: 'auto',
  panelMode: 'window',
  notifications: true, autoAccept: false, augmentNotify: false, secondOnTop: false, autoLaunch: 'off', phone: false, phonePort: 8787, phoneToken: '',
  readCards: true, // validé par Celian (discovery 2026-10-28) : rien n'est gardé ni envoyé
};

export async function loadSettings(file: string): Promise<Settings> {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(await readFile(file, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveSettings(file: string, s: Settings): Promise<void> {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(s, null, 2));
}
