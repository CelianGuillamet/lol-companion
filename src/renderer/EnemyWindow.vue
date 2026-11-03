<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue';
import EnemyIntelligence from './ingame/EnemyIntelligence.vue';
import Notice from './ui/Notice.vue';
import { state } from './store';

const close = () => window.close();
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented) close();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <main class="enemy-window">
    <header class="window-head">
      <h1>Sorts ennemis</h1>
      <button class="btn" autofocus @click="close">Fermer <kbd>Échap</kbd></button>
    </header>
    <div class="window-body">
      <EnemyIntelligence v-if="state?.intelligence" compact />
      <Notice v-else kind="empty">Aucune observation ennemie disponible. Le panneau se remplit pendant la partie.</Notice>
    </div>
  </main>
</template>

<style scoped>
.enemy-window { height: 100dvh; display: grid; grid-template-rows: auto minmax(0, 1fr); min-width: 0; background: var(--bg); }
.window-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 28px 14px 12px; border-bottom: 1px solid var(--border); -webkit-app-region: drag; }
.window-head h1 { margin: 0; font-size: var(--fs-lg); }
.window-head .btn { flex: none; -webkit-app-region: no-drag; }
.window-head kbd { margin-left: 4px; }
.window-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 12px; }
</style>
