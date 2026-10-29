<script setup lang="ts">
// Choix d'augment : les 3 cartes proposées ont la même rareté. Si l'app a lu les cartes à l'écran, elles sont
// en tête, classées, la meilleure au liseré prismatique (seulement si les 3 sont reconnues : dans le doute, on se
// tait). Sinon : choisis la rareté, repère tes 3 cartes dans la liste classée pour ce moment de la partie.
import { computed, ref, watch } from 'vue';
import { tone, state, pct, hideBroken, wrAt, ROUND_LABEL } from '../store';
import type { AugmentPanel, AugmentRow, Rarity } from '../../core/types';

const props = defineProps<{ panel: AugmentPanel; prepare?: boolean }>();

const RARITIES: { key: Rarity; label: string }[] = [
  { key: 'kPrismatic', label: 'Prismatique' },
  { key: 'kGold', label: 'Or' },
  { key: 'kSilver', label: 'Argent' },
];
const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const rarity = ref<Rarity>((read('aug-rarity') as Rarity) || 'kGold');
watch(rarity, (r) => {
  try {
    localStorage.setItem('aug-rarity', r);
  } catch {
    /* sans stockage */
  }
});

const manualRound = ref<number | 'all' | null>(null);
const round = computed(() => (manualRound.value === 'all' ? null : (manualRound.value ?? state.value?.augRound ?? null)));
watch(() => state.value?.augRound, () => (manualRound.value = null)); // nouveau choix en jeu : on revient en automatique

// Cartes lues à l'écran (pas en préparation)
const offered = computed(() => (props.prepare ? null : (state.value?.offered ?? null)));
watch(
  () => offered.value?.rarity,
  (r) => {
    if (r) rarity.value = r;
  },
  { immediate: true },
);
const byId = computed(() => {
  const m = new Map<number, AugmentRow>();
  for (const r of RARITIES) for (const a of [...(props.panel.all?.[r.key] ?? []), ...props.panel.top[r.key], ...props.panel.avoid[r.key]]) m.set(a.id, a);
  for (const a of offered.value?.extra ?? []) if (!m.has(a.id)) m.set(a.id, a);
  return m;
});
const cards = computed(() => {
  const o = offered.value;
  if (!o) return [];
  return o.ids
    .map((id, i) => ({ id, name: o.names[i], a: byId.value.get(id) ?? null }))
    .sort((x, y) => score(y) - score(x));
});
// Classement des cartes : winrate au moment du choix, corrigé selon ton build en cours (bonus / malus affiché)
const fitOf = (id: number) => offered.value?.fit?.[id] ?? null;
function score(c: { id: number; a: AugmentRow | null }) {
  return c.a ? wrAt(c.a, round.value) + (fitOf(c.id)?.delta ?? 0) : -1;
}
const sure = computed(() => !!offered.value && !offered.value.unsure);
const showAll = ref(false);
watch(offered, (o) => {
  if (!o) showAll.value = false;
});
const listOpen = computed(() => !offered.value || showAll.value);

const q = ref('');
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const traps = computed(() => new Set((props.panel.traps ?? []).map((t) => t.id)));
const myTraps = computed(() => new Map((props.panel.myTraps ?? []).map((t) => [t.id, t])));
const champWr = computed(() => props.panel.championWinrate ?? 0.5);

const pool = computed<AugmentRow[]>(() => {
  const all = props.panel.all?.[rarity.value];
  if (all?.length) return all;
  return [...props.panel.top[rarity.value], ...props.panel.avoid[rarity.value]];
});
const sorted = computed(() => [...pool.value].sort((a, b) => wrAt(b, round.value) - wrAt(a, round.value)));
const rows = computed(() => {
  const s = norm(q.value.trim());
  return sorted.value.map((a, i) => ({ a, rank: i + 1 })).filter(({ a }) => !s || norm(a.name).includes(s));
});
const hasRounds = computed(() => pool.value.some((a) => a.rounds?.some((x) => x != null)));
const delta = (a: AugmentRow) => (wrAt(a, round.value) - champWr.value) * 100;
const fmtDelta = (d: number) => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.', ',')}`;
</script>

