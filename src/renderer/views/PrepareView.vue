<script setup lang="ts">
// « Préparer » : la tier list, et la fiche d'un champion (augments, build, tes résultats) quand tu en choisis un.
import { computed } from 'vue';
import { championIcon, pct, hideBroken } from '../store';
import { explore, explored, exploring } from '../explore';
import TierView from './TierView.vue';
import AugmentChooser from '../ingame/AugmentChooser.vue';
import BuildView from './BuildView.vue';

const a = computed(() => explored.value?.augments ?? null);
</script>

<template>
  <div v-if="exploring" class="loading">Chargement…</div>
  <div v-else-if="explored" class="champ">
    <header>
      <button class="btn" @click="explore(null)">Retour à la tier list</button>
      <img @error="hideBroken" :src="championIcon(explored.id)" width="44" height="44" class="icon" alt="" />
      <div>
        <h1>{{ a?.championName ?? explored.build?.championName }}</h1>
        <div v-if="a" class="faint small">Winrate Mayhem {{ pct(a.championWinrate) }} sur le patch {{ a.patch }}</div>
        <div v-else-if="explored.build?.mode === 'sr'" class="faint small">{{ explored.build.note }}</div>
        <div v-else-if="!explored.build" class="faint small">Pas de données pour ce champion (OP.GG injoignable ?).</div>
      </div>
    </header>
    <div class="cols" :class="{ one: !a }">
      <AugmentChooser v-if="a" :panel="a" prepare />
      <BuildView compact no-live :panel="explored.build" />
    </div>
  </div>
  <TierView v-else />
</template>

<style scoped>
.loading { padding: 40px; color: var(--muted); }
.champ { height: 100%; display: flex; flex-direction: column; min-height: 0; }
header { display: flex; gap: 12px; align-items: center; padding: 16px 22px; border-bottom: 1px solid var(--line); }
header h1 { font-size: 22px; }
.small { font-size: 12px; }
.cols { flex: 1; min-height: 0; overflow: auto; display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(320px, 1fr); gap: 18px; padding: 16px 22px 24px; align-items: start; }
@media (max-width: 1000px) { .cols { grid-template-columns: 1fr; } }
.cols.one { grid-template-columns: minmax(0, 860px); }
</style>
