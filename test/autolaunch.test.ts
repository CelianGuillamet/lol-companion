import { describe, it, expect } from 'vitest';
import { agentPlist, AGENT_LABEL } from '../electron/autolaunch';

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
});
