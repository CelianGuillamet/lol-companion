<script setup lang="ts">
// Revue des achats d'une partie (core/buyreview.ts). Une ligne seulement pour ce qui mérite d'être relu.
import { computed } from 'vue';
import { buyText, type BuyReview } from '../../core/buyreview';
import { points } from '../../core/review';

const props = defineProps<{ review: BuyReview }>();
const lines = computed(() => props.review.lines.filter((l) => buyText(l)));
const bySlot = computed(() => props.review.lines.some((l) => l.slot));
</script>

<template>
  <section class="buys" aria-label="Revue de tes achats">
    <div class="head">
      <strong>Tes achats</strong>
      <span class="num small">{{ review.onPlan }} sur {{ review.analysed }} dans le plan</span>
      <span v-if="review.lost > 0" class="num small warn">environ {{ points(review.lost) }} pts perdus</span>
    </div>
    <ul v-if="lines.length">
      <li v-for="l in lines" :key="l.id" class="small">
        <span class="mark" :class="l.verdict === 'costly' ? 'costly' : 'counter'" aria-hidden="true">!</span>
        <span>{{ buyText(l) }}</span>
      </li>
    </ul>
    <p class="faint note">
      Plan = l’item conseillé ou un des suivants. Les winrates ne comparent que des items avec assez de parties.
      <template v-if="bySlot"> Faille : winrates OP.GG comparés au même rang d’item, à partir du 4e.</template>
      <template v-if="review.approx"> Refait après coup avec les stats actuelles : les conseils contre leur équipe ne sont pas reconnus.</template>
    </p>
  </section>
</template>

<style scoped>
.buys { display: flex; flex-direction: column; gap: 6px; font-family: 'Barlow', -apple-system, system-ui, sans-serif; font-size: var(--fs-sm); line-height: 1.4; }
.small { font-size: var(--fs-sm); }
.note { font-size: var(--fs-xs); margin: 2px 0 0; }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.warn { color: var(--warn); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li { display: grid; grid-template-columns: 18px 1fr; gap: 8px; align-items: baseline; }
.mark { font-weight: 700; text-align: center; }
.costly { color: var(--warn); }
.counter { color: var(--info); }
</style>
