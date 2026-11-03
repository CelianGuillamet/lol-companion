import { describe, it, expect } from 'vitest';
import { agentPlist, AGENT_LABEL, BACKGROUND_ARG } from '../electron/autolaunch';

describe('lancement automatique', () => {
  it('surveille le lockfile du client League', () => {
    const p = agentPlist('league', '/Users/c/Documents/aram-companion/ARAM Companion.app', ['/Applications/League of Legends.app/Contents/LoL/lockfile']);
    expect(p).toContain(`<string>${AGENT_LABEL}</string>`);
    expect(p).toContain('<key>WatchPaths</key>');
    expect(p).toContain('League of Legends.app/Contents/LoL/lockfile');
    expect(p).not.toContain('RunAtLoad');
  });
  it('ou se lance à l’ouverture de session', () => {
    const p = agentPlist('login', '/a/b & c/ARAM Companion.app');
    expect(p).toContain('<key>RunAtLoad</key><true/>');
    expect(p).toContain('/a/b &amp; c/ARAM Companion.app');
  });
  it('signale à l’app déjà ouverte qu’elle ne doit pas voler le focus', () => {
    const p = agentPlist('league', '/x/ARAM Companion.app', ['/lock']);
    expect(p).toContain(`<string>--args</string>\n    <string>${BACKGROUND_ARG}</string>`);
  });
});
