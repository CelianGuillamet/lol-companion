<script setup lang="ts">
// Panneau par-dessus le jeu (portable seul, jeu en plein écran). Même règle que la vue en jeu :
// si les cartes sont lues à l'écran, elles seules, la meilleure au liseré prismatique ; sinon le top de chaque
// rareté pour le choix en cours.
import { computed } from 'vue';
import { state, pct, hideBroken, wrAt, ROUND_LABEL } from './store';
import type { AugmentRow, Rarity } from '../core/types';
import { presentOfferedCards } from './offered-cards';
import { purchaseOf } from './purchase';
import PurchaseLine from './ui/PurchaseLine.vue';

const panel = computed(() => state.value?.augments ?? null);
const round = computed(() => state.value?.augRound ?? null);
const offered = computed(() => state.value?.offered ?? null);
const RARITIES: { key: Rarity; label: string }[] = [
  { key: 'kPrismatic', label: 'Prismatique' },
  { key: 'kGold', label: 'Or' },
  { key: 'kSilver', label: 'Argent' },
];
const rowsOf = (k: Rarity): AugmentRow[] => {
  const p = panel.value!;
  return p.all?.[k]?.length ? p.all[k] : [...p.top[k], ...p.avoid[k]];
};
const top = (k: Rarity) => [...rowsOf(k)].sort((a, b) => wrAt(b, round.value) - wrAt(a, round.value)).slice(0, 3);
const byId = computed(() => {
  const m = new Map<number, AugmentRow>();
  if (panel.value) for (const r of RARITIES) for (const a of rowsOf(r.key)) m.set(a.id, a);
  for (const a of offered.value?.extra ?? []) if (!m.has(a.id)) m.set(a.id, a);
  return m;
});
const presentation = computed(() => presentOfferedCards(offered.value, byId.value, round.value));
const cards = computed(() => presentation.value.cards);
const buy = computed(() => purchaseOf(state.value?.nextBuy));
// Faille : pas d'augments, le panneau montre ton adversaire de lane et le prochain achat
const density = computed(() => state.value?.settings.overlayDensity ?? 'compact');
const threats = computed(() => (state.value?.counters?.threats ?? []).slice(0, 2));
/** Mode minimal : la seule chose à faire maintenant (meilleure carte lue, sinon prochain achat). */
const one = computed(() => {
  const c = cards.value[0];
  if (presentation.value.sure && c) return { what: `Prends ${c.name} · ${c.position}`, num: c.adjusted ? `${(c.score! * 100).toFixed(0)} pts` : pct(c.score, 0), good: true };
  const b = buy.value;
  if (b) return {
    what: b.title,
    num: b.canBuy && b.cost != null ? `${b.cost.toLocaleString('fr-FR')} or` : b.missing != null ? `manque ${b.missing.toLocaleString('fr-FR')} or` : 'prix inconnu',
    good: b.canBuy,
  };
  return null;
});
const sr = computed(() => (state.value?.mode === 'sr' && !panel.value ? { lane: state.value.counters?.lane ?? null, build: state.value.build } : null));
const myTraps = computed(() => new Set((panel.value?.myTraps ?? []).map((t) => t.id)));
</script>

