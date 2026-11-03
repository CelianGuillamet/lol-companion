<script setup lang="ts">
// Sorts ennemis : tu tapes le sort quand tu le vois partir, l'app compte le vrai cooldown (patch, niveau, haste des
// objets visibles). Rien ne démarre tout seul. Le décompte tourne ici, localement : pas de re-rendu du reste de la vue.
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { state, championIcon, hideBroken } from '../store';
import type { EnemySpellSlot, EnemySpellTimer } from '../../core/types';

const panel = computed(() => state.value?.enemySpells ?? null);
const enemies = computed(() => panel.value?.enemies ?? []);
const running = computed(() => enemies.value.some((e) => e.spells.some((s) => s.readyAt != null)));

const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
watch(
  running,
  (on) => {
    if (on && !timer) timer = setInterval(() => (now.value = Date.now()), 250);
    if (!on && timer) {
      clearInterval(timer);
      timer = null;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => timer && clearInterval(timer));

const gameNow = computed(() => now.value / 1000 - (panel.value?.clockOffset ?? 0));
const left = (at: number | null) => (at == null ? null : Math.max(0, at - gameNow.value));
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const open = ref<string | null>(null);
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const msg = ref<{ text: string; ok: boolean } | null>(null);
let msgTimer: ReturnType<typeof setTimeout> | null = null;
onBeforeUnmount(() => {
  if (closeTimer) clearTimeout(closeTimer);
  if (msgTimer) clearTimeout(msgTimer);
});

async function act(championId: number, slot: EnemySpellSlot, action: 'cast' | 'clear' | 'shift', delta = 0) {
  const r = await window.api.markEnemySpell(championId, slot, action, delta);
  if (!r.ok || action !== 'cast') {
    msg.value = { text: r.message, ok: r.ok };
    if (msgTimer) clearTimeout(msgTimer);
    msgTimer = setTimeout(() => (msg.value = null), 3500);
  }
  if (action === 'clear') open.value = null;
}

function tap(championId: number, s: EnemySpellTimer) {
  const key = `${championId}:${s.slot}`;
  now.value = Date.now();
  if (s.readyAt != null && (left(s.readyAt) ?? 0) > 0) {
    open.value = open.value === key ? null : key;
    if (closeTimer) clearTimeout(closeTimer);
    closeTimer = setTimeout(() => (open.value = null), 5000);
    return;
  }
  if (s.locked || s.cooldown == null) {
    msg.value = { text: s.locked ? `${s.name} : pas encore débloqué` : `${s.name} : cooldown inconnu, pas de timer`, ok: false };
    return;
  }
  void act(championId, s.slot, 'cast');
}

const RELIAB: Record<string, string> = { calculé: '', approx: '≈', inconnu: '?' };
</script>

<template>
  <section v-if="enemies.length" class="spells" aria-label="Sorts ennemis">
    <header class="top">
      <h2>Sorts ennemis</h2>
      <span class="faint small">Tape un sort quand tu le vois partir</span>
    </header>
    <p v-if="panel?.warning" class="warn small">{{ panel.warning }}</p>

    <ul class="rows">
      <li v-for="e in enemies" :key="e.championId" class="row" :class="{ dead: e.dead }">
        <div class="who">
          <img @error="hideBroken" :src="championIcon(e.championId)" width="30" height="30" alt="" />
          <div class="name">
            <strong>{{ e.championName }}</strong>
            <span class="faint small num">niv. {{ e.level }}<template v-if="e.dead"> · mort</template></span>
          </div>
        </div>
        <div class="cells">
          <div v-for="s in e.spells" :key="s.slot" class="cellwrap">
            <button
              class="cell"
              :class="{ cd: left(s.readyAt), locked: s.locked, unknown: s.reliability === 'inconnu' }"
              :title="`${s.name} — ${s.detail}${s.cooldown != null ? ` · cooldown actuel ${Math.round(s.cooldown)} s` : ''}`"
              :aria-label="`${s.name} de ${e.championName}${left(s.readyAt) ? `, revient dans ${Math.round(left(s.readyAt)!)} secondes` : ''}`"
              @click="tap(e.championId, s)"
            >
              <span class="ico">
                <img v-if="s.icon" @error="hideBroken" :src="s.icon" width="28" height="28" alt="" />
                <span v-else class="slot">{{ s.slot }}</span>
              </span>
              <span class="val num">
                <template v-if="left(s.readyAt)">
                  <strong>{{ clock(left(s.readyAt)!) }}</strong>
                  <span v-if="s.earliest != null && (left(s.readyAt)! - left(s.earliest)!) >= 2" class="faint tiny">dès {{ clock(left(s.earliest)!) }}</span>
                </template>
                <template v-else-if="s.locked"><span class="faint tiny">niv. 6</span></template>
                <template v-else-if="s.cooldown != null">
                  <span class="ready">prêt</span>
                  <span class="faint tiny">{{ Math.round(s.cooldown) }} s{{ RELIAB[s.reliability] ? ` ${RELIAB[s.reliability]}` : '' }}</span>
                </template>
                <template v-else><span class="faint tiny">?</span></template>
              </span>
            </button>
          </div>
        </div>
        <template v-for="s in e.spells" :key="`menu-${s.slot}`">
            <div v-if="open === `${e.championId}:${s.slot}`" class="menu" role="group" :aria-label="`Corriger ${s.name}`">
              <button class="btn ghost" title="Tu l'as signalé en retard" @click="act(e.championId, s.slot, 'shift', -10)">−10 s</button>
              <button class="btn ghost" @click="act(e.championId, s.slot, 'shift', 10)">+10 s</button>
              <button class="btn ghost" @click="act(e.championId, s.slot, 'clear')">Annuler</button>
            </div>
        </template>
      </li>
    </ul>
    <p v-if="msg" class="small" :class="msg.ok ? 'faint' : 'warn'" role="status">{{ msg.text }}</p>
    <p class="faint tiny legend">≈ approximatif (augments, rune ou sort à charges inconnus) · « dès » : plus tôt si une rune cachée · survole un sort pour le détail</p>
  </section>
</template>

<style scoped>
.spells { min-width: 0; container-type: inline-size; background: var(--surface-1); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; }
.top { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; margin-bottom: 6px; }
.top h2 { font-size: var(--fs-md); font-family: var(--display); letter-spacing: 0.04em; margin: 0; }
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.row { display: grid; grid-template-columns: minmax(70px, 1fr) minmax(0, 246px); align-items: center; gap: 6px 10px; }
.row.dead .who { opacity: 0.55; }
.who { display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1; }
.who img { border-radius: 50%; flex: none; }
.name { display: flex; flex-direction: column; min-width: 0; line-height: 1.15; }
.name strong { font-size: var(--fs-sm); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cells { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; min-width: 0; }
.cellwrap { min-width: 0; }
.cell { width: 100%; min-width: 0; min-height: 40px; display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface-2); color: var(--text); font: inherit; cursor: pointer; text-align: left; }
.cell:hover { border-color: var(--gold); }
.cell.cd { border-color: var(--warn, #c9a227); background: var(--surface-3); }
.cell.cd .ico img { filter: grayscale(1) brightness(0.6); }
.cell.locked, .cell.unknown { opacity: 0.55; }
.ico { flex: none; width: 28px; height: 28px; display: grid; place-items: center; }
.ico img { border-radius: 3px; }
.slot { font-weight: 700; color: var(--gold-hi); }
.val { display: flex; flex-direction: column; line-height: 1.1; min-width: 0; }
.val strong { font-size: var(--fs-sm); }
.ready { font-size: 12px; color: var(--good, #4caf50); font-weight: 650; }
.menu { grid-column: 1 / -1; min-width: 0; display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; background: var(--surface-1); border: 1px solid var(--border-strong); border-radius: var(--radius); }
.menu .btn { flex: 1; min-height: 34px; min-width: 0; padding: 0 8px; white-space: nowrap; }
.small { font-size: 12px; }
.tiny { font-size: 11px; }
.val .tiny { white-space: nowrap; }
.warn { color: var(--warn, #c9a227); margin: 4px 0; }
.legend { margin: 8px 0 0; }
@container (max-width: 390px) {
  .row { grid-template-columns: minmax(0, 1fr); }
  .cell { gap: 4px; padding: 4px; }
  .ico, .ico img { width: 22px; height: 22px; }
}
</style>
