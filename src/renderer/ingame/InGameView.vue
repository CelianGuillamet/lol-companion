<script setup lang="ts">
// En partie : ce qu'il faut décider quand tu es mort, en un coup d'œil.
// Large : augments à gauche, achat + contre-équipe à droite. Étroit (téléphone) : deux onglets.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { state, championIcon, pct, hideBroken, ROUND_LABEL } from '../store';
import AugmentChooser from './AugmentChooser.vue';
import BuyPanel from './BuyPanel.vue';
import BuildView from '../views/BuildView.vue';
import EnemyIntelligence from './EnemyIntelligence.vue';
import EnemyPanelDialog from './EnemyPanelDialog.vue';

const panel = computed(() => state.value?.augments ?? null);
const build = computed(() => state.value?.build ?? null);
const champ = computed(() => panel.value ?? build.value);
const intelligence = computed(() => state.value?.intelligence ?? null);

const mq = window.matchMedia('(max-width: 860px)');
const narrow = ref(mq.matches);
const onMq = () => (narrow.value = mq.matches);
mq.addEventListener('change', onMq);
onBeforeUnmount(() => mq.removeEventListener('change', onMq));
const view = ref<'augs' | 'buy' | 'enemy'>(panel.value ? 'augs' : champ.value ? 'buy' : 'enemy');
const activeView = computed(() => {
  if ((view.value === 'augs' && panel.value) || (view.value === 'buy' && champ.value) || (view.value === 'enemy' && intelligence.value)) return view.value;
  return panel.value ? 'augs' : champ.value ? 'buy' : 'enemy';
});
const showBuild = ref(false);
const headliner = computed(() => state.value?.headliner ?? null);
const enemyPanelOpen = ref(false);
watch(intelligence, (value) => { if (!value) enemyPanelOpen.value = false; });
function onKey(event: KeyboardEvent) {
  if (!intelligence.value || enemyPanelOpen.value || !document.hasFocus() || event.defaultPrevented || event.repeat ||
    event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open], [role="dialog"]')) return;
  const target = event.target instanceof Element ? event.target : document.activeElement;
  if (target?.closest('input, textarea, select, button, a, summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="textbox"], [tabindex]')) return;
  event.preventDefault();
  enemyPanelOpen.value = true;
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <div v-if="!champ && !intelligence" class="waiting">
    <h1>En attente de ta partie</h1>
    <p>Dès que ton champion est connu, ses augments et quoi acheter s’affichent ici.</p>
  </div>

  <div v-else class="ingame">
    <header class="head">
      <img v-if="champ" @error="hideBroken" :src="championIcon(champ.championId)" width="44" height="44" class="icon" alt="" />
      <div class="who">
        <h1>{{ champ?.championName ?? 'En partie' }}</h1>
        <div class="sub">
          <span v-if="state?.augRound" class="round">Choix {{ state.augRound }} · {{ ROUND_LABEL[state.augRound - 1] }}</span>
          <span v-if="panel" class="faint">Winrate Mayhem {{ pct(panel.championWinrate) }}</span>
        </div>
      </div>
      <button v-if="intelligence" class="btn enemy-access" title="Tab dans cette fenêtre · En jeu : ⌘⇧E sur Mac, Ctrl⇧E sur Windows/Linux" aria-haspopup="dialog" :aria-expanded="enemyPanelOpen" @click="enemyPanelOpen = true">Sorts ennemis <kbd>Tab</kbd></button>
      <nav v-if="narrow && (panel || intelligence)" class="tabs" aria-label="Informations en partie">
        <button v-if="panel" :aria-pressed="activeView === 'augs'" :class="{ on: activeView === 'augs' }" @click="view = 'augs'">Augments</button>
        <button v-if="champ" :aria-pressed="activeView === 'buy'" :class="{ on: activeView === 'buy' }" @click="view = 'buy'">Achat</button>
        <button v-if="intelligence" :aria-pressed="activeView === 'enemy'" :class="{ on: activeView === 'enemy' }" @click="view = 'enemy'">Ennemis</button>
      </nav>
    </header>

    <section v-if="headliner" class="headliner" aria-label="Headliner de la partie">
      <div class="hl-name"><span class="faint small">Headliner</span> <strong>{{ headliner.name }}</strong> <span class="faint small">· {{ headliner.source === 'écran' ? 'lu à l’écran' : 'd’après tes cartes' }}</span></div>
      <ul><li v-for="t in headliner.tips" :key="t">{{ t }}</li></ul>
    </section>

    <div class="cols" :class="{ single: !panel }">
      <AugmentChooser v-if="panel && (!narrow || activeView === 'augs')" :panel="panel" class="left" />
      <div v-if="!narrow || activeView !== 'augs' || !panel" class="right">
        <BuyPanel v-if="champ && (!narrow || activeView === 'buy')" :emphasize="!panel || narrow" />
        <EnemyIntelligence v-if="intelligence && (!narrow || activeView === 'enemy')" />
        <div v-if="build && (!narrow || activeView === 'buy')" class="more">
          <button class="btn" :aria-expanded="showBuild" @click="showBuild = !showBuild">{{ showBuild ? 'Masquer le build complet' : 'Voir le build complet' }}</button>
          <BuildView v-if="showBuild" compact no-live />
        </div>
      </div>
    </div>
    <EnemyPanelDialog :open="enemyPanelOpen" @close="enemyPanelOpen = false" />
  </div>
</template>

<style scoped>
.headliner { padding: 8px 18px 9px; border-bottom: 1px solid var(--border); background: var(--surface-1); }
.headliner .hl-name strong { font-family: var(--display); color: var(--gold-hi); letter-spacing: 0.04em; }
.headliner ul { margin: 4px 0 0; padding-left: 18px; color: var(--text); font-size: var(--fs-sm); }
.headliner li + li { margin-top: 2px; }
.headliner .small { font-size: 12px; }
.waiting { height: 100%; display: grid; place-content: center; text-align: center; gap: 6px; padding: 30px; }
.waiting h1 { font-size: 22px; }
.waiting p { margin: 0; color: var(--muted); max-width: 380px; }
.ingame { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.head { display: flex; flex-shrink: 0; gap: 12px; align-items: center; padding: 14px 18px 12px; border-bottom: 1px solid var(--border); background: var(--surface-1); }
.who h1 { font-size: 22px; line-height: 1.1; }
.enemy-access { margin-left: auto; flex: none; -webkit-app-region: no-drag; }
.enemy-access kbd { margin-left: 5px; }
.sub { display: flex; gap: 10px; font-size: 12px; margin-top: 2px; }
.round { color: var(--blue); font-weight: 650; }
.tabs { margin-left: auto; display: flex; border: 1px solid var(--border-strong); border-radius: var(--radius); }
.tabs button { min-height: 36px; border: 0; background: transparent; color: var(--muted); padding: 0 14px; font: inherit; font-weight: 650; cursor: pointer; }
.tabs button + button { border-left: 1px solid var(--border); }
.tabs button.on { background: var(--gold-soft); color: var(--gold-hi); box-shadow: inset 0 -2px 0 var(--gold); }
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(300px, 1fr); gap: 18px; padding: 14px 18px 18px; overflow: auto; }
.cols.single { grid-template-columns: minmax(0, 640px); }
.left { min-height: 0; }
.right { display: flex; flex-direction: column; gap: 18px; }
.more { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
@media (max-width: 860px) {
  .cols { grid-template-columns: 1fr; padding: 12px; }
  .head { padding: 12px; flex-wrap: wrap; }
  .sub { flex-wrap: wrap; gap: 2px 10px; }
  .tabs { width: 100%; margin-left: 0; }
  .tabs button { flex: 1; padding: 9px; }
}
</style>
