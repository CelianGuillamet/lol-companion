<script setup lang="ts">
// Indicateur de fiabilité d'un winrate (le même partout) : trois crans selon la largeur de l'intervalle de
// confiance à 95 % (Wilson). Une reco sur peu de parties ne doit jamais ressembler à une reco solide.
import { computed } from 'vue';
import { confidenceOf } from '../store';

const props = defineProps<{ winrate: number; games: number; compact?: boolean }>();
const c = computed(() => confidenceOf(props.winrate, props.games));
</script>

<template>
  <span class="conf" :class="`l${c.level}`" :title="c.title" role="img" :aria-label="c.label">
    <span class="bars" aria-hidden="true"><i /><i /><i /></span>
    <span v-if="!compact" class="t">{{ c.label }}</span>
  </span>
</template>

<style scoped>
.conf { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--faint); white-space: nowrap; }
.bars { display: inline-flex; gap: 2px; align-items: flex-end; }
.bars i { width: 3px; background: var(--line); border-radius: 1px; }
.bars i:nth-child(1) { height: 5px; }
.bars i:nth-child(2) { height: 8px; }
.bars i:nth-child(3) { height: 11px; }
.l3 .bars i { background: var(--gold); }
.l2 .bars i:nth-child(-n + 2) { background: var(--gold); }
.l1 .bars i:nth-child(1) { background: var(--muted); }
.l3 .t { color: var(--muted); }
</style>
