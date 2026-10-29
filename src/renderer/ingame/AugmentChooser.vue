<script setup lang="ts">
// Choix d'augment : les 3 cartes proposées ont la même rareté. Si l'app a lu les cartes à l'écran, elles sont
// en tête, classées, la meilleure au liseré prismatique (seulement si les 3 sont reconnues : dans le doute, on se
// tait). Sinon : choisis la rareté, repère tes 3 cartes dans la liste classée pour ce moment de la partie.
import { computed, ref, watch } from 'vue';
import { tone, state, pct, hideBroken, wrAt, ROUND_LABEL } from '../store';
import type { AugmentPanel, AugmentRow, Rarity } from '../../core/types';
import { presentOfferedCards } from '../offered-cards';
import Confidence from '../ui/Confidence.vue';

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
const presentation = computed(() => presentOfferedCards(offered.value, byId.value, round.value));
const cards = computed(() => presentation.value.cards);
// Classement des cartes : winrate au moment du choix, corrigé selon ton build en cours (bonus / malus affiché)
const fitOf = (id: number) => offered.value?.fit?.[id] ?? null;
const sure = computed(() => presentation.value.sure);
const showAll = ref(false);
watch(offered, (o) => {
  if (!o) showAll.value = false;
});
const listOpen = computed(() => !offered.value || showAll.value);
const doubt = computed(() => offered.value?.unsure || 'Données insuffisantes pour comparer les trois cartes');

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
    <section v-if="offered" class="cards" aria-live="polite">
      <div class="cards-heading">
        <h2>Tes cartes</h2>
        <span class="read-status">{{ sure ? '3 sur 3 reconnues' : 'Lecture à vérifier' }}</span>
      </div>
      <p class="decision" v-if="sure">Prends la première, puis retrouve sa position dans le jeu.</p>
      <p v-else class="doubt" role="status">{{ doubt }}. Aucun conseil pour ce tirage. Vérifie dans la liste ou relis avec <kbd>⌘⇧R</kbd>.</p>
      <ol class="list offered-list" :aria-label="sure ? 'Tes cartes classées par recommandation' : 'Cartes reconnues, sans classement'">
        <li v-for="(c, i) in cards" :key="c.id" :class="{ best: sure && i === 0, reco: sure && i === 0, top: true, trap: traps.has(c.id) || myTraps.has(c.id) }">
          <img v-if="c.a?.icon" @error="hideBroken" :src="c.a.icon" width="30" height="30" class="ic" alt="" />
          <span v-else class="ic" />
          <span class="name">
            <span class="card-cue"><b v-if="sure">{{ i === 0 ? 'À prendre' : 'Alternative' }}</b><span v-if="c.position">{{ c.position }} dans le jeu</span></span>
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
          <span v-if="c.a && c.score != null" class="card-stat num">
            <span class="metric-label">{{ c.adjusted ? 'Score ajusté' : c.a.estimated ? 'Winrate estimé' : 'Winrate' }}</span>
            <span class="wr wide">{{ c.adjusted ? `${(c.score * 100).toFixed(0)} pts` : pct(c.score, 0) }}</span>
            <span class="sample">{{ c.a.estimated ? 'estimation' : `${c.a.games.toLocaleString('fr-FR')} parties` }}</span>
            <Confidence v-if="!c.a.estimated && !c.adjusted" :winrate="wrAt(c.a, round)" :games="c.a.games" compact />
          </span>
        </li>
      </ol>
      <p v-if="cards.some((c) => c.adjusted)" class="metric-note">Score ajusté selon ton build : un indice de classement, pas une probabilité de victoire.</p>
      <button class="more" :aria-expanded="showAll" @click="showAll = !showAll">{{ showAll ? 'Masquer la liste' : 'Vérifier dans la liste complète' }}</button>
    </section>

    <header v-if="listOpen" class="filters">
      <div class="rar" role="group" aria-label="Rareté des augments">
        <button v-for="r in RARITIES" :key="r.key" :aria-pressed="rarity === r.key" :class="[`rarity-${r.key}`, { on: rarity === r.key }]" @click="rarity = r.key">{{ r.label }}</button>
      </div>
      <div class="tools">
        <div v-if="hasRounds" class="rounds" role="group" aria-label="Moment du choix d’augment">
          <button :aria-pressed="manualRound === 'all'" :class="{ on: manualRound === 'all' }" @click="manualRound = 'all'">Global</button>
          <button v-for="n in 4" :key="n" :aria-label="`Choix ${n} : ${ROUND_LABEL[n - 1]}`" :aria-pressed="round === n && manualRound !== 'all'" :class="{ on: round === n && manualRound !== 'all', auto: state?.augRound === n }" @click="manualRound = n">{{ n }}</button>
        </div>
        <input v-model="q" class="search" placeholder="Chercher un augment…" spellcheck="false" aria-label="Chercher un augment" />
      </div>
    </header>
    <p v-if="offered && sure" class="context">
      {{ round ? `Classement pour le choix ${round} (${ROUND_LABEL[round - 1]}).` : 'Classement sur toute la partie.' }}
      <span v-if="manualRound !== null">Comparaison manuelle.</span>
    </p>

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
        <span class="wr num">{{ pct(wrAt(a, round), 0) }}</span>
        <span class="d num" :class="delta(a) >= 0.5 ? 'good' : delta(a) <= -0.5 ? 'bad' : ''" :title="`Écart au winrate du champion (${pct(champWr, 1)})`">{{ fmtDelta(delta(a)) }}</span>
      </li>
      <li v-if="!rows.length" class="none">Aucun augment ne correspond.</li>
    </ol>
  </section>
