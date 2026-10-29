<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from '../store';
import { aggregate, recap } from '../insights';
import type { AugmentPanel, HistoryEntry } from '../../core/types';

const games = ref<HistoryEntry[]>([]);
// recharge aussi quand le client et les données arrivent (noms des champions, winrates globaux)
watch(() => `${state.value?.stats.total}-${state.value?.connection}-${state.value?.data.patch}`, async () => (games.value = await window.api.getHistory()), { immediate: true });
// Winrate par headliner (Mayhem 26.21+), sinon « sans headliner identifié »
const headliners = computed(() => {
  const m = new Map<string, { games: number; wins: number }>();
  for (const g of games.value) {
    if (g.mode !== 'mayhem') continue;
    const k = g.headliner ?? '—';
    const e = m.get(k) ?? { games: 0, wins: 0 };
    e.games++;
    if (g.win) e.wins++;
    m.set(k, e);
  }
  return m.size > 1 ? [...m.entries()].sort((a, b) => b[1].games - a[1].games) : [];
});
// Indicateur principal de la discovery (§ 5) : suivre la carte recommandée fait-il gagner ?
const follow = computed(() => {
  const f = state.value?.stats.followReco;
  return f && f.followed.picks + f.ignored.picks > 0 ? { f: f.followed, i: f.ignored } : null;
});
const last = computed(() => (games.value[0] ? recap(games.value[0], games.value) : null));

const selected = ref<number | null>(null);
const champGames = computed(() => games.value.filter((g) => g.championId === selected.value));
const champAugs = computed(() => aggregate(champGames.value, (g) => g.augmentIcons).slice(0, 10));
const champItems = computed(() => aggregate(champGames.value, (g) => g.itemIcons).filter((a) => a.item.icon).slice(0, 10));
const champName = computed(() => champGames.value[0]?.championName ?? '');
const champWins = computed(() => champGames.value.filter((g) => g.win).length);
const champPanel = ref<AugmentPanel | null>(null);
watch(selected, async (id) => (champPanel.value = id ? await window.api.championAugments(id) : null));
/** Winrate global (arammeta) de l'augment sur ce champion. */
const globalWr = (augId: number) => {
  const p = champPanel.value;
  if (!p) return null;
  for (const rows of [...Object.values(p.all ?? {}), ...Object.values(p.top), ...Object.values(p.avoid)]) {
    const r = rows.find((a) => a.id === augId);
    if (r) return r.winrate;
  }
  return null;
};

const st = computed(() => state.value!.stats);
const connected = computed(() => state.value!.connection === 'connected');
const importing = ref(false);
const msg = ref('');

async function exportNow() {
  const r = await window.api.exportHistory();
  msg.value = r.message;
}

async function importNow() {
  importing.value = true;
  const r = await window.api.importHistory();
  msg.value = r.added ? `${r.added} partie(s) ajoutée(s)` : 'Rien de nouveau dans l’historique du client';
  importing.value = false;
}

const wr = (w: number, g: number) => (g ? w / g : null);
const date = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
</script>

