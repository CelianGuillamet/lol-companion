<script setup lang="ts">
// Écart d'objets dans l'en-tête : un coup d'œil, le détail se déplie. Une lecture du tableau des scores, pas un conseil.
import { computed } from 'vue';
import { state, signedGold, shortGold } from '../store';

defineProps<{ open: boolean }>();
defineEmits<{ toggle: [] }>();

const gap = computed(() => state.value?.goldGap ?? null);
const label = computed(() => {
  const g = gap.value;
  if (!g) return '';
  return g.state === 'even' ? 'Objets à égalité' : `Objets ${signedGold(g.gap)}`;
});
const levels = computed(() => {
  const n = gap.value?.levelGap ?? 0;
  return n === 0 ? 'mêmes niveaux' : `niv. ${n > 0 ? '+' : '−'}${Math.abs(n)}`;
});
</script>

<template>
  <button v-if="gap" class="gap" :class="gap.state" :aria-expanded="open" title="Valeur des objets au tableau des scores, ton équipe moins la leur, et somme des niveaux. L’or en poche ne compte pas." @click="$emit('toggle')">
    <span class="line"><strong>{{ label }}</strong> <span class="faint">· {{ levels }}</span></span>
    <span class="line faint small">Plus riche en face : {{ gap.richest.championName }}, {{ shortGold(gap.richest.gold) }}</span>
  </button>
</template>

<style scoped>
.gap { display: flex; flex-direction: column; gap: 1px; align-items: flex-end; padding: 4px 10px; min-height: 40px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; text-align: right; }
.gap:hover, .gap[aria-expanded='true'] { border-color: var(--border-strong); }
.line { font-size: var(--fs-sm); white-space: nowrap; }
.small { font-size: 12px; }
.ahead strong { color: var(--ok); }
.behind strong { color: var(--danger); }
@media (max-width: 860px) { .gap { width: 100%; align-items: flex-start; text-align: left; } }
</style>
