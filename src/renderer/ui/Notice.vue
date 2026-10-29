<script setup lang="ts">
// Message d'état : info (ce qui va se passer), warn (limite utile), error (échec), empty (rien à montrer).
// L'icône double la couleur pour que l'état se comprenne sans elle.
defineProps<{ kind?: 'info' | 'warn' | 'error' | 'empty' }>();
const ICON = { info: 'i', warn: '!', error: '×', empty: '–' } as const;
</script>

<template>
  <div class="notice" :class="`n-${kind ?? 'info'}`" :role="kind === 'error' ? 'alert' : 'status'">
    <span class="ico" aria-hidden="true">{{ ICON[kind ?? 'info'] }}</span>
    <div><slot /></div>
    <div v-if="$slots.action" class="act"><slot name="action" /></div>
  </div>
</template>
