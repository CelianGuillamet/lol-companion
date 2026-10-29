<script setup lang="ts">
import { QUEUE_LABEL } from '../../core/modes';
import { computed, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from '../store';
import type { GameDetail, HistoryEntry } from '../../core/types';

const games = ref<HistoryEntry[]>([]);
const loading = ref(true);

async function load() {
  games.value = await window.api.getHistory();
  loading.value = false;
}
// recharge quand une partie est ajoutée ou complétée
watch(() => `${state.value?.stats.total}-${state.value?.log[0]?.at}-${state.value?.connection}-${state.value?.data.patch}`, load, { immediate: true });

const mode = ref<'all' | 'aram' | 'mayhem' | 'sr'>('all');
const result = ref<'all' | 'win' | 'loss'>('all');
const champ = ref<number>(0);
const augment = ref<number>(0);
const augmentsTaken = computed(() => {
  const m = new Map<number, { id: number; name: string; n: number }>();
  for (const g of games.value)
    for (const a of g.augmentIcons) {
      const e = m.get(a.id) ?? { id: a.id, name: a.name, n: 0 };
      e.n++;
      m.set(a.id, e);
    }
  return [...m.values()].filter((a) => a.n >= 2).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
});
const shown = ref(30);
watch([mode, result, champ, augment], () => (shown.value = 30));

const champions = computed(() => {
  const m = new Map<number, { id: number; name: string; n: number }>();
  for (const g of games.value) {
    const e = m.get(g.championId) ?? { id: g.championId, name: g.championName, n: 0 };
    e.n++;
    m.set(g.championId, e);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
});

const filtered = computed(() =>
  games.value.filter(
    (g) =>
      (mode.value === 'all' || g.mode === mode.value) &&
      (result.value === 'all' || g.win === (result.value === 'win')) &&
      (!champ.value || g.championId === champ.value) &&
      (!augment.value || g.augments.includes(augment.value)),
  ),
);

const kpi = computed(() => {
  const list = filtered.value;
  const n = list.length;
  const wins = list.filter((g) => g.win).length;
  const k = list.reduce((s, g) => s + g.kills, 0);
  const d = list.reduce((s, g) => s + g.deaths, 0);
  const a = list.reduce((s, g) => s + g.assists, 0);
  const withDmg = list.filter((g) => g.damage != null && g.durationSec > 0);
  const dpm = withDmg.length ? withDmg.reduce((s, g) => s + (g.damage! * 60) / g.durationSec, 0) / withDmg.length : null;
  const withKp = list.filter((g) => g.teamKills);
  const kp = withKp.length ? withKp.reduce((s, g) => s + Math.min(1, (g.kills + g.assists) / g.teamKills!), 0) / withKp.length : null;
  const dur = n ? list.reduce((s, g) => s + g.durationSec, 0) / n : 0;
  // série en cours (sur la liste filtrée, la plus récente d'abord)
  let streak = 0;
  for (const g of list) {
    if (g.win !== list[0].win) break;
    streak++;
  }
  return { n, wins, kda: n ? { k: k / n, d: d / n, a: a / n, ratio: (k + a) / Math.max(1, d) } : null, dpm, kp, dur, streak, streakWin: list[0]?.win ?? false };
});

const form = computed(() => filtered.value.slice(0, 20).reverse());

// Winrate par semaine (12 dernières semaines avec des parties)
const weeks = computed(() => {
  const m = new Map<number, { start: number; games: number; wins: number }>();
  for (const g of filtered.value) {
    const d = new Date(g.createdAt);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)).getTime();
    const e = m.get(monday) ?? { start: monday, games: 0, wins: 0 };
    e.games++;
    if (g.win) e.wins++;
    m.set(monday, e);
  }
  return [...m.values()].sort((a, b) => a.start - b.start).slice(-12);
});
const maxWeekGames = computed(() => Math.max(1, ...weeks.value.map((w) => w.games)));

