<script setup lang="ts">
// Prochain achat : ce qu'il faut acheter maintenant (tu es mort, le shop est ouvert).
import { computed } from 'vue';
import { state, hideBroken } from '../store';

const nb = computed(() => (state.value?.nextBuy?.rows.length ? state.value.nextBuy : null));
const fmt = (n: number) => n.toLocaleString('fr-FR');
</script>

<template>
  <section v-if="nb" class="buy">
    <header>
      <h2>Acheter maintenant</h2>
      <span class="gold num wide">{{ fmt(nb.gold) }} or</span>
    </header>
    <ol>
      <li v-for="(r, i) in nb.rows" :key="r.item.id" :class="{ first: i === 0 }">
        <img @error="hideBroken" :src="r.item.icon ?? ''" :width="i === 0 ? 48 : 36" :height="i === 0 ? 48 : 36" class="ic" alt="" />
        <div class="what">
          <div class="name">{{ r.item.name }}</div>
          <div class="why">{{ r.why }}</div>
          <div v-if="r.step" class="step">
            <img @error="hideBroken" :src="r.step.item.icon ?? ''" width="20" height="20" class="ic" alt="" />
            En attendant : {{ r.step.item.name }} ({{ fmt(r.step.price) }})
          </div>
        </div>
        <div v-if="r.price != null" class="price num">
          <div>{{ fmt(r.price) }}</div>
          <div :class="r.missing ? 'bad' : 'good'">{{ r.missing ? `−${fmt(r.missing)}` : 'OK' }}</div>
        </div>
      </li>
    </ol>
    <p v-if="nb.buildName" class="foot">Suit le build {{ nb.buildName }}.</p>
  </section>
</template>

<style scoped>
.buy { display: flex; flex-direction: column; gap: 10px; }
header { display: flex; justify-content: space-between; align-items: baseline; }
h2 { font-size: 15px; }
.gold { color: var(--gold); font-weight: 700; font-size: 15px; }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 8px 10px; border-radius: var(--radius); background: var(--panel); }
li.first { background: var(--panel-2); box-shadow: inset 0 0 0 1px rgba(232, 195, 106, 0.35); }
.ic { border-radius: var(--radius); background: var(--panel-2); }
.name { font-weight: 650; }
li.first .name { font-size: 15px; }
.why { font-size: 12px; color: var(--muted); }
.step { display: flex; gap: 6px; align-items: center; font-size: 12px; color: var(--good); margin-top: 3px; }
.price { text-align: right; font-size: 13px; font-weight: 650; }
.foot { margin: 0; font-size: 12px; color: var(--faint); }
</style>