<template>
  <div v-if="density === 'minimal' && (sr || panel)" class="ov mini" aria-live="polite">
    <span class="name" :title="one?.what">{{ one?.what ?? (sr?.lane ? `contre ${sr.lane.opponent.name}` : 'En attente…') }}</span>
    <span v-if="one" class="num" :class="one.good ? 'good' : 'faint'">{{ one.num }}</span>
  </div>
  <div v-else-if="sr" class="ov">
    <div class="title">
      <strong>{{ sr.build?.championName ?? 'Faille' }}</strong>
      <span class="faint">{{ sr.build?.lane ?? '' }}</span>
    </div>
    <div v-if="sr.lane" class="row">
      <span />
      <span class="name">contre {{ sr.lane.opponent.name }}</span>
      <span class="num" :class="sr.lane.verdict === 'favorable' ? 'good' : sr.lane.verdict === 'défavorable' ? 'bad' : ''">{{ sr.lane.games ? pct(sr.lane.myWinRate, 0) : '—' }}</span>
    </div>
    <PurchaseLine v-if="buy" :purchase="buy" />
    <section v-if="density === 'full' && threats.length" class="th">
      <div class="rar">En face</div>
      <div v-for="t in threats" :key="t.key" class="why"><b>{{ t.title }}</b> · {{ t.items.slice(0, 2).map((i) => i.name).join(', ') }}</div>
    </section>
    <div class="hint faint">⌘⇧A masquer</div>
  </div>
  <div v-else-if="panel" class="ov">
    <div class="title">
      <strong>{{ panel.championName }}</strong>
      <span class="faint">{{ round ? `choix ${round} · ${ROUND_LABEL[round - 1]}` : 'augments' }}</span>
    </div>

    <section v-if="offered" class="cards">
      <div class="rar">Tes cartes</div>
      <p v-if="!presentation.sure" class="doubt">{{ offered.unsure || 'Données insuffisantes' }} · aucun conseil</p>
      <div v-for="(c, i) in cards" :key="c.id" class="row" :class="{ best: presentation.sure && i === 0, reco: presentation.sure && i === 0 }">
        <img v-if="c.a?.icon" @error="hideBroken" :src="c.a.icon" width="22" height="22" alt="" />
        <span v-else />
        <span class="name"><span v-if="c.position" class="position">{{ presentation.sure && i === 0 ? 'À prendre · ' : '' }}{{ c.position }}</span>{{ c.name }}<span v-if="myTraps.has(c.id)" class="bad"> · tu perds avec</span><span v-else-if="offered.fit?.[c.id]" :class="offered.fit[c.id].good ? 'good' : 'bad'"> · {{ offered.fit[c.id].good ? 'va avec ton build' : 'pas ton build' }}</span></span>
        <span class="num" :aria-label="c.adjusted ? 'Score ajusté selon le build' : c.a?.estimated ? 'Winrate estimé' : 'Winrate'">{{ c.score == null ? '—' : c.adjusted ? `${(c.score * 100).toFixed(0)} pts` : pct(c.score, 0) }}</span>
      </div>
    </section>

    <template v-else>
      <section v-for="r in RARITIES" :key="r.key" :class="`rarity-${r.key}`">
        <div class="rar">{{ r.label }}</div>
        <div v-for="a in top(r.key)" :key="a.id" class="row">
          <img @error="hideBroken" v-if="a.icon" :src="a.icon" width="22" height="22" alt="" />
          <span v-else />
          <span class="name">{{ a.name }}</span>
          <span class="num">{{ pct(wrAt(a, round), 0) }}</span>
        </div>
      </section>
    </template>
    <PurchaseLine v-if="buy" :purchase="buy" />
    <section v-if="density === 'full' && threats.length" class="th">
      <div class="rar">En face</div>
      <div v-for="t in threats" :key="t.key" class="why"><b>{{ t.title }}</b> · {{ t.items.slice(0, 2).map((i) => i.name).join(', ') }}</div>
    </section>
    <div class="hint faint">⌘⇧A masquer · ⌘⇧R relire les cartes</div>
  </div>
</template>

<style scoped>
.ov {
  margin: 6px;
  padding: 12px 12px 8px;
  border-radius: var(--radius);
  background: rgba(8, 16, 24, 0.92);
  border: 1px solid var(--border-strong);
  box-shadow: inset 0 1px 0 rgba(200, 170, 110, 0.35); /* filet d'or en haut : repère discret par-dessus le jeu */
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.title strong { }
.rar { color: var(--r, var(--gold)); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3px; }
.row { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; padding: 3px 6px; border-radius: var(--radius); position: relative; }
.row img { border-radius: var(--radius); }
.row.best { font-weight: 700; font-size: 13.5px; padding: 7px 6px 7px 14px; background: rgba(200, 170, 110, 0.12); }

.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.position { display: block; font-size: 11px; color: var(--gold); font-weight: 500; }
.num { font-weight: 650; }
.doubt { margin: 0 0 2px; font-size: 11.5px; color: var(--gold); }
.why { font-size: 11px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint { font-size: 10.5px; text-align: right; }
.mini { flex-direction: row; justify-content: space-between; align-items: center; padding: 8px 12px; font-size: 13px; font-weight: 650; }
.mini .name { min-width: 0; }
.mini .num { flex-shrink: 0; white-space: nowrap; font-size: 12px; }
.th .why { white-space: normal; }
</style>