<template>
  <div class="wrap">
    <div class="head">
      <h1>Mes stats</h1>
      <div class="right">
        <span class="faint small">{{ msg }}</span>
        <button class="btn" :disabled="!st.total" @click="exportNow">Sauvegarder</button>
        <button class="btn" :disabled="!connected || importing" @click="importNow">
          {{ importing ? 'Import…' : 'Importer depuis le client' }}
        </button>
      </div>
    </div>

    <div v-if="!st.total" class="empty slim">
      <h2>Aucune partie enregistrée</h2>
      <p>L’app récupère tes dernières parties ARAM et Mayhem à la connexion, puis enregistre chaque nouvelle partie (avec tes augments).</p>
    </div>

    <template v-else>
      <div class="kpis">
        <div class="kpi card">
          <div class="faint small">Parties</div>
          <div class="big num">{{ st.total }}</div>
        </div>
        <div v-if="st.byMode.aram.games" class="kpi card">
          <div class="faint small">Winrate ARAM</div>
          <div class="big num">{{ pct(wr(st.byMode.aram.wins, st.byMode.aram.games)) }}</div>
          <div class="faint small num">{{ st.byMode.aram.games }} parties</div>
        </div>
        <div v-if="st.byMode.mayhem.games" class="kpi card">
          <div class="faint small">Winrate Mayhem</div>
          <div class="big num">{{ pct(wr(st.byMode.mayhem.wins, st.byMode.mayhem.games)) }}</div>
          <div class="faint small num">{{ st.byMode.mayhem.games }} parties</div>
        </div>
        <div v-if="follow" class="kpi card" title="Choix d’augments lus à l’écran : winrate de la partie selon que tu as pris la carte recommandée ou une autre">
          <div class="faint small">Reco d’augment suivie</div>
          <div class="big num">{{ follow.f.picks ? pct(follow.f.wins / follow.f.picks, 0) : '—' }} <span class="vs faint">vs {{ follow.i.picks ? pct(follow.i.wins / follow.i.picks, 0) : '—' }}</span></div>
          <div class="faint small num">{{ follow.f.picks }} choix suivis · {{ follow.i.picks }} non suivis</div>
        </div>
      </div>

      <div class="grid">
        <section class="card table">
          <h2>Champions</h2>
          <div class="row headrow faint small"><span>Champion</span><span>Parties</span><span>Winrate</span><span>KDA</span></div>
          <div v-for="c in st.champions.slice(0, 15)" :key="c.championId" class="row click" :class="{ sel: selected === c.championId }" @click="selected = selected === c.championId ? null : c.championId">
            <span class="who"><img @error="hideBroken" :src="championIcon(c.championId)" width="24" height="24" class="icon" alt="" />{{ c.name }}</span>
            <span class="num">{{ c.games }}</span>
            <span class="num" :class="tone(c.wins, c.games)">{{ pct(c.wins / c.games, 0) }}</span>
            <span class="num muted">{{ c.kda.toFixed(1).replace('.', ',') }}</span>
          </div>
        </section>

        <section class="card table">
          <h2>Tes augments (Mayhem)</h2>
          <div v-if="!st.augments.length" class="faint small pad">Pas encore de partie Mayhem enregistrée.</div>
          <template v-else>
            <div class="row headrow faint small aug"><span>Augment</span><span>Pris</span><span>Winrate</span></div>
            <div v-for="a in st.augments.slice(0, 15)" :key="a.id" class="row aug">
              <span>{{ a.name }}</span>
              <span class="num">{{ a.games }}</span>
              <span class="num" :class="tone(a.wins, a.games)">{{ pct(a.wins / a.games, 0) }}</span>
            </div>
          </template>
        </section>
      </div>

      <section v-if="selected && champGames.length" class="card champ">
        <div class="chead">
          <img @error="hideBroken" :src="championIcon(selected)" width="40" height="40" class="icon" alt="" />
          <div>
            <h2>{{ champName }}</h2>
            <div class="faint small">{{ champGames.length }} parties · {{ champWins }}V {{ champGames.length - champWins }}D · {{ pct(champWins / champGames.length, 0) }}</div>
          </div>
          <button class="btn close" @click="selected = null">Fermer</button>
        </div>
        <div class="cgrid">
          <div>
            <h3>Tes augments</h3>
            <div v-if="!champAugs.length" class="faint small">Aucun augment enregistré.</div>
            <div v-for="a in champAugs" :key="a.item.id" class="agg">
              <img @error="hideBroken" v-if="a.item.icon" :src="a.item.icon" width="22" height="22" alt="" />
              <span class="aname">{{ a.item.name }}</span>
              <span class="num faint">{{ a.wins }}V {{ a.games - a.wins }}D</span>
              <span class="num small" :title="'Winrate de tous les joueurs avec cet augment sur ' + champName">{{ globalWr(a.item.id) != null ? `tous ${pct(globalWr(a.item.id), 0)}` : '' }}</span>
            </div>
            <div v-if="champPanel?.top" class="faint small suggest">
              Les plus gagnants ici : {{ [...champPanel.top.kPrismatic.slice(0, 1), ...champPanel.top.kGold.slice(0, 1), ...champPanel.top.kSilver.slice(0, 1)].map((a) => a.name).join(', ') }}
            </div>
          </div>
          <div>
            <h3>Tes items</h3>
            <div v-if="!champItems.length" class="faint small">Items non disponibles pour ces parties.</div>
            <div v-for="a in champItems" :key="a.item.id" class="agg">
              <img @error="hideBroken" :src="a.item.icon ?? ''" width="22" height="22" alt="" />
              <span class="aname">{{ a.item.name }}</span>
              <span class="num faint">{{ a.wins }}V {{ a.games - a.wins }}D</span>
            </div>
          </div>
        </div>
      </section>

      <section v-if="last && last.lines.length" class="card recap">
        <h2>Ta dernière partie <span class="faint small">{{ last.game.championName }} · {{ last.game.win ? 'victoire' : 'défaite' }} · comparée à {{ last.base }} parties</span></h2>
        <div v-for="l in last.lines" :key="l.text" class="small" :class="l.good ? 'good' : 'bad'">{{ l.good ? '▲' : '▼' }} {{ l.text }}</div>
      </section>

      <section v-if="headliners.length" class="card table">
        <h2>Par headliner <span class="faint small">déduit après la partie (marqueur dans tes augments)</span></h2>
        <div v-for="[name, h] in headliners" :key="name" class="row mu">
          <span>{{ name === '—' ? 'Autre headliner ou avant le 26.21' : name }}</span>
          <span class="num faint">{{ h.wins }}V {{ h.games - h.wins }}D</span>
          <span class="num" :class="tone(h.wins, h.games)">{{ pct(h.wins / h.games, 0) }}</span>
        </div>
      </section>

      <div class="grid3">
        <section class="card table">
          <h2>Contre qui tu perds <span class="faint small">ton winrate quand il est en face</span></h2>
          <div v-if="!st.vsEnemies.length" class="faint small pad">Pas encore assez de parties détaillées (4 minimum par champion).</div>
          <div v-for="m in st.vsEnemies.slice(0, 8)" :key="m.championId" class="row mu">
            <span class="who"><img @error="hideBroken" :src="championIcon(m.championId)" width="22" height="22" class="icon" alt="" />{{ m.name }}</span>
            <span class="num faint">{{ m.wins }}V {{ m.games - m.wins }}D</span>
            <span class="num" :class="tone(m.wins, m.games)">{{ pct(m.wins / m.games, 0) }}</span>
          </div>
        </section>
        <section class="card table">
          <h2>Avec qui tu gagnes <span class="faint small">champions alliés</span></h2>
          <div v-if="!st.withAllies.length" class="faint small pad">Pas encore assez de parties détaillées.</div>
          <div v-for="m in st.withAllies.slice(0, 8)" :key="m.championId" class="row mu">
            <span class="who"><img @error="hideBroken" :src="championIcon(m.championId)" width="22" height="22" class="icon" alt="" />{{ m.name }}</span>
            <span class="num faint">{{ m.wins }}V {{ m.games - m.wins }}D</span>
            <span class="num" :class="tone(m.wins, m.games)">{{ pct(m.wins / m.games, 0) }}</span>
          </div>
        </section>
        <section class="card table">
          <h2>Tes duos <span class="faint small">joueurs croisés 2 fois ou plus</span></h2>
          <div v-if="!st.duos.length" class="faint small pad">Aucun coéquipier récurrent pour l’instant.</div>
          <div v-for="d in st.duos.slice(0, 8)" :key="d.name" class="row mu">
            <span class="who duo">
              <span class="dname">{{ d.name }}</span>
              <img @error="hideBroken" v-for="c in d.champions" :key="c" :src="championIcon(c)" width="18" height="18" class="icon" alt="" />
            </span>
            <span class="num faint">{{ d.wins }}V {{ d.games - d.wins }}D</span>
            <span class="num" :class="tone(d.wins, d.games)">{{ pct(d.wins / d.games, 0) }}</span>
          </div>
        </section>
      </div>


    </template>
  </div>
