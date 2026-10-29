import { contextBridge, ipcRenderer } from 'electron';
import type { Api, AppState, Settings } from '../src/core/types';

const api: Api = {
  getState: () => ipcRenderer.invoke('getState'),
  onState: (cb: (s: AppState) => void) => {
    const listener = (_e: unknown, s: AppState) => cb(s);
    ipcRenderer.on('state', listener);
    return () => ipcRenderer.removeListener('state', listener);
  },
  pickChampion: (id: number) => ipcRenderer.invoke('pickChampion', id),
  applyLoadout: () => ipcRenderer.invoke('applyLoadout'),
  setSettings: (patch: Partial<Settings>) => ipcRenderer.invoke('setSettings', patch),
  refreshData: () => ipcRenderer.invoke('refreshData'),
  importHistory: () => ipcRenderer.invoke('importHistory'),
  exportHistory: () => ipcRenderer.invoke('exportHistory'),
  listDisplays: () => ipcRenderer.invoke('listDisplays'),
  testOverlay: () => ipcRenderer.invoke('testOverlay'),
  phoneInfo: () => ipcRenderer.invoke('phoneInfo'),
  getHistory: () => ipcRenderer.invoke('getHistory'),
  gameDetail: (id: number) => ipcRenderer.invoke('gameDetail', id),
  championAugments: (id: number) => ipcRenderer.invoke('championAugments', id),
  championBuild: (id: number, lane?: string) => ipcRenderer.invoke('championBuild', id, lane),
  laneTier: (lane: string) => ipcRenderer.invoke('laneTier', lane),
  currentLane: () => ipcRenderer.invoke('currentLane'),
  listChampions: () => ipcRenderer.invoke('listChampions'),
  balanceChanges: () => ipcRenderer.invoke('balanceChanges'),
  cardReader: (action?: boolean | 'request' | 'settings') => ipcRenderer.invoke('cardReader', action ?? false),
};

contextBridge.exposeInMainWorld('api', api);
