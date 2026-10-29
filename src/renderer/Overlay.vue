<script setup lang="ts">
// Panneau par-dessus le jeu (portable seul, jeu en plein écran). Même règle que la vue en jeu :
// si les cartes sont lues à l'écran, elles seules, la meilleure au liseré prismatique ; sinon le top de chaque
// rareté pour le choix en cours.
import { computed } from 'vue';
import { state, pct, hideBroken, wrAt, ROUND_LABEL } from './store';
import type { AugmentRow, Rarity } from '../core/types';

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
const cards = computed(() => {
  const o = offered.value;
  if (!o) return [];
  return o.ids
    .map((id, i) => ({ id, name: o.names[i], a: byId.value.get(id) ?? null }))
    .sort((x, y) => (y.a ? wrAt(y.a, round.value) + (o.fit?.[y.id]?.delta ?? 0) : -1) - (x.a ? wrAt(x.a, round.value) + (o.fit?.[x.id]?.delta ?? 0) : -1));
});
const buy = computed(() => state.value?.nextBuy?.rows[0] ?? null);
// Faille : pas d'augments, le panneau montre ton adversaire de lane et le prochain achat
const sr = computed(() => (state.value?.mode === 'sr' && !panel.value ? { lane: state.value.counters?.lane ?? null, build: state.value.build } : null));
const myTraps = computed(() => new Set((panel.value?.myTraps ?? []).map((t) => t.id)));
</script>

<template>
  <div v-if="sr" class="ov">
    <div class="title">
      <strong>{{ sr.build?.championName ?? 'Faille' }}</strong>
      <span class="faint">{{ sr.build?.lane ?? '' }}</span>
    </div>
    <div v-if="sr.lane" class="row">
      <span />
      <span class="name">contre {{ sr.lane.opponent.name }}</span>
      <span class="num" :class="sr.lane.verdict === 'favorable' ? 'good' : sr.lane.verdict === 'défavorable' ? 'bad' : ''">{{ sr.lane.games ? pct(sr.lane.myWinRate, 0) : '—' }}</span>
    </div>
    <div v-if="buy" class="buy">
      <div class="rar">Achat</div>
      <div class="row">
        <img v-if="buy.item.icon" @error="hideBroken" :src="buy.item.icon" width="22" height="22" alt="" />
        <span v-else />
        <span class="name">{{ buy.item.name }}</span>
        <span class="num" :class="buy.missing ? 'bad' : 'good'">{{ buy.missing ? `−${buy.missing}` : 'OK' }}</span>
      </div>
      <div class="why faint">{{ buy.why }}</div>
    </div>
    <div class="hint faint">⌘⇧A masquer</div>
  </div>
  <div v-else-if="panel" class="ov">
    <div class="title">
      <strong>{{ panel.championName }}</strong>
      <span class="faint">{{ round ? `choix ${round} · ${ROUND_LABEL[round - 1]}` : 'augments' }}</span>
    </div>

    <section v-if="offered" class="cards">
      <div class="rar">Tes cartes</div>
      <p v-if="offered.unsure" class="doubt">{{ offered.unsure }}</p>
      <div v-for="(c, i) in cards" :key="c.id" class="row" :class="{ best: !offered.unsure && i === 0, reco: !offered.unsure && i === 0 }">
        <img v-if="c.a?.icon" @error="hideBroken" :src="c.a.icon" width="22" height="22" alt="" />
        <span v-else />
        <span class="name">{{ c.name }}<span v-if="myTraps.has(c.id)" class="bad"> · tu perds avec</span><span v-else-if="offered.fit?.[c.id]" :class="offered.fit[c.id].good ? 'good' : 'bad'"> · {{ offered.fit[c.id].good ? 'va avec ton build' : 'pas ton build' }}</span></span>
        <span class="num">{{ c.a ? pct(wrAt(c.a, round) + (offered.fit?.[c.id]?.delta ?? 0), 0) : '—' }}</span>
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
    <div v-if="buy" class="buy">
      <div class="rar">Achat</div>
      <div class="row">
        <img v-if="buy.item.icon" @error="hideBroken" :src="buy.item.icon" width="22" height="22" alt="" />
        <span v-else />
        <span class="name">{{ buy.item.name }}</span>
        <span class="num" :class="buy.missing ? 'bad' : 'good'">{{ buy.missing ? `−${buy.missing}` : 'OK' }}</span>
      </div>
      <div class="why faint">{{ buy.why }}</div>
    </div>
    <div class="hint faint">⌘⇧A masquer · ⌘⇧R relire les cartes</div>
  </div>
</template>

<style scoped>
.ov {
  margin: 6px;
  padding: 12px 12px 8px;
  border-radius: var(--radius);
  background: rgba(14, 21, 32, 0.9);
  border: 1px solid var(--line);
  font-size: 12.5px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.title { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
.title strong { }
.rar { color: var(--r, var(--gold)); font-family: var(--display); font-size: 13px; margin-bottom: 3px; }
.row { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; padding: 3px 6px; border-radius: var(--radius); position: relative; }
.row img { border-radius: var(--radius); }
.row.best { font-weight: 700; font-size: 13.5px; padding: 7px 6px 7px 14px; background: rgba(200, 170, 110, 0.12); }

.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-weight: 650; }
.doubt { margin: 0 0 2px; font-size: 11.5px; color: var(--gold); }
.why { font-size: 11px; padding: 0 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hint { font-size: 10.5px; text-align: right; }
</style>
