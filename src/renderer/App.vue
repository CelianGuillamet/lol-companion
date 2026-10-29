<script setup lang="ts">
import { QUEUE_LABEL } from '../core/modes';
// Navigation par moment d'utilisation, pas par fonction :
// Maintenant (suit la partie) · Préparer (tier list, fiches champion) · Mes parties · Réglages.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { state, PHASE_LABEL } from './store';
import NowView from './views/NowView.vue';
import PrepareView from './views/PrepareView.vue';
import GamesView from './views/GamesView.vue';
import SettingsView from './views/SettingsView.vue';
import PlayerCard from './ui/PlayerCard.vue';
import CommandSearch from './ui/CommandSearch.vue';

type Tab = 'now' | 'prepare' | 'games' | 'settings';
const tab = ref<Tab>('now');
// Compatibilité avec les anciens noms d'onglets (tests de fumée, raccourcis)
const LEGACY: Record<string, Tab> = { champ: 'now', build: 'now', augments: 'now', tier: 'prepare', stats: 'games', history: 'games', settings: 'settings' };
window.__setTab = (t: string) => (tab.value = (LEGACY[t] ?? t) as Tab);

const s = computed(() => state.value!);
const live = computed(() => !!s.value.champSelect || (['InProgress', 'GameStart', 'Reconnect'].includes(s.value.phase ?? '') && !!s.value.mode));
// Données anciennes : le client est passé à un patch que les stats Mayhem n'ont pas encore
const stale = computed(() => {
  const c = s.value.data.clientPatch;
  const p = s.value.data.patch;
  return !!c && !!p && !c.startsWith(p) && !p.startsWith(c);
});
const modeLabel = computed(() => (s.value.mode === 'mayhem' ? 'Mayhem' : s.value.mode === 'aram' ? 'ARAM' : s.value.mode === 'sr' ? (QUEUE_LABEL[s.value.queueId ?? 0] ?? 'Faille') : null));

// Quand la partie avance (champ select, chargement), on revient sur « Maintenant »
watch(
  () => s.value.phase,
  (phase, prev) => {
    if (phase !== prev && ['ChampSelect', 'InProgress', 'EndOfGame'].includes(phase ?? '') && s.value.mode) tab.value = 'now';
  },
);

// Raccourcis : ⌘1 à ⌘4 pour les écrans, ⌘K pour la recherche
const searching = ref(false);
const ORDER: Tab[] = ['now', 'prepare', 'games', 'settings'];
function onKey(e: KeyboardEvent) {
  if (!e.metaKey || e.altKey || e.ctrlKey) return;
  if (e.key === 'k') {
    searching.value = !searching.value;
    e.preventDefault();
  } else if (/^[1-4]$/.test(e.key)) {
    tab.value = ORDER[Number(e.key) - 1];
    searching.value = false;
    e.preventDefault();
  }
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'now', label: 'Maintenant', icon: 'M12 3a9 9 0 100 18 9 9 0 000-18zm0 3a6 6 0 110 12 6 6 0 010-12zm0 3a3 3 0 100 6 3 3 0 000-6z' },
  { id: 'prepare', label: 'Préparer', icon: 'M4 4h16v4H4zM4 10h11v4H4zM4 16h7v4H4z' },
  { id: 'games', label: 'Mes parties', icon: 'M4 20V10h3v10zM10.5 20V4h3v16zM17 20v-7h3v7z' },
  { id: 'settings', label: 'Réglages', icon: 'M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zm8.5 3.5l-2-.6-.5-1.3 1-1.9-1.6-1.6-1.9 1-1.3-.5-.6-2h-2.2l-.6 2-1.3.5-1.9-1-1.6 1.6 1 1.9-.5 1.3-2 .6v2.2l2 .6.5 1.3-1 1.9 1.6 1.6 1.9-1 1.3.5.6 2h2.2l.6-2 1.3-.5 1.9 1 1.6-1.6-1-1.9.5-1.3 2-.6z' },
];
</script>