<template>
  <section class="chooser">
    <header>
      <div class="rar" role="tablist" aria-label="Rareté des cartes proposées">
        <button
          v-for="r in RARITIES"
          :key="r.key"
          role="tab"
          :aria-selected="rarity === r.key"
          :class="[`rarity-${r.key}`, { on: rarity === r.key }]"
          @click="rarity = r.key"
        >
          {{ r.label }}
        </button>
      </div>
      <div class="tools">
        <div v-if="hasRounds" class="rounds" title="Un augment ne vaut pas pareil au début et au niveau 15">
          <button :class="{ on: manualRound === 'all' }" @click="manualRound = 'all'">Global</button>
          <button v-for="n in 4" :key="n" :class="{ on: round === n && manualRound !== 'all', auto: state?.augRound === n }" @click="manualRound = n">{{ n }}</button>
        </div>
        <input v-model="q" class="search" placeholder="Chercher…" spellcheck="false" aria-label="Chercher un augment" />
      </div>
    </header>
    <section v-if="offered" class="cards" aria-live="polite">
      <h3>Tes cartes <span class="src">lues à l’écran</span></h3>
      <p v-if="offered.unsure" class="doubt">{{ offered.unsure }} : vérifie dans la liste. <kbd>⌘⇧R</kbd> pour relire.</p>
      <ol class="list">
        <li v-for="(c, i) in cards" :key="c.id" :class="{ best: sure && i === 0, reco: sure && i === 0, top: true, trap: traps.has(c.id) || myTraps.has(c.id) }">
          <span class="rank num">{{ i + 1 }}</span>
          <img v-if="c.a?.icon" @error="hideBroken" :src="c.a.icon" width="30" height="30" class="ic" alt="" />
          <span v-else class="ic" />
          <span class="name">
            <span class="n">{{ c.name }}</span>
            <span class="tags">
              <span v-if="myTraps.has(c.id)" class="tag bad">tu perds avec ({{ myTraps.get(c.id)!.wins }}V {{ myTraps.get(c.id)!.games - myTraps.get(c.id)!.wins }}D)</span>
              <span v-else-if="c.a?.personal && c.a.personal.games >= 2" class="tag" :class="tone(c.a.personal.wins, c.a.personal.games)">toi {{ c.a.personal.wins }}V {{ c.a.personal.games - c.a.personal.wins }}D</span>
              <span v-if="fitOf(c.id)" class="tag" :class="fitOf(c.id)!.good ? 'good' : 'bad'" title="Correction selon tes items achetés et prévus (description de l’augment sur le wiki)">{{ fitOf(c.id)!.why }} {{ fmtDelta(fitOf(c.id)!.delta * 100) }}</span>
              <span v-if="traps.has(c.id)" class="tag bad">piège fréquent</span>
              <span v-if="!c.a" class="tag faint">pas de données</span>
              <span v-else-if="c.a.estimated" class="tag faint" title="Rarement pris sur ce champion : winrate du champion + effet moyen de l’augment">estimé</span>
              <span v-else-if="c.a.games < 300" class="tag faint">peu de données</span>
            </span>
          </span>
          <template v-if="c.a">
            <span class="wr num wide" :class="score(c) - champWr >= 0 ? 'good' : 'bad'" :title="fitOf(c.id) ? `${pct(wrAt(c.a, round), 0)} en moyenne, corrigé selon ton build` : ''">{{ pct(score(c), 0) }}</span>
            <span class="d num">{{ fmtDelta((score(c) - champWr) * 100) }}</span>
          </template>
          <template v-else><span /><span /></template>
        </li>
      </ol>
      <button class="more" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? 'Masquer la liste' : `Toute la liste (${pool.length})` }}</button>
    </section>

    <p v-if="listOpen" class="context">
      <template v-if="round">Classés pour le choix {{ round }} ({{ ROUND_LABEL[round - 1] }}){{ manualRound === null ? ', d’après ton niveau' : '' }}.</template>
      <template v-else>Classés sur toute la partie.</template>
      <template v-if="!props.prepare && !offered">{{ ' ' }}Repère tes 3 cartes, prends la plus haute.</template>
    </p>

    <ol v-if="listOpen" class="list">
      <li v-for="{ a, rank } in rows" :key="a.id" :class="{ best: rank === 1 && !offered, reco: rank === 1 && !offered, top: rank <= 3, trap: traps.has(a.id) || myTraps.has(a.id) }">
        <span class="rank num">{{ rank }}</span>
        <img v-if="a.icon" @error="hideBroken" :src="a.icon" width="30" height="30" class="ic" alt="" />
        <span v-else class="ic" />
        <span class="name">
          <span class="n">{{ a.name }}</span>
          <span class="tags">
            <span v-if="myTraps.has(a.id)" class="tag bad">tu perds avec ({{ myTraps.get(a.id)!.wins }}V {{ myTraps.get(a.id)!.games - myTraps.get(a.id)!.wins }}D)</span>
            <span v-else-if="a.personal && a.personal.games >= 2" class="tag" :class="tone(a.personal.wins, a.personal.games)">toi {{ a.personal.wins }}V {{ a.personal.games - a.personal.wins }}D</span>
            <span v-if="traps.has(a.id)" class="tag bad">piège fréquent</span>
            <span v-if="a.games < 300" class="tag faint">peu de données</span>
          </span>
        </span>
        <span class="wr num wide" :class="delta(a) >= 0 ? 'good' : 'bad'">{{ pct(wrAt(a, round), 0) }}</span>
        <span class="d num">{{ fmtDelta(delta(a)) }}</span>
      </li>
      <li v-if="!rows.length" class="none">Aucun augment ne correspond.</li>
    </ol>
  </section>
