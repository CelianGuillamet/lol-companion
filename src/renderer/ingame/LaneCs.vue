<script setup lang="ts">
// Faille : tes CS face à ton vis-à-vis. Une lecture du tableau des scores, pas un conseil. Le signe porte l'info.
import { computed } from 'vue';
import { state } from '../store';

const cs = computed(() => state.value?.laneCs ?? null);
const sign = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
const perMin = computed(() => cs.value?.perMin.toFixed(1).replace('.', ',') ?? '');
</script>

<template>
  <section v-if="cs" class="cs" aria-label="Tes CS face à ton adversaire de lane" title="CS du tableau des scores. Le jeu ne les donne ici que par dizaines : l’écart et le chiffre par minute sont approchés.">
    <span class="lbl">CS</span>
    <strong class="num">{{ cs.mine }}</strong>
    <template v-if="cs.opponent">
      <span class="faint">contre {{ cs.theirs }} · {{ cs.opponent.name }}<template v-if="cs.guessed"> (deviné)</template></span>
      <strong class="num" :class="(cs.gap ?? 0) > 0 ? 'up' : (cs.gap ?? 0) < 0 ? 'down' : ''">{{ sign(cs.gap ?? 0) }}</strong>
    </template>
    <span class="faint end">≈ {{ perMin }}/min</span>
  </section>
</template>

<style scoped>
.cs { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; padding: 8px 12px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); font-size: var(--fs-sm); }
.lbl { color: var(--muted); }
.end { margin-left: auto; }
.up { color: var(--ok); }
.down { color: var(--danger); }
</style>
