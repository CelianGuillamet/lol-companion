<script setup lang="ts">
// Ton identité, lue dans le client : Riot ID, icône, niveau, rangs classés (solo et flex). Rien d'autre :
// pas de recherche d'autres joueurs (il faudrait une clé de l'API Riot).
import { computed } from 'vue';
import { state, hideBroken } from '../store';

const p = computed(() => state.value?.player ?? null);
const TIER: Record<string, string> = {
  IRON: 'Fer', BRONZE: 'Bronze', SILVER: 'Argent', GOLD: 'Or', PLATINUM: 'Platine', EMERALD: 'Émeraude', DIAMOND: 'Diamant', MASTER: 'Maître', GRANDMASTER: 'Grand maître', CHALLENGER: 'Challenger',
};
const name = computed(() => p.value?.riotId.split('#') ?? []);
</script>

<template>
  <div v-if="p" class="pc">
    <img v-if="p.iconUrl" @error="hideBroken" :src="p.iconUrl" width="36" height="36" class="av" alt="" />
    <div class="who">
      <div class="rid">{{ name[0] }}<span v-if="name[1]" class="tag">#{{ name[1] }}</span></div>
      <div v-if="p.level" class="faint small">Niveau {{ p.level }}</div>
    </div>
    <ul v-if="p.ranks.length" class="ranks">
      <li v-for="r in p.ranks" :key="r.queue" :class="`t-${r.tier.toLowerCase()}`" :title="`${r.wins} V · ${r.losses} D`">
        <span class="q">{{ r.queue }}</span>
        <span class="tier">{{ TIER[r.tier] ?? r.tier }} {{ r.division }}</span>
        <span class="num faint">{{ r.lp }} LP</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.pc { display: grid; grid-template-columns: auto 1fr; gap: 4px 10px; align-items: center; }
.av { border-radius: 50%; box-shadow: 0 0 0 1.5px var(--gold-lo), 0 0 0 3px #0a1520; }
.rid { color: var(--text); font-weight: 650; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tag { color: var(--faint); font-weight: 500; margin-left: 2px; }
.small { font-size: 11.5px; }
.ranks { grid-column: 1 / -1; list-style: none; margin: 6px 0 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
.ranks li { display: grid; grid-template-columns: 54px 1fr auto; gap: 6px; font-size: 11.5px; }
.q { color: var(--faint); }
.tier { color: var(--gold); font-weight: 650; }
.t-diamond .tier, .t-emerald .tier { color: #7fe3d8; }
.t-master .tier, .t-grandmaster .tier, .t-challenger .tier { color: var(--gold-hi); }
</style>
