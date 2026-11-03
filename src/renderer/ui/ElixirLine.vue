<script setup lang="ts">
// Rien d'autre à acheter : l'or dort, l'élixir de ton build. Partagé par la fenêtre, le téléphone et le panneau flottant.
import { computed } from 'vue';
import type { NextBuyPanel } from '../../core/types';
import { hideBroken } from '../store';

const props = defineProps<{ elixir: NonNullable<NextBuyPanel['elixir']> }>();
const clock = computed(() => {
  const s = props.elixir.left ?? 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
});
</script>

<template>
  <div class="elixir" :title="`${elixir.item.name} : ${elixir.perk}, 3 minutes. Un seul élixir à la fois.`">
    <img @error="hideBroken" :src="elixir.item.icon ?? ''" width="28" height="28" alt="" />
    <div class="what">
      <div class="label">{{ elixir.buy ? (elixir.left ? `Effet encore ${clock} : à racheter` : 'Ton or dort') : `Élixir actif, encore ${clock}` }}</div>
      <div class="name">{{ elixir.item.name }}</div>
      <div class="perk">{{ elixir.perk }}<template v-if="elixir.buy"> · 3 min · sac plein, il se boit à l'achat</template></div>
    </div>
    <div v-if="elixir.buy" class="num good">{{ elixir.price.toLocaleString('fr-FR') }} or</div>
  </div>
</template>

<style scoped>
.elixir { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px; margin-top: 6px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-1); }
.elixir img { border-radius: var(--radius); }
.label { color: var(--gold); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.perk { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
