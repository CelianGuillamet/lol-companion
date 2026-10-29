<script setup lang="ts">
// Accueil hors champ select : ta forme, ta dernière partie et tes champions qui gagnent.
import { computed, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from './store';
import { recap } from './insights';
import type { HistoryEntry } from '../core/types';

const games = ref<HistoryEntry[]>([]);
// recharge aussi quand le client et les données arrivent (noms des champions, winrates globaux)
watch(() => `${state.value?.stats.total}-${state.value?.connection}-${state.value?.data.patch}`, async () => (games.value = await window.api.getHistory()), { immediate: true });

const form = computed(() => games.value.slice(0, 10).reverse());
// Session du jour (depuis 6 h du matin, pour garder la soirée qui déborde après minuit sur la même journée)
const today = computed(() => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6).getTime() - (now.getHours() < 6 ? 86_400_000 : 0);
  const l = games.value.filter((g) => g.createdAt >= start);
  return l.length ? { n: l.length, w: l.filter((g) => g.win).length, champs: [...new Set(l.map((g) => g.championId))].slice(0, 8) } : null;
});
const last10 = computed(() => {
  const l = games.value.slice(0, 10);
  return l.length ? l.filter((g) => g.win).length / l.length : null;
});
const last = computed(() => (games.value[0] ? recap(games.value[0], games.value) : null));
const best = computed(() => {
  const m = new Map<number, { id: number; name: string; games: number; wins: number }>();
  for (const g of games.value) {
    const e = m.get(g.championId) ?? { id: g.championId, name: g.championName, games: 0, wins: 0 };
    e.games++;
    if (g.win) e.wins++;
    m.set(g.championId, e);
  }
  const base = games.value.length ? games.value.filter((g) => g.win).length / games.value.length : 0.5;
  return [...m.values()]
    .filter((c) => c.games >= 3)
    .sort((a, b) => (b.wins + 5 * base) / (b.games + 5) - (a.wins + 5 * base) / (a.games + 5))
    .slice(0, 5);
});
// Est-ce que suivre le classement paie ? Ton winrate selon le winrate Mayhem global du champion joué
const follow = computed(() => {
  const withWr = games.value.filter((g) => g.championWr != null);
  const hi = withWr.filter((g) => g.championWr! >= 0.52);
  const lo = withWr.filter((g) => g.championWr! < 0.49);
  if (hi.length < 8 || lo.length < 8) return null;
  const wr = (l: HistoryEntry[]) => l.filter((g) => g.win).length / l.length;
  return { hi: { n: hi.length, wr: wr(hi) }, lo: { n: lo.length, wr: wr(lo) } };
});
const changes = ref<{ championId: number; name: string; at: number; text: string; played: number }[]>([]);
watch(() => `${state.value?.connection}-${state.value?.data.balance}`, async () => (changes.value = (await window.api.balanceChanges()).filter((c) => c.played > 0).slice(0, 6)), { immediate: true });
const phoneOff = computed(() => state.value && !state.value.settings.phone);
</script>

