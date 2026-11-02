<script setup lang="ts">
// Revue des choix d'augments d'une partie (core/review.ts). L'icône double la couleur.
import { choiceText, points, roundLabel, type GameReview, type ReviewVerdict } from '../../core/review';

defineProps<{ review: GameReview }>();

const MARK: Record<ReviewVerdict, string> = { best: '✓', close: '≈', costly: '!', unknown: '–' };
const LABEL: Record<ReviewVerdict, string> = { best: 'Bon choix', close: 'Choix proche', costly: 'Choix coûteux', unknown: 'Non noté' };
</script>

<template>
  <section class="review" aria-label="Revue de tes choix d’augments">
    <div class="head">
      <strong>Tes choix d’augments</strong>
      <span v-if="review.analysed" class="num small">{{ review.solid }} solide{{ review.solid > 1 ? 's' : '' }} sur {{ review.analysed }}</span>
      <span v-if="review.lost > 0" class="num small warn">environ {{ points(review.lost) }} pts perdus</span>
    </div>
    <ul>
      <li v-for="(c, i) in review.choices" :key="i">
        <span class="mark" :class="`v-${c.verdict}`" role="img" :aria-label="LABEL[c.verdict]" :title="LABEL[c.verdict]">{{ MARK[c.verdict] }}</span>
        <span class="faint small when">{{ roundLabel(c.round) }}</span>
        <span class="small">{{ choiceText(c) }}</span>
      </li>
    </ul>
    <p class="faint note">
      Estimation d’après les stats globales : ça note la décision, pas le résultat de la partie.
      <template v-if="review.approx"> Refait après coup avec les stats actuelles, sans tenir compte de ton build du moment.</template>
    </p>
  </section>
</template>

<style scoped>
.review { display: flex; flex-direction: column; gap: 6px; font-family: 'Barlow', -apple-system, system-ui, sans-serif; font-size: var(--fs-sm); line-height: 1.4; }
.small { font-size: var(--fs-sm); }
.note { font-size: var(--fs-xs); }
.head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
.warn { color: var(--warn); }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
li { display: grid; grid-template-columns: 18px 68px 1fr; gap: 8px; align-items: baseline; }
.mark { font-weight: 700; text-align: center; }
.v-best { color: var(--ok); }
.v-close { color: var(--info); }
.v-costly { color: var(--warn); }
.v-unknown { color: var(--faint, inherit); opacity: 0.7; }
.when { white-space: nowrap; }
.note { margin: 2px 0 0; }
</style>
