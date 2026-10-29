<script setup lang="ts">
// Contre leur équipe : ce que leur compo impose, avec les items correspondants.
import { computed } from 'vue';
import { state, championIcon, hideBroken } from '../store';

const ct = computed(() => (state.value?.counters?.enemies.length ? state.value.counters : null));
</script>

<template>
  <section v-if="ct" class="counters">
    <header>
      <h2>Contre leur équipe</h2>
      <div class="enemies">
        <span v-for="e in ct.enemies" :key="e.id" class="enemy" :title="e.name">
          <img @error="hideBroken" :src="championIcon(e.id)" width="26" height="26" class="icon" alt="" />
          <span v-if="e.fed" class="fed num">{{ e.fed }}</span>
        </span>
      </div>
    </header>
    <p v-if="!ct.threats.length" class="calm">Rien de particulier en face : suis le build.</p>
    <div v-for="t in ct.threats" :key="t.key" class="threat">
      <div>
        <div class="tname">{{ t.title }}</div>
        <div class="why">{{ t.why }}</div>
      </div>
      <div class="items">
        <img @error="hideBroken" v-for="it in t.items.slice(0, 3)" :key="it.id" :src="it.icon ?? ''" :title="it.name" width="30" height="30" class="ic" alt="" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.counters { display: flex; flex-direction: column; gap: 8px; }
header { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
h2 { font-size: 15px; }
.enemies { display: flex; gap: 4px; }
.enemy { display: flex; flex-direction: column; align-items: center; }
.fed { font-size: 10px; color: var(--bad); font-weight: 700; }
.calm { margin: 0; font-size: 13px; color: var(--muted); }
.threat { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 10px; border-radius: var(--radius); background: var(--panel); }
.tname { font-weight: 650; }
.why { font-size: 12px; color: var(--muted); }
.items { display: flex; gap: 4px; }
.ic { border-radius: var(--radius); background: var(--panel-2); }
</style>
