<script setup lang="ts">
// Faille : les 5 duels de la partie vus de ton équipe. Des faits de classée, pas un ordre : l'écran ne dit pas où aller.
import { computed } from 'vue';
import { championIcon, hideBroken, state } from '../store';
import type { LaneMapRow } from '../../core/types';

const map = computed(() => state.value?.laneMap ?? null);
const tone = (r: LaneMapRow) => (r.edge === 'ally' ? 'up' : r.edge === 'enemy' ? 'down' : '');
const label = (r: LaneMapRow) => (r.rate == null ? '–' : `${Math.round(r.rate * 100)} %`);
const hint = (r: LaneMapRow) => (r.rate == null ? 'Pas de chiffre sur ce duel.' : `${r.games.toLocaleString('fr-FR')} parties, ${Math.round(r.lo * 100)} à ${Math.round(r.hi * 100)} %${r.edge === null ? ', trop peu pour conclure' : r.edge === 'even' ? ', duel serré' : ''}`);
</script>

<template>
  <section v-if="map" class="map" aria-label="Duels de la partie" title="Winrate de ton équipe sur chaque duel, en classée (OP.GG). Tes alliés et leurs habitudes ne sont pas comptés.">
    <h3>Duels de la partie</h3>
    <ul>
      <li v-for="r in map.rows" :key="r.lane" :class="{ me: r.mine }" :title="hint(r)">
        <span class="l">{{ r.laneLabel }}</span>
        <img @error="hideBroken" :src="championIcon(r.ally.id)" width="20" height="20" class="ch" alt="" />
        <span class="n">{{ r.ally.name }}</span>
        <strong class="num" :class="tone(r)">{{ label(r) }}</strong>
        <span class="n">{{ r.enemy.name }}<template v-if="r.guessed"> ?</template></span>
        <img @error="hideBroken" :src="championIcon(r.enemy.id)" width="20" height="20" class="ch" alt="" />
      </li>
    </ul>
    <p v-if="map.strong"><span class="faint">Point fort :</span> {{ map.strong }}</p>
    <p v-if="map.weak"><span class="faint">Point faible :</span> {{ map.weak }}</p>
    <p v-if="map.guessed" class="faint small">? = rôle deviné.</p>
  </section>
</template>

<style scoped>
.map { display: grid; gap: 4px; padding: 8px 12px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--fs-sm); }
h3 { margin: 0; font-size: var(--fs-sm); color: var(--muted); font-weight: 500; }
ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
li { display: grid; grid-template-columns: 52px 20px minmax(0, 1fr) 42px minmax(0, 1fr) 20px; gap: 6px; align-items: center; }
li.me .n:nth-of-type(2) { color: var(--gold); }
.l { color: var(--muted); }
.n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.n:nth-of-type(3) { text-align: right; }
.num { text-align: center; }
.ch { border-radius: 2px; }
.up { color: var(--ok); }
.down { color: var(--danger); }
p { margin: 0; }
</style>
