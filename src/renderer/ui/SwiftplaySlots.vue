<script setup lang="ts">
// Salon Swiftplay : runes et sorts ne bougent plus une fois la file lancée. Lecture seule, tu changes dans le client.
import type { SwiftplayLobby, SwiftplaySlot } from '../../core/types';
import { starterText } from '../purchase';
import { championIcon, changeLine, CHANGE_TITLE, hideBroken, pct } from '../store';
import Confidence from './Confidence.vue';

defineProps<{ lobby: SwiftplayLobby }>();

const spellNames = (l: { name: string }[]) => l.map((x) => x.name).join(' + ');
function runeLine(s: SwiftplaySlot): string {
  const want = s.keystoneWanted?.name;
  if (s.runes === 'same') return 'comme OP.GG';
  if (s.runes === 'minor') return `même clé de voûte, ${s.runesOff ? `${s.runesOff} rune${s.runesOff > 1 ? 's' : ''} sur 6 diffère${s.runesOff > 1 ? 'nt' : ''}` : 'arbre secondaire différent'}`;
  if (s.runes === 'keystone') return `tu as ${s.keystone?.name ?? '?'}, OP.GG joue ${want ?? '?'}`;
  if (s.runes === 'style') return `autre arbre : tu as ${s.keystone?.name ?? '?'}, OP.GG joue ${want ?? '?'}${s.styleWanted ? ` (${s.styleWanted.name})` : ''}`;
  return 'non comparées';
}
const runesBad = (s: SwiftplaySlot) => s.runes === 'keystone' || s.runes === 'style';
</script>

<template>
  <section class="card box swift">
    <div class="eyebrow">Ton salon {{ lobby.queueLabel }}</div>
    <p class="faint sm">{{ lobby.queued ? 'En file : runes et sorts ne bougent plus. Sors de la file pour les changer.' : 'À régler ici, avant de lancer la file : après, runes et sorts ne bougent plus. Stats de classée.' }}</p>
    <div class="slots">
      <div v-for="s in lobby.slots" :key="`${s.championId}-${s.lane}`" class="slot">
        <div class="head">
          <img @error="hideBroken" :src="championIcon(s.championId)" width="36" height="36" class="icon" alt="" />
          <div>
            <div class="md"><strong>{{ s.name }}</strong><span v-if="s.lane" class="faint"> · {{ s.lane }}{{ s.laneGuessed ? ' (rôle principal)' : '' }}</span></div>
            <div v-if="s.winRate != null" class="sm"><span class="num">{{ pct(s.winRate, 1) }}</span> <span class="faint num">sur {{ s.games.toLocaleString('fr-FR') }}</span> <Confidence :winrate="s.winRate" :games="s.games" compact /></div>
            <div v-else class="faint sm">Pas de stats OP.GG dans ce rôle.</div>
          </div>
        </div>
        <ul class="lines sm">
          <li v-if="s.change" :title="CHANGE_TITLE" class="faint">{{ changeLine(s.change) }}</li>
          <li v-if="s.smiteMissing" class="bad"><strong>Pas de Châtiment</strong> : indispensable en jungle.</li>
          <li v-if="s.fit" :class="{ warn: s.fit.rank == null || s.fit.main }">
            <span class="k">Rôle</span>
            <template v-if="s.fit.rank != null">{{ s.fit.rank }}<sup>e</sup> sur {{ s.fit.of }} ici</template>
            <template v-else>presque jamais joué ici</template>
            <template v-if="s.fit.main"> · surtout {{ s.fit.main.lane }} ({{ pct(s.fit.main.share, 0) }} de ses parties, {{ pct(s.fit.main.winRate, 1) }})</template>
          </li>
          <li v-if="s.fit?.stronger.length"><span class="k">Plus forts ici</span>{{ s.fit.stronger.map((c) => `${c.name} ${pct(c.winRate, 1)}`).join(' · ') }}</li>
          <li v-if="s.mine.games"><span class="k">Toi ici</span>{{ s.mine.wins }} V sur {{ s.mine.games }}</li>
          <li v-if="s.spellsOk != null" :class="{ warn: !s.spellsOk }">
            <span class="k">Sorts</span>
            <template v-if="s.spellsOk">comme OP.GG</template>
            <template v-else>tu as {{ spellNames(s.spells) }}, OP.GG joue {{ spellNames(s.spellsWanted) }}</template>
          </li>
          <li :class="{ warn: runesBad(s) }"><span class="k">Runes</span>{{ runeLine(s) }}</li>
          <li v-if="s.starter.length"><span class="k">Départ</span>{{ starterText(s.starter) }}</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.swift { margin-bottom: var(--sp-4); }
.swift p { margin: var(--sp-1) 0 var(--sp-3); }
.slots { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--sp-4); }
.head { display: flex; gap: var(--sp-3); align-items: center; }
.lines { list-style: none; margin: var(--sp-2) 0 0; padding: 0; display: grid; gap: var(--sp-1); }
.k { color: var(--faint); margin-right: var(--sp-2); }
.warn { color: var(--warn); }
.warn .k { color: inherit; }
.bad { color: var(--danger); }
</style>