<template>
  <div class="home">
    <div class="intro">
      <h1>Entre deux parties</h1>
      <p>Lance une partie (ARAM, Mayhem, classée, normale, Swiftplay…) : cet écran passe tout seul au champ select, puis en partie.</p>
    </div>

    <div v-if="games.length" class="cards">
      <section class="card box">
        <h3>Ta forme</h3>
        <div class="pips">
          <span v-for="g in form" :key="g.gameId" class="pip" :class="g.win ? 'w' : 'l'" role="img" :aria-label="g.win ? 'victoire' : 'défaite'" :title="`${g.championName} · ${g.win ? 'victoire' : 'défaite'}`" />
        </div>
        <div class="big num" :class="last10 != null ? tone(Math.round(last10 * form.length), form.length) : ''">{{ pct(last10, 0) }}</div>
        <div class="faint small">sur tes {{ Math.min(10, games.length) }} dernières parties</div>
        <div v-if="today" class="small today">
          Aujourd’hui : <strong :class="tone(today.w, today.n)">{{ today.w }}V {{ today.n - today.w }}D</strong>
          <img v-for="c in today.champs" :key="c" @error="hideBroken" :src="championIcon(c)" width="18" height="18" class="icon" alt="" />
        </div>
      </section>

      <section class="card box">
        <h3>Tes champions qui gagnent</h3>
        <div v-if="!best.length" class="faint small">Il faut 3 parties sur un champion.</div>
        <div v-for="c in best" :key="c.id" class="champ">
          <img @error="hideBroken" :src="championIcon(c.id)" width="24" height="24" class="icon" alt="" />
          <span>{{ c.name }}</span>
          <span class="num faint small">{{ c.wins }}V {{ c.games - c.wins }}D</span>
          <span class="num" :class="tone(c.wins, c.games)">{{ pct(c.wins / c.games, 0) }}</span>
        </div>
      </section>

      <section v-if="follow" class="card box">
        <h3>Ce que disent tes parties</h3>
        <div class="small">Champion fort en Mayhem (≥ 52 %) : <strong :class="follow.hi.wr >= 0.5 ? 'good' : 'bad'">{{ pct(follow.hi.wr, 0) }}</strong> de victoires <span class="faint">({{ follow.hi.n }} parties)</span></div>
        <div class="small">Champion faible (&lt; 49 %) : <strong :class="follow.lo.wr >= 0.5 ? 'good' : 'bad'">{{ pct(follow.lo.wr, 0) }}</strong> <span class="faint">({{ follow.lo.n }} parties)</span></div>
        <div v-if="follow.hi.wr - follow.lo.wr >= 0.08" class="faint small">Suivre le classement du champ select te rapporte vraiment.</div>
      </section>

      <section v-if="changes.length" class="card box">
        <h3>Équilibrage modifié sur tes champions</h3>
        <div v-for="c in changes" :key="c.championId" class="change small">
          <img @error="hideBroken" :src="championIcon(c.championId)" width="20" height="20" class="icon" alt="" />
          <span><strong>{{ c.name }}</strong> <span class="faint">{{ c.text }}</span></span>
        </div>
      </section>

      <section v-if="last" class="card box">
        <h3>Ta dernière partie</h3>
        <div class="small">{{ last.game.championName }} · <span :class="last.game.win ? 'good' : 'bad'">{{ last.game.win ? 'victoire' : 'défaite' }}</span> · {{ last.game.kills }}/{{ last.game.deaths }}/{{ last.game.assists }}</div>
        <div v-if="!last.lines.length" class="faint small">Dans ta moyenne.</div>
        <div v-for="l in last.lines" :key="l.text" class="small" :class="l.good ? 'good' : 'bad'">{{ l.good ? '▲' : '▼' }} {{ l.text }}</div>
      </section>
    </div>

    <p v-if="phoneOff" class="faint small tip">
      Un seul écran ? Réglages → « Sur ton téléphone ou ta tablette » affiche les augments et le prochain achat sur ton
      téléphone pendant la partie.
    </p>
  </div>
</template>

<style scoped>
.home { padding: 28px 26px; display: flex; flex-direction: column; gap: 20px; max-width: 1040px; }
.intro h1 { font-size: 30px; }
.intro p { margin: 6px 0 0; color: var(--muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
.box { padding: 16px 18px; display: flex; flex-direction: column; gap: 6px; }
.box h3 { margin: 0 0 4px; }
.pips { display: flex; gap: 4px; }
.big { font-size: 38px; font-family: var(--display); font-weight: 400; line-height: 1.05; }
.small { font-size: 12px; }
.champ { display: grid; grid-template-columns: 24px 1fr auto 44px; gap: 8px; align-items: center; font-size: 13px; }
.tip { margin: 0; }
.today { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin-top: 4px; }
.change { display: grid; grid-template-columns: 20px 1fr; gap: 8px; align-items: start; }
</style>
