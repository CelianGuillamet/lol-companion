<script setup lang="ts">
// Build fini en Mayhem : la stat permanente passe avant l'élixir. Partagé par la fenêtre, le téléphone et le panneau flottant.
import type { NextBuyPanel } from '../../core/types';
import { hideBroken } from '../store';

defineProps<{ anvil: NonNullable<NextBuyPanel['anvil']> }>();
</script>

<template>
  <div class="anvil" title="Stat permanente au choix, sans place au sac. Riot l'annonce au niveau 9 : si la boutique ne te la montre pas encore, reviens plus tard. Le repère de choix n'est pas une mesure.">
    <img @error="hideBroken" :src="anvil.item.icon ?? ''" width="28" height="28" alt="" />
    <div class="what">
      <div class="label">{{ anvil.buy ? 'Ton or dort' : 'Prochain achat' }}<template v-if="anvil.bought"> · {{ anvil.bought }} prise{{ anvil.bought > 1 ? 's' : '' }}</template></div>
      <div class="name">{{ anvil.item.name }}</div>
      <div class="perk">{{ anvil.pick }}</div>
    </div>
    <div class="num" :class="{ good: anvil.buy }">{{ anvil.buy ? `${anvil.price.toLocaleString('fr-FR')} or` : `manque ${anvil.missing.toLocaleString('fr-FR')} or` }}</div>
  </div>
</template>

<style scoped>
.anvil { display: grid; grid-template-columns: 28px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 6px; margin-top: 6px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface-1); }
.anvil img { border-radius: var(--radius); }
.label { color: var(--gold); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.perk { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-weight: 650; font-variant-numeric: tabular-nums; }
</style>
