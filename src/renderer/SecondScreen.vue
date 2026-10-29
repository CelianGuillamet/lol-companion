<script setup lang="ts">
// Fenêtre « second écran » / téléphone : la vue en partie, rien d'autre.
import InGameView from './ingame/InGameView.vue';
</script>

<template>
  <div class="screen"><InGameView /></div>
</template>

<style scoped>
.screen { height: 100%; background: var(--bg); padding-top: 22px; -webkit-app-region: drag; }
.screen :deep(button), .screen :deep(input), .screen :deep(li) { -webkit-app-region: no-drag; }
@media (max-width: 860px) {
  .screen { padding-top: 0; }
}
</style>
