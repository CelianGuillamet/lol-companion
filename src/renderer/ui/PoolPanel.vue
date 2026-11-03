<script setup lang="ts">
// Préparer (Mayhem) : quels champions débloquer. Invisible si tu as tout, si le client est fermé ou sans données.
import { computed, onMounted, ref } from 'vue';
import { championIcon, hideBroken, pct } from '../store';
import { explore } from '../explore';
import type { PoolReport } from '../../core/pool';

const report = ref<PoolReport | null>(null);
const open = ref(false);
onMounted(async () => (report.value = await window.api.poolReport()));
const pts = (x: number) => `+${(x * 100).toFixed(2).replace('.', ',')} pt`;
const show = computed(() => !!report.value?.unlocks.length);
</script>

<template>
  <section v-if="show && report" class="card pool" aria-label="Ta collection">
    <button class="head" :aria-expanded="open" @click="open = !open">
      <span><strong>Champions à débloquer</strong> <span class="faint">· {{ report.owned }} sur {{ report.total }} dans ta collection</span></span>
      <span class="num">{{ pts(report.topGain) }} <span class="faint small">avec les 5 premiers</span></span>
      <span class="faint" aria-hidden="true">{{ open ? '▴' : '▾' }}</span>
    </button>
    <div v-if="open" class="body">
      <p class="faint small">Tes cartes viennent de ta collection, et au banc tu ne peux prendre que ce qui en fait partie. Gain estimé sur ton winrate moyen, d’après les winrates globaux seulement : ni ton équipe, ni tes résultats. Le prix n’est pas lu. 3e carte : environ {{ pct(report.blessing, 0) }} des parties.</p>
      <ul>
        <li v-for="u in report.unlocks" :key="u.id">
          <button class="row" @click="explore(u.id)">
            <img @error="hideBroken" :src="championIcon(u.id)" width="24" height="24" class="icon" alt="" />
            <span class="n">{{ u.name }}<span v-if="u.free" class="faint small"> · gratuit cette semaine</span></span>
            <span class="num">{{ pct(u.winrate) }}</span>
            <span class="num gain">{{ pts(u.gain) }}</span>
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.pool { margin-bottom: var(--sp-3); padding: 0; }
.head { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-wrap: wrap; gap: 4px var(--sp-3); align-items: baseline; justify-content: space-between; width: 100%; padding: 10px 14px; }
.head:focus-visible, .row:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
.head > :first-child { flex: 1; min-width: 200px; }
.small { font-size: var(--fs-sm); }
.body { padding: 0 14px 10px; border-top: 1px solid var(--border); }
.body p { margin: 8px 0; }
ul { list-style: none; margin: 0; padding: 0; }
.row { all: unset; box-sizing: border-box; cursor: pointer; display: grid; grid-template-columns: 24px 1fr auto 72px; gap: var(--sp-2); align-items: center; width: 100%; padding: 4px 0; }
.row:hover .n { color: var(--gold-hi); }
.gain { text-align: right; }
</style>