</template>

<style scoped>
.chooser { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.rar { display: flex; gap: 6px; }
.rar button {
  border: 1px solid var(--line); background: var(--panel); color: var(--muted); padding: 8px 14px; border-radius: var(--radius);
  cursor: pointer; font-weight: 650;
}
.rar button.on { color: var(--r); background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent); border-color: var(--r); box-shadow: inset 0 -2px 0 var(--r); }
.rar button.rarity-kPrismatic.on { border-image: var(--rarity-prism) 1; box-shadow: inset 0 -2px 0 var(--prismatic); }
.tools { display: flex; gap: 8px; align-items: center; }
.rounds { display: flex; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
.rounds button { border: 0; background: transparent; color: var(--muted); padding: 4px 8px; border-radius: var(--radius); cursor: pointer; font-size: 12px; position: relative; }
.rounds button.on { background: var(--panel-2); color: var(--text); font-weight: 650; }
.rounds button.auto::after { content: ''; position: absolute; top: 3px; right: 2px; width: 5px; height: 5px; border-radius: 50%; background: var(--good); }
.search { background: var(--panel); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 10px; font: inherit; font-size: 13px; width: 140px; }
.context { margin: 0; font-size: 12px; color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; overflow: auto; }
li {
  display: grid; grid-template-columns: 26px 30px 1fr auto 44px; gap: 10px; align-items: center;
  padding: 6px 10px; border-radius: var(--radius); background: var(--panel);
}
li.top { background: var(--panel-2); }
/* Le meilleur choix : cadre de recommandation (.reco, styles.css) */
li.best { padding: 11px 12px 11px 16px; background: linear-gradient(90deg, rgba(200, 170, 110, 0.14), var(--panel-2) 60%); }
li.best .n { font-size: 15px; font-weight: 700; }
li.trap .n { color: var(--muted); }
.rank { color: var(--faint); font-size: 13px; text-align: right; font-weight: 650; }
li.top .rank { color: var(--text); }
.ic { border-radius: var(--radius); background: var(--panel-2); width: 30px; height: 30px; }
.name { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.n { font-weight: 600; }
.tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 0 6px; border-radius: var(--radius); background: rgba(255, 255, 255, 0.05); }
.wr { font-size: 16px; font-weight: 700; text-align: right; }
.d { font-size: 12px; color: var(--faint); text-align: right; }
.none { grid-template-columns: 1fr; color: var(--muted); font-size: 13px; }
.cards { display: flex; flex-direction: column; gap: 6px; }
.cards h3 { margin: 2px 0 0; font-size: 15px; }
.cards .src { font-size: 11px; color: var(--faint); font-weight: 500; margin-left: 6px; }
.cards .best .n { font-size: 17px; }
.doubt { margin: 0; font-size: 12px; color: var(--gold); }
kbd { font: inherit; font-size: 11px; border: 1px solid var(--line); border-radius: var(--radius); padding: 0 4px; color: var(--muted); }
.more { align-self: flex-start; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
.more:hover { color: var(--text); }
@media (max-width: 520px) {
  li { grid-template-columns: 22px 28px 1fr auto; gap: 8px; }
  .d { display: none; }
  .rar button { padding: 8px 10px; }
}
</style>
