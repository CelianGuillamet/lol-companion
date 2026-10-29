<script setup lang="ts">
// Recherche globale (⌘K) : un champion → sa fiche (Mayhem, ou Faille sur son rôle principal si tu joues la
// Faille), ou un écran de l'app. Clavier d'abord : ↑ ↓ pour choisir, Entrée pour ouvrir, Échap pour fermer.
import { computed, nextTick, onMounted, ref } from 'vue';
import { state, championIcon, hideBroken } from '../store';
import { explore } from '../explore';

const emit = defineEmits<{ close: []; go: [tab: string] }>();
const q = ref('');
const input = ref<HTMLInputElement | null>(null);
const champs = ref<{ id: number; name: string }[]>([]);
const sel = ref(0);
const SCREENS = [
  { tab: 'now', label: 'Maintenant', hint: '⌘1' },
  { tab: 'prepare', label: 'Préparer · tier list', hint: '⌘2' },
  { tab: 'games', label: 'Mes parties', hint: '⌘3' },
  { tab: 'settings', label: 'Réglages', hint: '⌘4' },
];
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
onMounted(async () => {
  await nextTick();
  input.value?.focus();
  champs.value = await window.api.listChampions();
});
type Row = { kind: 'champ'; id: number; name: string } | { kind: 'screen'; tab: string; label: string; hint: string };
const rows = computed<Row[]>(() => {
  const s = norm(q.value);
  const c = champs.value
    .filter((x) => !s || norm(x.name).includes(s))
    .sort((a, b) => Number(!norm(a.name).startsWith(s)) - Number(!norm(b.name).startsWith(s)))
    .slice(0, s ? 8 : 0)
    .map((x) => ({ kind: 'champ' as const, id: x.id, name: x.name }));
  const sc = SCREENS.filter((x) => !s || norm(x.label).includes(s)).map((x) => ({ kind: 'screen' as const, ...x }));
  return [...c, ...sc];
});
async function pick(r: Row | undefined) {
  if (!r) return;
  emit('close');
  if (r.kind === 'screen') return emit('go', r.tab);
  emit('go', 'prepare');
  let lane: string | null = null;
  if (state.value?.mode === 'sr') lane = (await window.api.championLanes(r.id))[0]?.lane ?? null;
  await explore(r.id, lane);
}
function key(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') sel.value = Math.min(rows.value.length - 1, sel.value + 1);
  else if (e.key === 'ArrowUp') sel.value = Math.max(0, sel.value - 1);
  else if (e.key === 'Enter') void pick(rows.value[sel.value]);
  else if (e.key === 'Escape') emit('close');
  else return;
  e.preventDefault();
}
</script>

<template>
  <div class="scrim" @mousedown.self="emit('close')">
    <div class="pal card" role="dialog" aria-modal="true" aria-label="Recherche">
      <input
        ref="input"
        v-model="q"
        class="q"
        placeholder="Champion ou écran…"
        spellcheck="false"
        role="combobox"
        aria-controls="cmd-list"
        :aria-activedescendant="rows.length ? `cmd-${sel}` : undefined"
        aria-expanded="true"
        @input="sel = 0"
        @keydown="key"
      />
      <ul id="cmd-list" role="listbox">
        <li
          v-for="(r, i) in rows"
          :id="`cmd-${i}`"
          :key="r.kind === 'champ' ? `c${r.id}` : r.tab"
          role="option"
          :aria-selected="i === sel"
          :class="{ on: i === sel }"
          @mouseenter="sel = i"
          @click="pick(r)"
        >
          <template v-if="r.kind === 'champ'">
            <img @error="hideBroken" :src="championIcon(r.id)" width="24" height="24" class="icon" alt="" />
            <span>{{ r.name }}</span>
            <span class="faint small">{{ state?.mode === 'sr' ? 'fiche Faille' : 'fiche Mayhem' }}</span>
          </template>
          <template v-else>
            <span class="glyph" aria-hidden="true">›</span>
            <span>{{ r.label }}</span>
            <kbd>{{ r.hint }}</kbd>
          </template>
        </li>
        <li v-if="!rows.length" class="faint small empty">Aucun champion ni écran pour « {{ q }} ».</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; background: rgba(2, 6, 10, 0.6); display: grid; justify-items: center; align-items: start; padding-top: 12vh; z-index: 50; animation: in 0.12s ease-out; }
.pal { width: min(560px, 92vw); padding: 8px; box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6); }
.q { width: 100%; padding: 12px 14px; font: inherit; font-size: 16px; background: var(--panel); color: var(--text); border: 1px solid var(--rule); outline: none; }
.q:focus { border-color: var(--gold); }
ul { list-style: none; margin: 6px 0 0; padding: 0; max-height: 50vh; overflow: auto; }
li { display: grid; grid-template-columns: 24px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; cursor: pointer; font-size: 14px; }
li.on { background: var(--gold-soft); color: var(--gold-hi); }
.glyph { color: var(--gold); text-align: center; }
kbd { font: inherit; font-size: 11px; color: var(--faint); border: 1px solid var(--line); padding: 1px 5px; }
.empty { display: block; padding: 12px; cursor: default; }
.small { font-size: 12px; }
@keyframes in { from { opacity: 0; } }
</style>
