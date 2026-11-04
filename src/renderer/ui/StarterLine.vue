<script setup lang="ts">
// Rien d'acheté : par quoi commencer. Le prochain achat vise le build, pas le départ. Partagé par la fenêtre, le téléphone et le panneau flottant.
import type { NextBuyPanel } from '../../core/types';
import { starterText } from '../purchase';
import { hideBroken } from '../store';

defineProps<{ starter: NonNullable<NextBuyPanel['starter']> }>();
</script>

<template>
  <div class="starter" :title="starter.swapped ? 'Swiftplay : Doran n\'existe pas, remplacé par le Gardien. Correspondance par usage, OP.GG ne mesure pas cette file.' : 'Départ le plus joué sur OP.GG.'">
    <div class="icons"><img v-for="(it, i) in starter.items" :key="i" @error="hideBroken" :src="it.icon ?? ''" width="28" height="28" alt="" /></div>
    <div class="what">
      <div class="label">Départ</div>
      <div class="name">{{ starterText(starter.items) }}</div>
      <div v-if="starter.swapped" class="note">Gardien à la place de Doran, absent en Swiftplay</div>
    </div>
  </div>
</template>

<style scoped>
.starter { display: flex; gap: 8px; align-items: center; padding: 6px; margin-top: 6px; border: 1px solid var(--border); border-radius: var(--radius); min-width: 0; }
.icons { display: flex; gap: 2px; flex: none; }
.icons img { border-radius: var(--radius); }
.what { min-width: 0; }
.label { color: var(--gold); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.name { font-weight: 650; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.note { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
