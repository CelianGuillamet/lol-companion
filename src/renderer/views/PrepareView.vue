<script setup lang="ts">
// « Préparer » : la tier list, puis la fiche d'un champion. La fiche bascule entre Mayhem (augments + build
// arammeta) et la Faille rôle par rôle (build OP.GG, matchups), sans revenir à la liste.
import { computed, ref, watch } from 'vue';
import { championIcon, pct, hideBroken } from '../store';
import { explore, explored, exploring } from '../explore';
import TierView from './TierView.vue';
import AugmentChooser from '../ingame/AugmentChooser.vue';
import BuildView from './BuildView.vue';
import Confidence from '../ui/Confidence.vue';

const a = computed(() => explored.value?.augments ?? null);
const b = computed(() => explored.value?.build ?? null);
const LANE_LABEL: Record<string, string> = { top: 'Haut', jungle: 'Jungle', mid: 'Milieu', adc: 'Tireur', support: 'Support' };
const lanes = ref<{ lane: string; roleRate: number }[]>([]);
watch(
  () => explored.value?.id,
  async (id) => (lanes.value = id ? await window.api.championLanes(id) : []),
  { immediate: true },
);
const switchTo = (lane: string | null) => explored.value && explore(explored.value.id, lane);
</script>

<template>
  <div v-if="exploring && !explored" class="loading" aria-busy="true">
    <div class="sk" v-for="i in 4" :key="i" />
  </div>
  <div v-else-if="explored" class="champ">
    <header>
      <button class="btn back" aria-label="Retour à la tier list" @click="explore(null)">←</button>
      <img @error="hideBroken" :src="championIcon(explored.id)" width="48" height="48" class="icon" alt="" />
      <div class="id">
        <h1>{{ a?.championName ?? b?.championName }}</h1>
        <div v-if="a" class="faint small">Mayhem · {{ pct(a.championWinrate) }} de victoires (patch {{ a.patch }})</div>
        <div v-else-if="b?.mode === 'sr'" class="faint small">{{ b.note }}</div>
        <div v-else-if="!exploring" class="faint small">Pas de données pour ce champion dans ce mode (OP.GG injoignable ?).</div>
      </div>
      <div class="seg" role="tablist" aria-label="Mode et rôle">
        <button role="tab" :aria-selected="!explored.lane" :class="{ on: !explored.lane }" @click="switchTo(null)">Mayhem</button>
        <button
          v-for="l in lanes"
          :key="l.lane"
          role="tab"
          :aria-selected="explored.lane === l.lane"
          :class="{ on: explored.lane === l.lane }"
          :title="`Joué ${Math.round(l.roleRate * 100)} % du temps dans ce rôle (classée)`"
          @click="switchTo(l.lane)"
        >
          {{ LANE_LABEL[l.lane] }}
        </button>
      </div>
    </header>
    <div class="cols" :class="{ one: !a, busy: exploring }">
      <AugmentChooser v-if="a" :panel="a" prepare />
      <div class="stack">
        <section v-if="b?.matchups && (b.matchups.beats.length || b.matchups.losesTo.length)" class="card block mus">
          <div>
            <h2>Il bat</h2>
            <ul>
              <li v-for="m in b.matchups.beats" :key="m.id">
                <img @error="hideBroken" :src="championIcon(m.id)" width="26" height="26" class="icon" alt="" />
                <span class="n">{{ m.name }}</span>
                <span class="num good">{{ pct(m.winrate, 0) }}</span>
                <Confidence :winrate="m.winrate" :games="m.games" compact />
              </li>
            </ul>
          </div>
          <div>
            <h2>Il perd contre</h2>
            <ul>
              <li v-for="m in b.matchups.losesTo" :key="m.id">
                <img @error="hideBroken" :src="championIcon(m.id)" width="26" height="26" class="icon" alt="" />
                <span class="n">{{ m.name }}</span>
                <span class="num bad">{{ pct(m.winrate, 0) }}</span>
                <Confidence :winrate="m.winrate" :games="m.games" compact />
              </li>
            </ul>
          </div>
        </section>
        <BuildView compact no-live :panel="b" />
      </div>
    </div>
  </div>
  <TierView v-else />
</template>

<style scoped>
.loading { padding: 24px; display: flex; flex-direction: column; gap: 12px; }
.sk { height: 90px; background: linear-gradient(90deg, var(--panel), #102030, var(--panel)); background-size: 200% 100%; animation: sk 1.2s linear infinite; }
@keyframes sk { to { background-position: -200% 0; } }
.champ { height: 100%; display: flex; flex-direction: column; min-height: 0; }
header { display: flex; gap: 12px; align-items: center; padding: 14px 22px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.back { padding: 6px 11px; font-size: 16px; }
.id { flex: 1; min-width: 200px; }
header h1 { font-size: 22px; }
.small { font-size: 12px; }
.seg { display: inline-flex; border: 1px solid var(--rule); flex-wrap: wrap; }
.seg button { border: 0; background: transparent; color: var(--muted); padding: 6px 12px; font: inherit; font-size: 13px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--gold-soft); color: var(--gold-hi); }
.seg button:hover:not(.on) { color: var(--text); }
.cols { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: 18px; padding: 16px 22px 24px; align-items: start; transition: opacity 0.15s; }
.cols.busy { opacity: 0.5; }
.cols.one { grid-template-columns: minmax(0, 900px); }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
.stack { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.block { padding: 14px 16px; }
.mus { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.mus h2 { font-size: 14px; margin-bottom: 8px; }
.mus ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 5px; }
.mus li { display: grid; grid-template-columns: 26px 1fr auto auto; gap: 8px; align-items: center; font-size: 13px; }
@media (max-width: 700px) { .mus { grid-template-columns: 1fr; } }
</style>