// Fatigue / tilt : winrate selon le rang de la partie dans la session (pause de plus de 45 min = nouvelle session)
const sessionRank = computed(() => {
  const list = [...filtered.value].sort((a, b) => a.createdAt - b.createdAt);
  const buckets = [1, 2, 3, 4, 5].map((r) => ({ label: r === 5 ? '5e et +' : `${r}${r === 1 ? 're' : 'e'}`, games: 0, wins: 0 }));
  let rank = 0;
  let lastEnd = 0;
  for (const g of list) {
    rank = g.createdAt - lastEnd > 45 * 60_000 ? 1 : rank + 1;
    lastEnd = g.createdAt + g.durationSec * 1000;
    const b = buckets[Math.min(rank, 5) - 1];
    b.games++;
    if (g.win) b.wins++;
  }
  return buckets.filter((b) => b.games > 0);
});
const weekLabel = (ms: number) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });

// ---------------------------------------------------------------- détail
const open = ref<number | null>(null);
const details = ref<Record<number, GameDetail | null | 'loading'>>({});

async function toggle(g: HistoryEntry) {
  open.value = open.value === g.gameId ? null : g.gameId;
  if (open.value && !(g.gameId in details.value)) {
    details.value[g.gameId] = 'loading';
    details.value[g.gameId] = await window.api.gameDetail(g.gameId);
  }
}

const fmtK = (x: number) => (x >= 1000 ? `${(x / 1000).toFixed(1).replace('.', ',')} k` : String(Math.round(x)));
const dur = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const when = (ms: number) => {
  const d = new Date(ms);
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (days < 1 && new Date().getDate() === d.getDate()) return `aujourd’hui ${hm}`;
  if (days < 2) return `hier ${hm}`;
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }) + ` ${hm}`;
};
const one = (x: number) => x.toFixed(1).replace('.', ',');
const MULTI: Record<number, string> = { 2: 'Double', 3: 'Triple', 4: 'Quadra', 5: 'Penta' };
const maxDamage = (d: GameDetail) => Math.max(1, ...d.teams.flatMap((t) => t.players.map((p) => p.damage)));
</script>