<template>
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <span class="mark" aria-hidden="true"><span class="gem" /></span>
        <span class="brand-name">ARAM Companion</span>
      </div>
      <button class="search" title="Rechercher un champion ou un écran (⌘K)" @click="searching = true">
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M10 3a7 7 0 015.6 11.2l4.6 4.6-1.4 1.4-4.6-4.6A7 7 0 1110 3zm0 2a5 5 0 100 10 5 5 0 000-10z" fill="currentColor" /></svg>
        <span>Rechercher</span>
        <kbd>⌘K</kbd>
      </button>
      <nav aria-label="Écrans">
        <button v-for="(t, i) in tabs" :key="t.id" :title="`${t.label} (⌘${i + 1})`" class="nav" :class="{ on: tab === t.id }" :aria-current="tab === t.id ? 'page' : undefined" @click="tab = t.id">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path :d="t.icon" fill="currentColor" /></svg>
          <span>{{ t.label }}</span>
          <span v-if="t.id === 'now' && live" class="live" title="Partie en cours" />
        </button>
      </nav>
      <div class="side-foot">
        <PlayerCard />
        <div class="status" role="status">
          <div class="conn" :class="s.connection">
            <span class="dot" aria-hidden="true" />
            <span>{{ s.connection === 'connected' ? (s.phase && s.phase !== 'None' ? (PHASE_LABEL[s.phase] ?? s.phase) : 'Client connecté') : 'Client League fermé' }}</span>
            <span v-if="modeLabel && s.connection === 'connected' && s.phase && s.phase !== 'None'" class="mode">{{ modeLabel }}</span>
          </div>
          <div v-if="s.data.patch" class="data" :class="{ stale }" :title="stale ? 'Le client est sur un patch plus récent que les statistiques Mayhem' : 'Statistiques Mayhem arammeta'">
            Stats Mayhem {{ s.data.patch }}<template v-if="stale"> · client {{ s.data.clientPatch }}</template>
          </div>
          <div v-else-if="s.data.error" class="data err">Stats Mayhem indisponibles</div>
        </div>
      </div>
    </aside>

    <main class="main">
      <!-- Enveloppe : la transition a toujours un élément racine (certains écrans en ont plusieurs) -->
      <Transition name="page" mode="out-in">
        <div :key="tab" class="view">
          <NowView v-if="tab === 'now'" />
          <PrepareView v-else-if="tab === 'prepare'" />
          <GamesView v-else-if="tab === 'games'" />
          <SettingsView v-else />
        </div>
      </Transition>
    </main>
    <CommandSearch v-if="searching" @close="searching = false" @go="(t) => (tab = t as Tab)" />
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 220px 1fr; height: 100%; }
/* Rail du client : encre profonde, filet d'or sur le bord, onglet actif « serti » d'or */
.side {
  position: relative; display: flex; flex-direction: column; gap: 24px; padding: 42px 0 16px;
  background: linear-gradient(180deg, #071019 0%, #03080e 100%);
  -webkit-app-region: drag;
}
.side::after { content: ''; position: absolute; top: 0; right: 0; bottom: 0; width: 1px; background: linear-gradient(180deg, #785a28, #3a2e18 40%, #1c1a14); }
.side button { -webkit-app-region: no-drag; }
.brand { display: flex; gap: 11px; align-items: center; padding: 0 14px 0 18px; }
/* Emblème : losange d'or patiné serti d'un cristal Hextech (dessin original) */
.mark {
  width: 26px; height: 26px; flex: none; display: grid; place-items: center; transform: rotate(45deg);
  border: 1.5px solid #c8aa6e; background: #0a1520; box-shadow: 0 0 0 1px #3a2e18, inset 0 0 6px rgba(200, 170, 110, 0.35);
}
.gem { width: 9px; height: 9px; background: radial-gradient(circle at 35% 35%, #cdfafa, #0ac8b9 50%, #0a323c); box-shadow: 0 0 8px rgba(10, 200, 185, 0.8); }
.brand-name { font-family: var(--display); font-size: 13.5px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--gold-hi); white-space: nowrap; }
nav { display: flex; flex-direction: column; }
.nav {
  position: relative; display: flex; align-items: center; gap: 12px; padding: 11px 18px; border: 0; background: transparent;
  color: var(--muted); cursor: pointer; text-align: left; font-weight: 600; font-size: 14.5px; letter-spacing: 0.01em;
}
.nav:hover { color: var(--gold-hi); }
.nav.on { color: var(--gold-hi); background: linear-gradient(90deg, rgba(200, 170, 110, 0.16), transparent 85%); }
.nav.on::before { content: ''; position: absolute; left: 0; top: 6px; bottom: 6px; width: 3px; background: linear-gradient(180deg, #f0e6d2, #c8aa6e 50%, #785a28); }
.nav.on svg { color: var(--gold); }
.live { width: 7px; height: 7px; transform: rotate(45deg); background: var(--blue); margin-left: auto; box-shadow: 0 0 8px rgba(10, 200, 185, 0.9); }
.side-foot { margin-top: auto; display: flex; flex-direction: column; gap: 12px; padding: 14px 18px 0; font-size: 12px; border-top: 1px solid var(--border); }
.status { display: flex; flex-direction: column; gap: 4px; }
.conn { display: flex; gap: 8px; align-items: center; color: var(--muted); font-weight: 600; }
.conn .mode { margin-left: auto; color: var(--gold); font-weight: 600; font-size: 11.5px; }
.data { color: var(--faint); font-size: 11.5px; padding-left: 15px; }
.data.stale { color: var(--warn); }
.data.err { color: var(--bad); }
.dot { width: 7px; height: 7px; transform: rotate(45deg); background: var(--faint); flex: none; }
.conn.connected .dot { background: var(--blue); box-shadow: 0 0 6px rgba(10, 200, 185, 0.8); }
.phase { color: var(--text); font-weight: 600; }
.small { font-size: 12px; }
.main { min-width: 0; min-height: 0; overflow: auto; }
.view { height: 100%; }
.search { display: flex; align-items: center; gap: 8px; margin: -8px 14px 0; padding: 7px 10px; border: 1px solid var(--line); background: rgba(10, 21, 32, 0.6); color: var(--faint); font: inherit; font-size: 13px; cursor: pointer; }
.search:hover { color: var(--text); border-color: var(--rule); }
.search kbd { margin-left: auto; font: inherit; font-size: 11px; border: 1px solid var(--line); padding: 0 5px; }
/* Transition d'écran : courte, sans mouvement si « Réduire les animations » (règle globale dans styles.css) */
.page-enter-active, .page-leave-active { transition: opacity 0.12s ease, transform 0.12s ease; }
.page-enter-from { opacity: 0; transform: translateY(4px); }
.page-leave-to { opacity: 0; }
</style>