</template>

<style scoped>
.wrap { padding: 22px 24px 30px; display: flex; flex-direction: column; gap: 16px; max-width: 1100px; }
.head { display: flex; justify-content: space-between; align-items: center; }
.head h1 { font-size: 22px; }
.right { display: flex; gap: 12px; align-items: center; }
.small { font-size: 12px; }
.empty.slim { height: auto; padding: 60px 20px; }
.kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
.kpi { padding: 14px 16px; }
.big { font-size: 32px; font-family: var(--display); font-weight: 400; color: var(--gold-hi); margin: 4px 0 2px; }
.grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 12px; }
.table, .recent { padding: 14px 16px; }
h2 { font-size: 14px; margin-bottom: 10px; }
.row { display: grid; grid-template-columns: 1fr 60px 70px 50px; gap: 8px; align-items: center; padding: 5px 0; border-top: 1px solid var(--line); font-size: 13px; }
.row.aug { grid-template-columns: 1fr 50px 70px; }
.click { cursor: pointer; }
.click:hover, .sel { background: var(--panel-2); }
.champ, .recap { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.chead { display: flex; gap: 12px; align-items: center; }
.chead h2 { margin: 0; }
.close { margin-left: auto; }
.cgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.cgrid h3 { font-size: 13px; margin: 0 0 6px; color: var(--muted); }
.suggest { margin-top: 6px; }
.agg { display: grid; grid-template-columns: 22px 1fr auto auto; gap: 8px; align-items: center; padding: 3px 0; font-size: 13px; border-top: 1px solid var(--line); }
.agg img { border-radius: var(--radius); }
.aname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.row.mu { grid-template-columns: 1fr 64px 44px; }
.duo { min-width: 0; gap: 4px; }
.dname { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-right: 4px; }
h2 .small { font-weight: 400; }
@media (max-width: 1000px) { .grid3 { grid-template-columns: 1fr; } }
.headrow { border-top: 0; }
.who { display: flex; gap: 8px; align-items: center; }
.pad { padding: 8px 0; }
.game { display: grid; grid-template-columns: 34px 1fr auto 80px; gap: 12px; align-items: center; padding: 9px 0 9px 10px; border-top: 1px solid var(--line); border-left: 3px solid transparent; }
.game.w { border-left-color: var(--good); }
.game.l { border-left-color: var(--bad); }
.res { text-align: right; font-weight: 600; font-size: 13px; }
.game.w .res { color: var(--good); }
.game.l .res { color: var(--bad); }
.kda { color: var(--muted); font-size: 13px; }
.vs { font-size: 14px; font-weight: 500; }
</style>
