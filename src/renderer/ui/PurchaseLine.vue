<script setup lang="ts">
import type { Purchase } from '../purchase';
import { hideBroken } from '../store';

defineProps<{ purchase: Purchase }>();
const fmt = (n: number) => n.toLocaleString('fr-FR');
</script>

<template>
  <div class="purchase">
    <div class="label">{{ purchase.canBuy ? 'Acheter maintenant' : purchase.kind === 'saving' ? 'À économiser' : 'Prix à vérifier' }}</div>
    <div class="row" :title="purchase.title">
      <img v-if="purchase.item.icon" @error="hideBroken" :src="purchase.item.icon" width="22" height="22" alt="" />
      <span v-else />
      <span class="name">{{ purchase.item.name }}</span>
      <span class="num" :class="purchase.canBuy ? 'good' : 'faint'">{{ purchase.cost == null ? '—' : `${fmt(purchase.cost)} or` }}</span>
    </div>
    <div v-if="purchase.kind === 'component'" class="detail" :title="purchase.target.name">Pour {{ purchase.target.name }}</div>
    <div v-else-if="purchase.kind === 'saving' && purchase.missing != null" class="detail">Il manque {{ fmt(purchase.missing) }} or.</div>
    <div v-else-if="purchase.kind === 'unknown'" class="detail">Vérifie le coût dans la boutique.</div>
    <div class="detail" :title="purchase.why">{{ purchase.why }}</div>
  </div>
</template>

<style scoped>
.label { color: var(--gold); font-family: var(--display); font-size: 13px; margin-bottom: 3px; }
.row { display: grid; grid-template-columns: 22px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 3px 6px; }
.row img { border-radius: var(--radius); }
.name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.num { font-weight: 650; font-variant-numeric: tabular-nums; }
.detail { font-size: 11px; padding: 0 6px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
