<script setup lang="ts">
// Accueil hors champ select. Deux questions : « où j'en suis ? » (statut du client, ta session, ta dernière
// partie) puis « qu'est-ce qui marche pour moi ? » (champions, effet du classement, équilibrage).
import { computed, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from './store';
import { recap } from './insights';
import PageHeader from './ui/PageHeader.vue';
import Notice from './ui/Notice.vue';
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
const phoneOff = computed(() => state.value && !state.value.settings.phone && state.value.settings.panelMode === 'window');
const connected = computed(() => state.value?.connection === 'connected');
const sub = computed(() =>
  connected.value
    ? 'Lance une partie (ARAM, Mayhem, classée, normale, Swiftplay…) : cet écran passe tout seul au champ select, puis en partie.'
    : 'Ouvre le client League : l’app suivra ton salon, ton champ select et ta partie.',
);
const importing = ref(false);
const imported = ref<number | null>(null);
async function importNow() {
  importing.value = true;
  imported.value = (await window.api.importHistory()).added;
  importing.value = false;
}
const go = (tab: string) => window.__setTab?.(tab);
// Même chemin que ⌘K (écouté par App.vue)
const openSearch = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
const winsOf = (x: { n: number; wr: number }) => Math.round(x.wr * x.n);
</script>

<template>
  <div class="page home">
    <PageHeader title="Avant la partie" :sub="sub">
      <button class="btn" title="Rechercher un champion (⌘K)" @click="openSearch">Chercher un champion <kbd>⌘K</kbd></button>
      <button class="btn" @click="go('prepare')">Tier list</button>
    </PageHeader>

    <Notice v-if="!games.length" kind="empty">
      <p>Aucune partie enregistrée pour l’instant. Tes parties ARAM, Mayhem et Faille s’ajoutent seules à la fin de chaque partie.</p>
      <p v-if="imported != null" class="faint">{{ imported ? `${imported} partie(s) importée(s).` : 'Rien de nouveau dans l’historique du client.' }}</p>
      <template v-if="connected" #action>
        <button class="btn" :disabled="importing" @click="importNow">{{ importing ? 'Import…' : 'Importer depuis le client' }}</button>
      </template>
    </Notice>

    <div v-else class="grid">
      <div class="col">
        <section class="card box session">
          <div class="eyebrow">Ta session</div>
          <div class="row">
            <div>
              <div class="val num" :class="last10 != null ? tone(Math.round(last10 * form.length), form.length) : ''">{{ pct(last10, 0) }}</div>
              <div class="faint xs">de victoires sur tes {{ form.length }} dernières parties</div>
            </div>
            <div class="pips" aria-label="Dernières parties, de la plus ancienne à la plus récente">
              <span v-for="g in form" :key="g.gameId" class="pip" :class="g.win ? 'w' : 'l'" role="img" :aria-label="g.win ? 'victoire' : 'défaite'" :title="`${g.championName} · ${g.win ? 'victoire' : 'défaite'}`" />
            </div>
          </div>
          <div v-if="today" class="today sm">
            <span>Aujourd’hui</span>
            <strong class="num" :class="tone(today.w, today.n)">{{ today.w }} V · {{ today.n - today.w }} D</strong>
            <span class="champs"><img v-for="c in today.champs" :key="c" @error="hideBroken" :src="championIcon(c)" width="20" height="20" class="icon" alt="" /></span>
          </div>
        </section>

        <section v-if="last" class="card box">
          <div class="eyebrow">Ta dernière partie</div>
          <div class="lastline">
            <img @error="hideBroken" :src="championIcon(last.game.championId)" width="36" height="36" class="icon" alt="" />
            <div>
              <div class="md"><strong>{{ last.game.championName }}</strong> · <span :class="last.game.win ? 'good' : 'bad'">{{ last.game.win ? 'Victoire' : 'Défaite' }}</span></div>
              <div class="faint sm num">{{ last.game.kills }} / {{ last.game.deaths }} / {{ last.game.assists }}</div>
            </div>
          </div>
          <div v-if="!last.lines.length" class="faint sm">Dans ta moyenne sur tous les points comparés.</div>
          <ul v-else class="lines">
            <li v-for="l in last.lines" :key="l.text" class="sm" :class="l.good ? 'good' : 'bad'"><span aria-hidden="true">{{ l.good ? '▲' : '▼' }}</span> {{ l.text }}</li>
          </ul>
          <button class="btn ghost self-start" @click="go('games')">Voir l’historique</button>
        </section>
      </div>

      <div class="col">
        <section class="card box">
          <div class="eyebrow">Tes champions qui gagnent</div>
          <p v-if="!best.length" class="faint sm">Il faut au moins 3 parties sur un champion pour le classer.</p>
          <ul v-else class="champs-list">
            <li v-for="c in best" :key="c.id">
              <img @error="hideBroken" :src="championIcon(c.id)" width="24" height="24" class="icon" alt="" />
              <span>{{ c.name }}</span>
              <span class="num faint xs">{{ c.wins }} V · {{ c.games - c.wins }} D</span>
              <span class="num" :class="tone(c.wins, c.games)">{{ pct(c.wins / c.games, 0) }}</span>
            </li>
          </ul>
          <p class="faint xs">Classés par winrate lissé (5 parties à ton winrate moyen) ; vert ou rouge seulement si l’écart tient sur l’échantillon.</p>
        </section>

        <section v-if="follow" class="card box">
          <div class="eyebrow">Suivre le classement paie-t-il ?</div>
          <div class="cmp">
            <div><span class="faint xs">Champion fort en Mayhem (≥ 52 %)</span><strong class="num" :class="tone(winsOf(follow.hi), follow.hi.n)">{{ pct(follow.hi.wr, 0) }}</strong><span class="faint xs">{{ follow.hi.n }} parties</span></div>
            <div><span class="faint xs">Champion faible (&lt; 49 %)</span><strong class="num" :class="tone(winsOf(follow.lo), follow.lo.n)">{{ pct(follow.lo.wr, 0) }}</strong><span class="faint xs">{{ follow.lo.n }} parties</span></div>
          </div>
          <p v-if="follow.hi.wr - follow.lo.wr >= 0.08" class="sm">Oui : prendre le champion conseillé au champ select te fait gagner plus souvent.</p>
        </section>

        <section v-if="changes.length" class="card box">
          <div class="eyebrow">Équilibrage modifié sur tes champions</div>
          <ul class="changes">
            <li v-for="c in changes" :key="c.championId" class="sm">
              <img @error="hideBroken" :src="championIcon(c.championId)" width="20" height="20" class="icon" alt="" />
              <span><strong>{{ c.name }}</strong> <span class="faint">{{ c.text }}</span></span>
            </li>
          </ul>
        </section>
      </div>
    </div>

    <Notice v-if="phoneOff" kind="info">
      <p>Un seul écran ? Le panneau en jeu peut aussi s’afficher sur ton téléphone (Réglages → téléphone ou tablette).</p>
      <template #action><button class="btn ghost" @click="go('settings')">Réglages</button></template>
    </Notice>
  </div>
</template>

<style scoped>
.home { max-width: 1080px; }
.grid { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--sp-3); align-items: start; }
@media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
.col { display: flex; flex-direction: column; gap: var(--sp-3); }
.box { padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
.session .row { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.val { font-family: var(--display); font-size: 30px; line-height: 1; color: var(--text); }
.pips { display: flex; gap: 4px; }
.today { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding-top: 10px; border-top: 1px solid var(--border); color: var(--muted); }
.today .champs { display: flex; gap: 3px; margin-left: auto; }
.lastline { display: flex; gap: 12px; align-items: center; }
.lines, .champs-list, .changes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.champs-list li { display: grid; grid-template-columns: 24px 1fr auto 44px; gap: 10px; align-items: center; font-size: var(--fs-md); }
.changes li { display: grid; grid-template-columns: 20px 1fr; gap: 8px; align-items: start; }
.cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.cmp > div { display: flex; flex-direction: column; gap: 2px; }
.cmp strong { font-family: var(--display); font-size: 22px; font-weight: 400; }
.self-start { align-self: flex-start; padding-left: 0; }
.xs { font-size: var(--fs-xs); }
.sm { font-size: var(--fs-sm); }
.md { font-size: var(--fs-md); }
p { margin: 0; }
</style>