<template>
  <div class="wrap">
    <div class="head">
      <h1>Historique</h1>
      <div class="filters">
        <div class="seg">
          <button v-for="m in (['all', 'aram', 'mayhem', 'sr'] as const)" :key="m" :class="{ on: mode === m }" @click="mode = m">
            {{ m === 'all' ? 'Tout' : m === 'aram' ? 'ARAM' : m === 'sr' ? 'Faille' : 'Mayhem' }}
          </button>
        </div>
        <div class="seg">
          <button v-for="r in (['all', 'win', 'loss'] as const)" :key="r" :class="{ on: result === r }" @click="result = r">
            {{ r === 'all' ? 'Tous' : r === 'win' ? 'Victoires' : 'Défaites' }}
          </button>
        </div>
        <select v-model.number="champ" class="select">
          <option :value="0">Tous les champions</option>
          <option v-for="c in champions" :key="c.id" :value="c.id">{{ c.name }} ({{ c.n }})</option>
        </select>
        <select v-if="augmentsTaken.length" v-model.number="augment" class="select">
          <option :value="0">Tous les augments</option>
          <option v-for="a in augmentsTaken" :key="a.id" :value="a.id">{{ a.name }} ({{ a.n }})</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="faint">Chargement…</div>
    <div v-else-if="!games.length" class="empty slim">
      <h2>Aucune partie enregistrée</h2>
      <p>Tes parties ARAM et Mayhem sont importées depuis le client à la connexion, puis enregistrées à chaque fin de partie.</p>
    </div>

    <template v-else>
      <div class="kpis">
        <div class="kpi card">
          <div class="faint small">Winrate</div>
          <div class="big num" :class="kpi.n ? (kpi.wins / kpi.n >= 0.5 ? 'good' : 'bad') : ''">{{ pct(kpi.n ? kpi.wins / kpi.n : null) }}</div>
          <div class="faint small num">{{ kpi.wins }}V {{ kpi.n - kpi.wins }}D</div>
        </div>
        <div class="kpi card">
          <div class="faint small">KDA moyen</div>
          <div class="big num">{{ kpi.kda ? one(kpi.kda.ratio) : '—' }}</div>
          <div v-if="kpi.kda" class="faint small num">{{ one(kpi.kda.k) }} / {{ one(kpi.kda.d) }} / {{ one(kpi.kda.a) }}</div>
        </div>
        <div class="kpi card">
          <div class="faint small">Dégâts / min</div>
          <div class="big num">{{ kpi.dpm != null ? Math.round(kpi.dpm).toLocaleString('fr-FR') : '—' }}</div>
          <div class="faint small">aux champions</div>
        </div>
        <div class="kpi card">
          <div class="faint small">Participation</div>
          <div class="big num">{{ pct(kpi.kp, 0) }}</div>
          <div class="faint small">aux kills de l’équipe</div>
        </div>
        <div class="kpi card">
          <div class="faint small">Série en cours</div>
          <div class="big num" :class="kpi.streakWin ? 'good' : 'bad'">{{ kpi.n ? `${kpi.streak} ${kpi.streakWin ? 'V' : 'D'}` : '—' }}</div>
          <div class="faint small">durée moy. {{ kpi.n ? dur(kpi.dur) : '—' }}</div>
        </div>
      </div>

      <div v-if="form.length" class="form">
        <span class="faint small">Forme</span>
        <span v-for="g in form" :key="g.gameId" class="pip" :class="g.win ? 'w' : 'l'" role="img" :aria-label="g.win ? 'victoire' : 'défaite'" :title="`${g.championName} · ${g.win ? 'victoire' : 'défaite'}`" />
      </div>

      <div v-if="filtered.length >= 5" class="trends">
        <section class="card trend">
          <h2>Par semaine</h2>
          <div class="weeks">
            <div v-for="w in weeks" :key="w.start" class="wk" :title="`Semaine du ${weekLabel(w.start)} : ${w.wins}V ${w.games - w.wins}D`">
              <span class="wr num" :class="tone(w.wins, w.games)">{{ Math.round((w.wins / w.games) * 100) }}</span>
              <span class="wbar"><span :style="{ height: `${(w.games / maxWeekGames) * 100}%` }" :class="w.wins / w.games >= 0.5 ? 'up' : 'down'" /></span>
              <span class="faint tiny">{{ weekLabel(w.start) }}</span>
            </div>
          </div>
          <div class="faint small">Hauteur = nombre de parties, chiffre = winrate en %.</div>
        </section>
        <section class="card trend">
          <h2>Selon la partie de la session</h2>
          <div v-for="b in sessionRank" :key="b.label" class="srow">
            <span class="small">{{ b.label }} partie</span>
            <span class="sbar"><span :style="{ width: `${(b.wins / b.games) * 100}%` }" :class="b.wins / b.games >= 0.5 ? 'up' : 'down'" /></span>
            <span class="num small" :class="tone(b.wins, b.games)">{{ pct(b.wins / b.games, 0) }}</span>
            <span class="faint small num">{{ b.games }}</span>
          </div>
          <div class="faint small">Une pause de plus de 45 min démarre une nouvelle session. Si ça chute en fin de session, c’est le moment d’arrêter.</div>
        </section>
      </div>

      <section class="card list">
        <div v-if="!filtered.length" class="faint pad">Aucune partie pour ces filtres.</div>
        <template v-for="g in filtered.slice(0, shown)" :key="g.gameId">
          <button class="game" :class="[g.win ? 'w' : 'l', { open: open === g.gameId }]" @click="toggle(g)">
            <div class="champ">
              <img @error="hideBroken" :src="championIcon(g.championId)" width="40" height="40" class="icon" alt="" />
              <span v-if="g.level" class="lvl">{{ g.level }}</span>
            </div>
            <div class="meta">
              <div class="res">{{ g.win ? 'Victoire' : 'Défaite' }} <span class="faint">· {{ g.mode === 'mayhem' ? 'Mayhem' : g.mode === 'sr' ? (QUEUE_LABEL[g.queueId] ?? 'Faille') : 'ARAM' }}</span><span v-if="g.headliner" class="hl">{{ g.headliner }}</span></div>
              <div class="faint small">{{ when(g.createdAt) }} · {{ dur(g.durationSec) }}</div>
            </div>
            <div class="kda">
              <div class="num"><strong>{{ g.kills }}</strong> / <span class="bad">{{ g.deaths }}</span> / <strong>{{ g.assists }}</strong></div>
              <div class="faint small num">
                {{ one((g.kills + g.assists) / Math.max(1, g.deaths)) }} KDA
                <template v-if="g.teamKills"> · {{ pct(Math.min(1, (g.kills + g.assists) / g.teamKills), 0) }} KP</template>
              </div>
              <div v-if="g.multikill && g.multikill >= 2" class="multi">{{ MULTI[Math.min(5, g.multikill)] }} kill</div>
            </div>
            <div class="items">
              <img @error="hideBroken" v-for="(it, i) in g.itemIcons" :key="i" :src="it.icon ?? ''" :title="it.name" width="26" height="26" class="ic" alt="" />
              <span v-if="!g.itemIcons.length" class="faint small">items non disponibles</span>
            </div>
            <div class="augs">
              <img @error="hideBroken" v-for="a in g.augmentIcons" :key="a.id" :src="a.icon ?? ''" :title="a.name" width="22" height="22" alt="" />
            </div>
            <div class="dmg num">
              <template v-if="g.damage != null">
                <div>{{ fmtK(g.damage) }}</div>
                <div class="faint small">dégâts</div>
              </template>
            </div>
          </button>

          <div v-if="open === g.gameId" class="detail">
            <div v-if="details[g.gameId] === 'loading'" class="faint small pad">Lecture de la partie dans le client…</div>
            <div v-else-if="!details[g.gameId]" class="faint small pad">
              Le client n’a plus le détail de cette partie (il ne garde que les plus récentes, et il doit être ouvert).
              <template v-if="g.augmentIcons.length"> Augments : {{ g.augmentIcons.map((a) => a.name).join(', ') }}.</template>
            </div>
            <template v-else>
              <div v-for="t in (details[g.gameId] as GameDetail).teams" :key="t.teamId" class="team" :class="t.win ? 'w' : 'l'">
                <div class="thead small">
                  <span :class="t.win ? 'good' : 'bad'">{{ t.win ? 'Victoire' : 'Défaite' }}</span>
                  <span class="faint">{{ t.kills }} kills · {{ fmtK(t.gold) }} or</span>
                </div>
                <div v-for="p in t.players" :key="p.name + p.championId" class="p" :class="{ me: p.me }">
                  <img @error="hideBroken" :src="championIcon(p.championId)" width="28" height="28" class="icon" alt="" />
                  <div class="pname">
                    <div>{{ p.championName }}</div>
                    <div class="faint small">{{ p.name }}</div>
                  </div>
                  <div class="paugs">
                    <img @error="hideBroken" v-for="a in p.augments" :key="a.id" :src="a.icon ?? ''" :title="a.name" width="18" height="18" alt="" />
                  </div>
                  <div class="num small">{{ p.kills }}/{{ p.deaths }}/{{ p.assists }}</div>
                  <div class="bar" :title="`${p.damage.toLocaleString('fr-FR')} dégâts · ${p.taken.toLocaleString('fr-FR')} subis · ${p.healed.toLocaleString('fr-FR')} soins`">
                    <span :style="{ width: `${(p.damage / maxDamage(details[g.gameId] as GameDetail)) * 100}%` }" />
                    <em class="num">{{ fmtK(p.damage) }}</em>
                  </div>
                  <div class="pitems">
                    <img @error="hideBroken" v-for="(it, i) in p.items" :key="i" :src="it.icon ?? ''" :title="it.name" width="20" height="20" alt="" />
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>
        <button v-if="filtered.length > shown" class="btn more" @click="shown += 30">Afficher plus ({{ filtered.length - shown }} restantes)</button>
      </section>
    </template>
  </div>