</template>

<style scoped>
.chooser { display: flex; flex-direction: column; gap: 8px; min-height: 0; }
header { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
.rar { display: inline-flex; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface-1); }
.rar button {
  min-height: var(--ctl-h); border: 0; background: transparent; color: var(--muted); padding: 0 14px;
  cursor: pointer; font-weight: 650; font-size: var(--fs-sm);
}
.rar button + button { border-left: 1px solid var(--border); }
/* La rareté active prend sa couleur (souligné) : même code que les cartes du jeu */
.rar button.on { color: var(--r); background: var(--surface-2); box-shadow: inset 0 -2px 0 var(--r); }
.tools { display: flex; gap: 8px; align-items: center; }
.rounds { display: flex; background: var(--surface-1); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 2px; }
.rounds button { border: 0; background: transparent; color: var(--muted); min-height: 26px; padding: 0 9px; border-radius: var(--radius); cursor: pointer; font-size: var(--fs-sm); position: relative; }
.rounds button.on { background: var(--surface-3); color: var(--text); font-weight: 650; }
/* Point = choix en cours d'après ton niveau en jeu */
.rounds button.auto::after { content: ''; position: absolute; top: 3px; right: 2px; width: 5px; height: 5px; border-radius: 50%; background: var(--blue); }
.search { min-height: var(--ctl-h); background: var(--surface-2); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius); padding: 0 10px; font: inherit; font-size: var(--fs-sm); width: 180px; min-width: 0; }
.search:focus { border-color: var(--gold); outline: none; }
.context { margin: 0; font-size: var(--fs-sm); color: var(--muted); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; overflow: auto; border-top: 1px solid var(--border); }
li {
  display: grid; grid-template-columns: 26px 30px 1fr auto 48px; gap: 10px; align-items: center;
  min-height: 44px; padding: 6px 10px; border-bottom: 1px solid var(--border); background: transparent;
}
li.top { background: var(--surface-1); }
/* Le meilleur choix : cadre de recommandation (.reco, styles.css) */
li.best { padding: 11px 12px 11px 16px; border-bottom-color: transparent; background: linear-gradient(90deg, rgba(200, 170, 110, 0.14), var(--surface-2) 60%); }
li.best .n { font-size: 15px; font-weight: 700; }
li.trap .n { color: var(--muted); }
.rank { color: var(--faint); font-size: 13px; text-align: right; font-weight: 650; }
li.top .rank { color: var(--text); }
.ic { border-radius: var(--radius); background: var(--panel-2); width: 30px; height: 30px; }
.name { min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
.n { font-weight: 600; }
.tags { display: flex; gap: 4px; flex-wrap: wrap; }
.tag { font-size: 11px; padding: 0 6px; border-radius: var(--radius); background: rgba(255, 255, 255, 0.05); }
.wr { font-size: var(--fs-lg); font-weight: 700; text-align: right; color: var(--text); }
.d { font-size: var(--fs-sm); color: var(--faint); text-align: right; font-weight: 600; }
.d.good { color: var(--good); }
.d.bad { color: var(--bad); }
.none { grid-template-columns: 1fr; color: var(--muted); font-size: 13px; }
.cards { display: flex; flex: none; flex-direction: column; gap: 10px; }
.cards-heading { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 12px; }
.cards h2 { font-size: 19px; }
.read-status { font-size: 12px; color: var(--muted); }
.decision { margin: 0; font-size: 13px; color: var(--muted); }
.offered-list { gap: 8px; overflow: visible; border-top: 0; }
.offered-list li { grid-template-columns: 30px minmax(0, 1fr) auto; padding: 12px; gap: 12px; background: var(--surface-1); border: 1px solid var(--border); }
.offered-list li.best { border-color: transparent; }
.offered-list li.best { padding: 16px; }
.offered-list .name { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.offered-list .n { overflow-wrap: anywhere; }
.cards .best .n { font-size: 21px; line-height: 1.2; color: var(--gold-hi); }
.card-cue { display: flex; flex-wrap: wrap; gap: 2px 10px; color: var(--muted); font-size: 12px; }
.card-cue b { color: var(--gold); font-weight: 600; }
.card-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.metric-label, .sample { font-size: 11px; color: var(--muted); }
.card-stat .wr { color: var(--text); font-size: 19px; }
.metric-note { margin: 0; color: var(--muted); font-size: 12px; }
.filters { margin-top: 6px; }
.doubt { margin: 0; padding: 10px 12px; border-left: 3px solid var(--warn); background: var(--surface-1); font-size: var(--fs-sm); color: var(--text); }
.more { align-self: flex-start; border: 0; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; padding: 2px 0; text-decoration: underline; text-underline-offset: 3px; }
.more:hover { color: var(--text); }
@media (max-width: 520px) {
  li { grid-template-columns: 22px 28px 1fr auto; gap: 8px; }
  .d { display: none; }
  .rar button { padding: 8px 10px; }
  .tools { flex-wrap: wrap; width: 100%; }
  .search { flex: 1; }
  .offered-list li, .offered-list li.best { gap: 8px; padding: 12px; }
  .cards .best .n { font-size: 19px; }
  .card-stat .wr { font-size: 17px; }
}
</style>
