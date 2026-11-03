<script setup lang="ts">
import { computed, useId } from 'vue';
import { state, championIcon, hideBroken } from '../store';
import Notice from '../ui/Notice.vue';

defineProps<{ compact?: boolean }>();
const titleId = useId();

const intelligence = computed(() => state.value?.intelligence ?? null);
const connected = computed(() => intelligence.value?.sourceStatus === 'connected');
const recentEvents = computed(() => [...(intelligence.value?.events ?? [])].slice(-8).reverse());
const observedAt = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return '—';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};
</script>

<template>
  <section v-if="intelligence" class="enemy-intelligence card" :class="{ compact }" :aria-labelledby="titleId">
    <header class="enemy-head">
      <div>
        <p class="eyebrow">Live Client · données rapportées</p>
        <h2 :id="titleId">Équipe ennemie</h2>
      </div>
      <span class="sample-time" title="Temps de partie reçu avec la dernière observation, sans extrapolation">
        {{ observedAt(intelligence.gameTime) }}
      </span>
    </header>

    <Notice v-if="!connected" kind="warn">
      Source {{ intelligence.sourceStatus === 'invalid' ? 'inexploitable' : 'indisponible' }}.
      Les observations précédentes ne décrivent pas l’état actuel de la partie.
    </Notice>
    <p class="limits">
      Positions hors vision et détection des lancements : <strong>non opérationnelles</strong>.
      Un sort équipé ne renseigne pas sa disponibilité.
    </p>

    <Notice v-if="!intelligence.enemies.length" kind="empty">
      Équipe adverse non identifiée dans les données reçues.
    </Notice>
    <ul v-else class="enemy-list" :class="{ stale: !connected }" aria-label="Observations des champions ennemis">
      <li v-for="enemy in intelligence.enemies" :key="enemy.id" class="enemy-row" :aria-label="`${enemy.championName}, observation ${enemy.freshness === 'stale' ? 'ancienne' : 'reçue'}`">
        <div class="enemy-identity">
          <img v-if="enemy.championId" :src="championIcon(enemy.championId)" @error="hideBroken" class="icon" width="34" height="34" alt="" />
          <div v-else class="portrait-placeholder" aria-hidden="true">?</div>
          <div class="enemy-name">
            <strong>{{ enemy.championName }}</strong>
            <span>{{ enemy.name }}</span>
          </div>
          <span class="reported-state">
            {{ enemy.level === null ? 'Niveau inconnu' : `Niv. ${enemy.level}` }}
            <template v-if="enemy.isDead !== null"> · {{ enemy.isDead ? 'Mort' : 'Vivant' }} rapporté</template>
          </span>
        </div>
        <dl class="position-status">
          <div :title="enemy.position.reason"><dt>X / Y</dt><dd>Inconnus</dd></div>
          <div><dt>Visibilité</dt><dd>Inconnue</dd></div>
          <div><dt>Déplacement</dt><dd>Inconnu</dd></div>
        </dl>
        <ul class="enemy-spells" :aria-label="`Sorts de ${enemy.championName}`">
          <li v-for="spell in enemy.spells" :key="spell.slot" :title="spell.reason">
            <span class="spell-slot">{{ spell.slot }}</span>
            <span v-if="spell.name !== spell.slot" class="spell-name">{{ spell.name }}</span>
            <span class="spell-status">État inconnu</span>
          </li>
        </ul>
        <p class="last-event">
          {{ enemy.freshness === 'stale' ? 'Ancienne observation' : 'Observation reçue' }} à {{ observedAt(enemy.observedGameTime) }} · Live Client
        </p>
        <p v-if="enemy.lastEvent" class="last-event">
          {{ observedAt(enemy.lastEvent.gameTime) }} · {{ enemy.lastEvent.name }} · événement rapporté
        </p>
      </li>
    </ul>

    <details v-if="recentEvents.length" class="event-details">
      <summary>Derniers événements rapportés ({{ intelligence.events.length }})</summary>
      <p>Horodatage du jeu · visibilité au moment de l’événement inconnue.</p>
      <ol>
        <li v-for="event in recentEvents" :key="event.id">
          <time>{{ observedAt(event.gameTime) }}</time> {{ event.name }}
        </li>
      </ol>
    </details>

    <details class="source-details">
      <summary>Provenance et disponibilité</summary>
      <p>Source : Live Client Data API locale · <code>allgamedata</code>.</p>
      <p v-if="intelligence.latencyMs !== null">Dernière requête : {{ Math.round(intelligence.latencyMs) }} ms. Le délai de publication du jeu reste inconnu.</p>
      <ul>
        <li v-for="capability in intelligence.capabilities" :key="capability.id">
          <strong>{{ capability.label }}</strong> :
          {{ capability.status === 'available' ? 'disponible' : capability.status === 'partial' ? 'partiel' : 'indisponible' }}.
          {{ capability.reason }}
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.enemy-intelligence { min-width: 0; padding: 14px; }
.enemy-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; }
.enemy-head .eyebrow { margin: 0 0 3px; }
.enemy-head h2 { margin: 0; font-size: var(--fs-lg); }
.sample-time { color: var(--muted); font-variant-numeric: tabular-nums; }
.limits { margin: 10px 0 12px; font-size: var(--fs-sm); color: var(--muted); line-height: 1.45; }
.limits strong { font-weight: 600; color: var(--text); }
.enemy-list, .enemy-spells { list-style: none; margin: 0; padding: 0; }
.enemy-list.stale { opacity: 0.65; }
.enemy-row { padding: 12px 0; border-top: 1px solid var(--border); }
.enemy-identity { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.enemy-identity img, .portrait-placeholder { flex-shrink: 0; }
.portrait-placeholder { width: 34px; height: 34px; display: grid; place-items: center; color: var(--muted); background: var(--surface-3); }
.enemy-name { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.enemy-name strong { font-size: var(--fs-md); }
.enemy-name span { color: var(--muted); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.reported-state { color: var(--muted); font-size: var(--fs-xs); }
.position-status { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 10px 0; font-size: var(--fs-xs); }
.position-status div { display: flex; gap: 5px; }
.position-status dt { color: var(--muted); }
.position-status dd { margin: 0; }
.enemy-spells { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }
.enemy-spells li { min-width: 0; display: flex; align-items: baseline; gap: 4px; flex-wrap: wrap; padding: 5px 6px; background: var(--surface-2); border: 1px solid var(--border); }
.spell-slot { font-weight: 650; font-size: var(--fs-xs); }
.spell-name { font-size: var(--fs-xs); overflow-wrap: anywhere; min-width: 0; }
.spell-status { flex-basis: 100%; color: var(--muted); font-size: var(--fs-xs); }
.last-event { margin: 8px 0 0; color: var(--muted); font-size: var(--fs-xs); }
.event-details { font-size: var(--fs-xs); color: var(--muted); border-top: 1px solid var(--border); padding: 10px 0; line-height: 1.5; }
.event-details summary { cursor: pointer; min-height: 28px; color: var(--text); }
.event-details p { margin: 0; }
.event-details ol { list-style: none; margin: 5px 0 0; padding: 0; }
.event-details time { display: inline-block; min-width: 42px; font-variant-numeric: tabular-nums; }
.source-details { border-top: 1px solid var(--border); padding-top: 10px; font-size: var(--fs-xs); color: var(--muted); line-height: 1.5; }
.source-details summary { cursor: pointer; min-height: 28px; color: var(--text); }
.source-details p { margin: 4px 0; overflow-wrap: anywhere; }
.source-details ul { padding-left: 16px; margin: 6px 0 0; }
.source-details li + li { margin-top: 6px; }
.compact .position-status, .compact .last-event, .compact .event-details { display: none; }
.compact .enemy-row { padding: 10px 0; }
.compact .enemy-spells { grid-template-columns: repeat(6, minmax(0, 1fr)); margin-top: 7px; }
.compact .enemy-name span { display: none; }
.compact .limits { margin: 6px 0 10px; }
@media (max-width: 560px) {
  .compact .enemy-spells { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 420px) {
  .enemy-intelligence { padding: 12px; }
  .reported-state { flex-basis: 100%; }
}
</style>
