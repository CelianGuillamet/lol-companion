<script setup lang="ts">
// « Mes parties » : le résumé (que montrent mes résultats ?) et l'historique complet (que s'est-il passé ?).
import { ref } from 'vue';
import StatsView from './StatsView.vue';
import HistoryView from './HistoryView.vue';
import PageHeader from '../ui/PageHeader.vue';
import Segmented from '../ui/Segmented.vue';

const sub = ref<'summary' | 'history'>('summary');
const OPTS = [
  { value: 'summary' as const, label: 'Résumé' },
  { value: 'history' as const, label: 'Toutes les parties' },
];
</script>

<template>
  <div class="page games">
    <PageHeader title="Mes parties" sub="Tes résultats enregistrés sur ce Mac. Stats perso : ARAM et Mayhem ; la Faille a son propre filtre dans l’historique.">
      <Segmented v-model="sub" :options="OPTS" label="Vue" />
    </PageHeader>
    <StatsView v-if="sub === 'summary'" />
    <HistoryView v-else />
  </div>
</template>

<style scoped>
.games { max-width: 1160px; }
</style>
