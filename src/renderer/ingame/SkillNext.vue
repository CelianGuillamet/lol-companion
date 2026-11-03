<script setup lang="ts">
// Le prochain point de sort. Sobre : ce n'est pas LA recommandation, mais une ligne à lire quand tu passes un niveau.
import { computed } from 'vue';
import { state } from '../store';

const sk = computed(() => state.value?.skillNext ?? null);
</script>

<template>
  <section v-if="sk" class="skill" :class="{ pending: sk.pending }" aria-label="Prochain sort à monter">
    <kbd class="key">{{ sk.key }}</kbd>
    <div class="txt">
      <div class="line">
        <span class="lbl">{{ sk.pending ? 'Point à mettre' : 'Prochain point' }}</span>
        <strong v-if="sk.name">{{ sk.name }}</strong>
        <span class="faint num">rang {{ sk.rank }}</span>
      </div>
      <div class="faint small">
        Monte <template v-for="(k, i) in sk.max" :key="i">{{ i ? ' › ' : '' }}{{ k }}</template>
        <template v-if="sk.source"> · {{ sk.source }}</template>
      </div>
    </div>
  </section>
</template>

<style scoped>
.skill { display: flex; gap: 12px; align-items: center; padding: 8px 12px; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); }
.skill.pending { border-color: var(--gold); }
.key { flex: none; width: 34px; height: 34px; display: grid; place-items: center; font-size: 17px; font-weight: 700; color: var(--gold-hi); background: var(--surface-2); border: 1px solid var(--border-strong); border-radius: var(--radius); }
.txt { min-width: 0; }
.line { display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; font-size: var(--fs-sm); }
.lbl { color: var(--muted); }
.pending .lbl { color: var(--gold-hi); font-weight: 650; }
.small { font-size: 12px; }
</style>
