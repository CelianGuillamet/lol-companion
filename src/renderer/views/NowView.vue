<script setup lang="ts">
// « Maintenant » : un seul écran qui suit la partie (accueil → champ select → en partie → fin de partie).
import { computed } from 'vue';
import { state } from '../store';
import Home from '../Home.vue';
import ChampSelectView from './ChampSelectView.vue';
import InGameView from '../ingame/InGameView.vue';

const moment = computed(() => {
  const s = state.value;
  if (!s) return 'home';
  if (s.champSelect) return 'select';
  if (['InProgress', 'GameStart', 'Reconnect'].includes(s.phase ?? '') && (s.augments || s.build)) return 'game';
  return 'home';
});
</script>

<template>
  <ChampSelectView v-if="moment === 'select'" />
  <InGameView v-else-if="moment === 'game'" />
  <Home v-else />
</template>
