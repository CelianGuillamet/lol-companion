<script setup lang="ts">
// Tout le pool d'augments du champion, par rareté, avec recherche : pour retrouver d'un coup d'œil
// les 3 cartes proposées (elles ont toutes la même rareté) et voir laquelle gagne le plus.
import { computed, ref } from 'vue';
import { tone, pct, signed, hideBroken, state, wrAt, ROUND_LABEL } from './store';
import type { AugmentPanel, Rarity } from '../core/types';

const props = defineProps<{ panel: AugmentPanel; compact?: boolean }>();
const rarity = ref<Rarity>('kGold');
const q = ref('');
const RARITIES: { key: Rarity; label: string }[] = [
  { key: 'kPrismatic', label: 'Prismatique' },
  { key: 'kGold', label: 'Or' },
  { key: 'kSilver', label: 'Argent' },
];
// Choix d'augment : automatique d'après ton niveau en jeu, ou forcé
const manualRound = ref<number | null | 'all'>(null);
const round = computed(() => (manualRound.value === 'all' ? null : (manualRound.value ?? state.value?.augRound ?? null)));
const hasRounds = computed(() => (props.panel.all?.[rarity.value] ?? []).some((a) => a.rounds?.some((x) => x != null)));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const rows = computed(() => {
  const all = sorted.value;
  const s = norm(q.value.trim());
  return s ? all.filter((a) => norm(a.name).includes(s)) : all;
});
const sorted = computed(() => [...(props.panel.all?.[rarity.value] ?? [])].sort((a, b) => wrAt(b, round.value) - wrAt(a, round.value)));
const champWr = computed(() => props.panel.championWinrate ?? 0.5);
const rankOf = (id: number) => sorted.value.findIndex((a) => a.id === id) + 1;
const total = computed(() => props.panel.all?.[rarity.value]?.length ?? 0);
</script>

<template>
  <section v-if="panel.all" class="card finder" :class="{ compact }">
    <div class="bar">
      <h2>Tous les augments</h2>
      <div class="seg">
        <button v-for="r in RARITIES" :key="r.key" :class="[`rarity-${r.key}`, { on: rarity === r.key }]" @click="rarity = r.key">{{ r.label }}</button>
      </div>
      <div v-if="hasRounds" class="seg rounds" title="Le même augment ne vaut pas pareil au début et au niveau 15">
        <button :class="{ on: manualRound === 'all' }" @click="manualRound = 'all'">Global</button>
        <button v-for="n in 4" :key="n" :class="{ on: round === n && manualRound !== 'all' }" @click="manualRound = n">
          {{ n }}<span v-if="state?.augRound === n && manualRound === null" class="auto">•</span>
        </button>
      </div>
      <input v-model="q" class="search" placeholder="Chercher un augment…" spellcheck="false" />
    </div>
    <div class="grid">
      <div v-for="a in rows" :key="a.id" class="aug" :title="`${a.games.toLocaleString('fr-FR')} parties`">
        <span class="rank num faint">{{ rankOf(a.id) }}</span>
        <img @error="hideBroken" v-if="a.icon" :src="a.icon" width="24" height="24" alt="" />
        <span v-else class="ph" />
        <span class="name">{{ a.name }}<span v-if="a.games < 300" class="few" title="Moins de 300 parties : nouveau ou rare, winrate peu fiable">peu de données</span></span>
        <span v-if="a.personal && a.personal.games >= 2" class="me small" :class="tone(a.personal.wins, a.personal.games)">{{ a.personal.wins }}V{{ a.personal.games - a.personal.wins }}D</span>
        <span class="num wr" :class="wrAt(a, round) >= champWr ? 'good' : 'bad'">{{ pct(wrAt(a, round), 0) }}</span>
        <span v-if="!compact" class="num small faint">{{ signed((wrAt(a, round) - champWr) * 100) }}</span>
      </div>
      <div v-if="!rows.length" class="faint small">Aucun augment ne correspond.</div>
    </div>
    <p class="faint small">
      {{ total }} augments de cette rareté vus sur ce champion · rang = classement par winrate
      <template v-if="round"> au choix {{ round }} ({{ ROUND_LABEL[round - 1] }}{{ manualRound === null ? ', d’après ton niveau' : '' }})</template>
      · vert = mieux que la moyenne du champion.
    </p>
  </section>
</template>

<style scoped>
.finder { padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
.bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.bar h2 { font-size: 14px; margin-right: auto; }
.seg { display: flex; background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
.seg button { border: 0; background: transparent; color: var(--muted); padding: 4px 9px; border-radius: var(--radius); cursor: pointer; font: inherit; font-size: 12px; }
.seg button.on { background: var(--panel); color: var(--r); font-weight: 650; }
.rounds button { min-width: 28px; }
.auto { color: var(--good); margin-left: 2px; }
.search { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 5px 9px; font: inherit; font-size: 13px; width: 190px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 14px; max-height: 360px; overflow: auto; }
.compact .grid { max-height: none; }
.aug { display: grid; grid-template-columns: 24px 24px 1fr auto auto auto; gap: 7px; align-items: center; padding: 3px 0; font-size: 13px; border-bottom: 1px solid var(--line); }
.aug img, .ph { border-radius: var(--radius); width: 24px; height: 24px; background: var(--panel-2); }
.rank { font-size: 11px; text-align: right; }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr { font-weight: 650; }
.few { font-size: 10px; color: var(--faint); border: 1px solid var(--line); border-radius: var(--radius); padding: 0 4px; margin-left: 6px; }
.small { font-size: 11px; }
</style>
