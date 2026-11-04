<script setup lang="ts">
// Guide de lane OP.GG, au champ select et en partie. Le rythme vient de stats de classée, tous adversaires confondus.
import { computed } from 'vue';
import type { LaneEdge, LaneGuide } from '../../core/types';

const props = defineProps<{ guide: LaneGuide; opponent: string }>();
const who = (e: LaneEdge) => (e === 'me' ? 'toi' : props.opponent);
const edges = computed(() => {
  const g = props.guide;
  if (g.laneEdge && g.laneEdge === g.killEdge) return `Avantage de lane et de kills en solo : ${who(g.laneEdge)}`;
  return [g.laneEdge ? `Avantage de lane : ${who(g.laneEdge)}` : '', g.killEdge ? `Kills en solo : ${who(g.killEdge)}` : ''].filter(Boolean).join(' · ');
});
const TITLE = 'Winrate selon la durée de la partie, en classée, tous adversaires confondus (OP.GG). Ce n’est pas une mesure de ce matchup.';
</script>

<template>
  <div class="guide">
    <p v-if="guide.pace" class="pace" :title="`${TITLE} ${guide.pace.detail}`">{{ guide.pace.text }}</p>
    <p v-if="edges" class="edges">{{ edges }}</p>
    <p v-if="guide.style">{{ guide.style }}</p>
    <ul v-if="guide.tips.length">
      <li v-for="t in guide.tips" :key="t">{{ t }}</li>
    </ul>
  </div>
</template>

<style scoped>
.guide { display: grid; gap: 3px; margin-top: 4px; font-size: 12px; color: var(--muted); }
.guide p { margin: 0; }
.guide .pace { color: var(--text); }
.guide ul { margin: 0; padding-left: 16px; }
</style>
