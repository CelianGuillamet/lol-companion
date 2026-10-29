<script setup lang="ts">
import { computed } from 'vue';
import { tone, state, championIcon, pct, signed, hideBroken } from '../store';
import type { Rarity } from '../../core/types';
import AugmentFinder from '../AugmentFinder.vue';
import ChampionPicker from '../ChampionPicker.vue';
import { explored } from '../explore';

// En partie : ton champion. Sinon : le champion exploré.
const live = computed(() => state.value?.augments ?? null);
const panel = computed(() => (explored.value?.augments && !live.value ? explored.value.augments : live.value));
const isExplore = computed(() => !live.value && !!explored.value?.augments);
const RARITIES: { key: Rarity; label: string }[] = [
  { key: 'kPrismatic', label: 'Prismatique' },
  { key: 'kGold', label: 'Or' },
  { key: 'kSilver', label: 'Argent' },
];
</script>

<template>
  <div v-if="!live" class="bar"><ChampionPicker /><span v-if="isExplore" class="faint small">Exploration hors partie : données Mayhem globales et tes résultats perso.</span></div>
  <div v-if="!panel" class="empty">
    <h2>Pas d’augments à afficher</h2>
    <p>
      En ARAM: Mayhem, les meilleurs augments de ton champion apparaissent ici dès le champ select, et dans un panneau
      par-dessus le jeu pendant la partie (⌘⇧A pour le masquer).
    </p>
  </div>

  <div v-else class="wrap">
    <div class="head">
      <img @error="hideBroken" :src="championIcon(panel.championId)" class="icon" width="52" height="52" alt="" />
      <div>
        <h1>{{ panel.championName }}</h1>
        <div class="muted">
          Winrate Mayhem {{ pct(panel.championWinrate) }} · patch {{ panel.patch }} ·
          <span class="faint">tout le monde reçoit la même rareté à chaque choix</span>
        </div>
      </div>
    </div>

    <div class="cols">
      <section v-for="r in RARITIES" :key="r.key" class="col card" :class="`rarity-${r.key}`">
        <h2>{{ r.label }}</h2>
        <ol>
          <li v-for="a in panel.top[r.key]" :key="a.id">
            <img @error="hideBroken" v-if="a.icon" :src="a.icon" width="30" height="30" class="aug" alt="" />
            <div v-else class="aug" />
            <div class="name">
              <div>{{ a.name }}</div>
              <div class="faint small num">
                {{ a.games.toLocaleString('fr-FR') }} parties
                <span v-if="a.personal && a.personal.games >= 2" class="me" :class="tone(a.personal.wins, a.personal.games)">
                  · toi {{ a.personal.wins }}V/{{ a.personal.games - a.personal.wins }}D
                </span>
              </div>
            </div>
            <div class="wr num">
              <div>{{ pct(a.winrate) }}</div>
              <div class="small" :class="a.lift >= 0 ? 'good' : 'bad'">{{ signed(a.lift * 100) }}</div>
            </div>
          </li>
        </ol>
        <div v-if="panel.avoid[r.key].length" class="avoid">
          <span class="faint small">À éviter :</span>
          <span v-for="a in panel.avoid[r.key]" :key="a.id" class="small bad">{{ a.name }} ({{ pct(a.winrate, 0) }})</span>
        </div>
      </section>
    </div>

    <AugmentFinder :panel="panel" />

    <section v-if="panel.myTraps?.length" class="card items mine">
      <h2>Tes pièges perso <span class="faint small">augments que tu prends souvent et avec lesquels tu perds (tous champions)</span></h2>
      <ul>
        <li v-for="t in panel.myTraps" :key="t.id">
          <span class="trap"><img @error="hideBroken" v-if="t.icon" :src="t.icon" width="22" height="22" class="aug" alt="" />{{ t.name }}</span>
          <span class="num bad">{{ t.wins }}V {{ t.games - t.wins }}D</span>
        </li>
      </ul>
    </section>

    <div v-if="panel.traps?.length || panel.types?.good.length || panel.types?.bad.length" class="extra">
      <section v-if="panel.traps?.length" class="card items">
        <h2>Pièges fréquents <span class="faint small">souvent pris sur {{ panel.championName }}, mais perdants</span></h2>
        <ul>
          <li v-for="t in panel.traps" :key="t.id">
            <span class="trap">
              <img @error="hideBroken" v-if="t.icon" :src="t.icon" width="22" height="22" class="aug" alt="" />
              {{ t.name }}
            </span>
            <span class="num"><span class="bad">{{ pct(t.winrate, 0) }}</span> <span class="faint small">· pris {{ pct(t.pick, 0) }}</span></span>
          </li>
        </ul>
      </section>
      <section v-if="panel.types && (panel.types.good.length || panel.types.bad.length)" class="card items">
        <h2>Types d’augments <span class="faint small">par rapport aux champions proches</span></h2>
        <ul>
          <li v-for="t in panel.types.good" :key="'g' + t.name"><span>{{ t.name }}</span><span class="num good">{{ signed(t.lift * 100) }}</span></li>
          <li v-for="t in panel.types.bad" :key="'b' + t.name"><span>{{ t.name }}</span><span class="num bad">{{ signed(t.lift * 100) }}</span></li>
        </ul>
        <p v-if="panel.types.good.length" class="faint small">Utile quand aucun des 3 augments proposés n’est dans le classement : prends le type qui marche.</p>
      </section>
    </div>

    <section v-if="panel.items.length" class="card items">
      <h2>Items les plus gagnants</h2>
      <ul>
        <li v-for="i in panel.items" :key="i.name">
          <span>{{ i.name }}</span>
          <span class="num muted">{{ pct(i.winrate) }} · {{ i.games.toLocaleString('fr-FR') }} parties</span>
        </li>
      </ul>
    </section>

    <p class="faint small">Source : arammeta.com (licence MIT), parties surtout du serveur taïwanais. Statistiques historiques, pas une garantie.</p>
  </div>
</template>

<style scoped>
.bar { display: flex; gap: 12px; align-items: center; padding: 16px 24px 0; flex-wrap: wrap; }
.wrap { padding: 22px 24px 30px; display: flex; flex-direction: column; gap: 16px; max-width: 1100px; }
.head { display: flex; gap: 14px; align-items: center; }
.head h1 { font-size: 22px; }
.small { font-size: 12px; }
.cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.col { padding: 14px; border-top: 3px solid var(--r); }
.col h2 { font-size: 14px; color: var(--r); margin-bottom: 10px; font-family: var(--display); }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; }
.aug { border-radius: var(--radius); background: var(--panel-2); width: 30px; height: 30px; }
.name { min-width: 0; font-size: 13px; }
.name > div:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wr { text-align: right; font-weight: 600; }
.avoid { margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 6px; }
.me { font-weight: 600; }
.items { padding: 14px 16px; }
.items h2 { font-size: 14px; margin-bottom: 8px; }
.items ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.extra { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.trap { display: flex; gap: 8px; align-items: center; }
.items li { display: flex; justify-content: space-between; grid-template-columns: none; }
</style>
