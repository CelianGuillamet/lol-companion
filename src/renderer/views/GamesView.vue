<script setup lang="ts">
// « Mes parties » : le résumé de tes stats et l'historique complet.
import { ref } from 'vue';
import StatsView from './StatsView.vue';
import HistoryView from './HistoryView.vue';

const sub = ref<'summary' | 'history'>('summary');
</script>

<template>
  <div class="games">
    <nav class="sub" role="tablist">
      <button role="tab" :aria-selected="sub === 'summary'" :class="{ on: sub === 'summary' }" @click="sub = 'summary'">Résumé</button>
      <button role="tab" :aria-selected="sub === 'history'" :class="{ on: sub === 'history' }" @click="sub = 'history'">Toutes les parties</button>
    </nav>
    <StatsView v-if="sub === 'summary'" />
    <HistoryView v-else />
  </div>
</template>

<style scoped>
.sub { display: flex; gap: 4px; padding: 16px 24px 0; }
.sub button { border: 0; background: transparent; color: var(--muted); padding: 7px 12px; border-radius: var(--radius); cursor: pointer; font-weight: 600; }
.sub button.on { background: var(--panel-2); color: var(--text); }
</style>