</template>

<style scoped>
.wrap { padding: 22px 24px 30px; display: flex; flex-direction: column; gap: 14px; max-width: 1100px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head h1 { font-size: 22px; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seg { display: flex; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 2px; }
.seg button { border: 0; background: transparent; color: var(--muted); padding: 5px 10px; border-radius: var(--radius); cursor: pointer; font: inherit; font-size: 13px; }
.seg button.on { background: var(--gold-soft); color: var(--gold); }
.select { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 8px; font: inherit; font-size: 13px; }
.small { font-size: 12px; }
.pad { padding: 12px; }
.empty.slim { height: auto; padding: 60px 20px; }
.kpis { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.kpi { padding: 12px 14px; }
.big { font-size: 24px; font-family: var(--display); font-weight: 400; color: var(--gold-hi); margin: 3px 0 1px; }
.form { display: flex; gap: 4px; align-items: center; }
.form .faint { margin-right: 6px; }
.list { padding: 4px 0; }
.game {
  width: 100%; display: grid; grid-template-columns: 40px 150px 130px 1fr auto 60px; gap: 14px; align-items: center;
  padding: 10px 14px; border: 0; border-top: 1px solid var(--line); border-left: 3px solid transparent;
  background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer;
}
.game:first-child { border-top: 0; }
.game:hover, .game.open { background: var(--panel-2); }
.game.w { border-left-color: var(--good); }
.game.l { border-left-color: var(--bad); }
.game.w .res { color: var(--good); }
.game.l .res { color: var(--bad); }
.res { font-weight: 650; font-size: 13px; }
.hl { margin-left: 6px; font-size: 10px; font-weight: 650; color: var(--gold); border: 1px solid rgba(200, 170, 110, 0.4); border-radius: var(--radius); padding: 0 4px; }
.champ { position: relative; }
.lvl { position: absolute; right: -4px; bottom: -4px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--radius); font-size: 10px; padding: 0 4px; }
.kda { font-size: 13px; }
.multi { font-size: 11px; color: var(--gold); font-weight: 650; }
.items { display: flex; gap: 3px; flex-wrap: wrap; }
.ic { border-radius: var(--radius); background: var(--panel-2); }
.augs { display: flex; gap: 3px; }
.augs img { border-radius: var(--radius); }
.dmg { text-align: right; font-size: 13px; }
.detail { padding: 6px 14px 14px 17px; background: var(--panel-2); display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.detail > .pad { grid-column: 1 / -1; }
.team { display: flex; flex-direction: column; gap: 4px; }
.thead { display: flex; justify-content: space-between; font-weight: 650; padding: 4px 2px; border-bottom: 1px solid var(--line); }
.p { display: grid; grid-template-columns: 28px 1fr auto 62px 90px; grid-template-rows: auto auto; gap: 2px 8px; align-items: center; padding: 4px; border-radius: var(--radius); font-size: 13px; }
.p.me { background: var(--gold-soft); }
.p .icon { grid-row: span 2; }
.pname { min-width: 0; }
.pname > div { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.paugs { display: flex; gap: 2px; }
.bar { position: relative; height: 16px; background: var(--panel); border-radius: var(--radius); overflow: hidden; }
.bar span { position: absolute; inset: 0 auto 0 0; background: rgba(214, 90, 90, 0.45); }
.bar em { position: relative; font-style: normal; font-size: 11px; padding-left: 4px; line-height: 16px; }
.pitems { grid-column: 2 / -1; display: flex; gap: 2px; }
.pitems img { border-radius: var(--radius); }
.more { margin: 10px auto; display: block; }
.trends { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; }
.trend { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.trend h2 { font-size: 14px; }
.weeks { display: flex; gap: 6px; align-items: flex-end; height: 120px; }
.wk { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; height: 100%; min-width: 0; }
.wk .wr { font-size: 11px; font-weight: 650; }
.wk .wbar { flex: 1; width: 100%; max-width: 26px; display: flex; align-items: flex-end; background: var(--panel-2); border-radius: var(--radius); overflow: hidden; }
.wk .wbar span { display: block; width: 100%; border-radius: var(--radius) 4px 0 0; }
.up { background: var(--good); }
.down { background: var(--bad); }
.tiny { font-size: 10px; white-space: nowrap; }
.srow { display: grid; grid-template-columns: 90px 1fr 44px 28px; gap: 8px; align-items: center; }
.sbar { height: 10px; background: var(--panel-2); border-radius: var(--radius); overflow: hidden; display: flex; }
.sbar span { height: 100%; }
@media (max-width: 900px) { .trends { grid-template-columns: 1fr; } }
@media (max-width: 900px) {
  .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .detail { grid-template-columns: 1fr; }
  .game { grid-template-columns: 40px 1fr auto; }
  .items, .augs, .dmg { grid-column: 2 / -1; }
}
</style>
