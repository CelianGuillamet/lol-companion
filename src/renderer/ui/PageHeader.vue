<script setup lang="ts">
// En-tête commun des écrans hors partie : titre, une phrase qui dit à quoi sert l'écran, actions à droite.
defineProps<{ title: string; sub?: string | null }>();
</script>

<template>
  <header class="page-head">
    <div>
      <h1>{{ title }}</h1>
      <p v-if="sub" class="sub">{{ sub }}</p>
    </div>
    <div v-if="$slots.default" class="actions"><slot /></div>
  </header>
</template>
