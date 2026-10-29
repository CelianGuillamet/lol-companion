<script setup lang="ts">
// Tier list : Mayhem (arammeta, tous les champions classés par winrate global) ou Faille par rôle (OP.GG,
// palier OP.GG puis winrate), avec tes propres résultats. S'ouvre sur le mode et le rôle de ta partie en cours.
import { computed, onMounted, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from '../store';
import { explore } from '../explore';

const rows = ref<{ id: number; name: string; winrate: number | null; games: number; tags: string[] }[]>([]);
type Lane = 'top' | 'jungle' | 'mid' | 'adc' | 'support';
const LANES: { id: Lane; label: string }[] = [
  { id: 'top', label: 'Haut' },
  { id: 'jungle', label: 'Jungle' },
  { id: 'mid', label: 'Milieu' },
  { id: 'adc', label: 'Tireur' },
  { id: 'support', label: 'Support' },
];
const mode = ref<'mayhem' | 'sr'>(state.value?.mode === 'sr' ? 'sr' : 'mayhem');
const lane = ref<Lane>('mid');
const srRows = ref<{ id: number; name: string; winrate: number; games: number; tier: number | null; roleRate: number }[]>([]);
const srLoading = ref(false);
const srCache = new Map<Lane, typeof srRows.value>();
async function loadLane() {
  if (srCache.has(lane.value)) return void (srRows.value = srCache.get(lane.value)!);
  srLoading.value = true;
  const want = lane.value;
  const r = await window.api.laneTier(want);
  if (r.length) srCache.set(want, r);
  if (lane.value === want) srRows.value = r;
  srLoading.value = false;
}
onMounted(async () => {
  rows.value = await window.api.listChampions();
  const cur = await window.api.currentLane();
  if (cur && LANES.some((l) => l.id === cur)) lane.value = cur as Lane;
  if (mode.value === 'sr') await loadLane();
});
watch([mode, lane], () => mode.value === 'sr' && void loadLane());

const q = ref('');
const tag = ref('');
const mineOnly = ref(false);
const forMe = ref(false);
const TAGS: Record<string, string> = { Fighter: 'Combattant', Mage: 'Mage', Marksman: 'Tireur', Tank: 'Tank', Support: 'Support', Assassin: 'Assassin' };
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const mine = computed(() => new Map((state.value?.stats.champions ?? []).map((c) => [c.championId, c])));

// Classement perso : winrate global + ton propre résultat, lissé (5 parties fictives à 50 %) et pondéré à moitié,
// comme dans le score du champ select.
const persoScore = (r: { id: number; winrate: number | null }) => {
  const m = mine.value.get(r.id);
  const adj = m && m.games >= 3 ? ((m.wins + 2.5) / (m.games + 5) - 0.5) * 0.5 : 0;
  return r.winrate! + adj;
};
const ranked = computed(() =>
  rows.value
    .filter((r) => r.winrate != null && r.games >= 300)
    .sort((a, b) => (forMe.value ? persoScore(b) - persoScore(a) : b.winrate! - a.winrate!)),
);
// Paliers par rang : S = 10 % du haut, A = 25 %, B = 30 %, C = 25 %, D = le reste
const tierOf = (i: number, n: number) => {
  const p = i / n;
  return p < 0.1 ? 'S' : p < 0.35 ? 'A' : p < 0.65 ? 'B' : p < 0.9 ? 'C' : 'D';
};
const TIER_LETTER = ['S', 'S', 'A', 'B', 'C', 'D'];
const srList = computed(() => {
  const s = norm(q.value.trim());
  return srRows.value
    .map((r, i) => ({ ...r, rank: i + 1, letter: TIER_LETTER[r.tier ?? 5] ?? 'D', me: mine.value.get(r.id) ?? null }))
    .filter((r) => (!s || norm(r.name).includes(s)) && (!mineOnly.value || r.me));
});
const list = computed(() => {
  const s = norm(q.value.trim());
  const n = ranked.value.length;
  return ranked.value
    .map((r, i) => ({ ...r, rank: i + 1, tier: tierOf(i, n), me: mine.value.get(r.id) ?? null }))
    .filter((r) => (!s || norm(r.name).includes(s)) && (!tag.value || r.tags.includes(tag.value)) && (!mineOnly.value || r.me));
});

async function open(id: number) {
  await explore(id, mode.value === 'sr' ? lane.value : null);
}
</script>

<template>
  <div class="wrap">
    <div class="head">
      <h1>Tier list</h1>
      <div class="seg" role="tablist" aria-label="Mode">
        <button role="tab" :aria-selected="mode === 'mayhem'" :class="{ on: mode === 'mayhem' }" @click="mode = 'mayhem'">Mayhem</button>
        <button role="tab" :aria-selected="mode === 'sr'" :class="{ on: mode === 'sr' }" @click="mode = 'sr'">Faille</button>
      </div>
      <div class="filters">
        <input v-model="q" class="search" placeholder="Chercher…" spellcheck="false" />
        <select v-if="mode === 'mayhem'" v-model="tag" class="select" aria-label="Classe">
          <option value="">Tous les rôles</option>
          <option v-for="(label, k) in TAGS" :key="k" :value="k">{{ label }}</option>
        </select>
        <label class="small mine"><input v-model="mineOnly" type="checkbox" /> Déjà joués</label>
        <label v-if="mode === 'mayhem'" class="small mine" title="Ajoute tes propres résultats (3 parties minimum) au winrate global"><input v-model="forMe" type="checkbox" /> Pour moi</label>
      </div>
    </div>

    <template v-if="mode === 'sr'">
      <div class="seg lanes" role="tablist" aria-label="Rôle">
        <button v-for="l in LANES" :key="l.id" role="tab" :aria-selected="lane === l.id" :class="{ on: lane === l.id }" @click="lane = l.id">{{ l.label }}</button>
      </div>
      <p class="faint small">Classée, patch en cours (OP.GG) : palier OP.GG puis winrate. Champions joués au moins 5 % du temps dans ce rôle. Clique un champion pour son build de rôle.</p>
      <section class="card table" :aria-busy="srLoading">
        <div class="row sr headrow faint small"><span>#</span><span>Champion</span><span>Palier</span><span>Winrate</span><span>Parties</span><span>Dans ce rôle</span></div>
        <div v-if="srLoading && !srRows.length" class="skel" aria-hidden="true"><span v-for="i in 8" :key="i" /></div>
        <button v-for="r in srList" :key="r.id" class="row sr" @click="open(r.id)">
          <span class="num faint">{{ r.rank }}</span>
          <span class="who"><img @error="hideBroken" :src="championIcon(r.id)" width="24" height="24" class="icon" alt="" />{{ r.name }}</span>
          <span class="tier" :class="`t${r.letter}`" :title="`Palier OP.GG ${r.tier ?? '?'}`">{{ r.letter }}</span>
          <span class="num">{{ pct(r.winrate, 0) }}</span>
          <span class="num faint">{{ r.games.toLocaleString('fr-FR') }}</span>
          <span class="num faint">{{ pct(r.roleRate, 0) }}</span>
        </button>
        <div v-if="!srLoading && !srList.length" class="faint small pad">{{ srRows.length ? 'Aucun champion pour ces filtres.' : 'Méta OP.GG indisponible (pas de connexion ?). Réessaie dans un instant.' }}</div>
      </section>
    </template>

    <p v-if="mode === 'mayhem'" class="faint small">Winrate global arammeta (patch {{ state?.data.patch }}, 300 parties minimum). Clique un champion pour voir ses augments et son build.</p>
    <section v-if="mode === 'mayhem'" class="card table">
      <div class="row headrow faint small"><span>#</span><span>Champion</span><span>Palier</span><span>Winrate</span><span>Parties</span><span>Toi</span></div>
      <button v-for="r in list" :key="r.id" class="row" @click="open(r.id)">
        <span class="num faint">{{ r.rank }}</span>
        <span class="who"><img @error="hideBroken" :src="championIcon(r.id)" width="24" height="24" class="icon" alt="" />{{ r.name }}</span>
        <span class="tier" :class="`t${r.tier}`">{{ r.tier }}</span>
        <span class="num">{{ pct(r.winrate) }}</span>
        <span class="num faint">{{ r.games.toLocaleString('fr-FR') }}</span>
        <span class="num small" :class="r.me ? tone(r.me.wins, r.me.games) : 'faint'">{{ r.me ? `${r.me.wins}V ${r.me.games - r.me.wins}D` : '—' }}</span>
      </button>
      <div v-if="!list.length" class="faint small pad">Aucun champion pour ces filtres.</div>
    </section>
  </div>
</template>

<style scoped>
.wrap { padding: 22px 24px 30px; display: flex; flex-direction: column; gap: 12px; max-width: 900px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.head h1 { font-size: 22px; }
.filters { display: flex; gap: 8px; align-items: center; }
.search, .select { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 9px; font: inherit; font-size: 13px; }
.search { width: 160px; }
.mine { display: flex; gap: 5px; align-items: center; }
.small { font-size: 12px; }
.pad { padding: 12px; }
.table { padding: 6px 14px; }
.row { width: 100%; display: grid; grid-template-columns: 34px 1fr 54px 70px 80px 70px; gap: 8px; align-items: center; padding: 6px 0; border: 0; border-top: 1px solid var(--line); background: transparent; color: inherit; font: inherit; font-size: 13px; text-align: left; cursor: pointer; }
.row:hover { background: var(--panel-2); }
.headrow { border-top: 0; cursor: default; }
.headrow:hover { background: transparent; }
.who { display: flex; gap: 8px; align-items: center; }
.tier { font-weight: 800; text-align: center; border-radius: var(--radius); padding: 1px 0; width: 26px; }
/* Paliers dans la gamme or → cristal → gris : pas de rouge (réservé aux défaites) */
.tS { background: rgba(240, 230, 210, 0.16); color: var(--gold-hi); box-shadow: inset 0 0 0 1px rgba(240, 230, 210, 0.45); }
.tA { background: rgba(200, 170, 110, 0.18); color: var(--gold); }
.tB { background: rgba(10, 200, 185, 0.12); color: #7fe3d8; }
.tC { background: rgba(130, 150, 170, 0.14); color: #a9b6c3; }
.tD { background: rgba(110, 110, 120, 0.14); color: var(--faint); }
.seg { display: inline-flex; border: 1px solid var(--rule); }
.seg button { border: 0; background: transparent; color: var(--muted); padding: 6px 14px; font: inherit; font-size: 13px; cursor: pointer; }
.seg button + button { border-left: 1px solid var(--line); }
.seg button.on { background: var(--gold-soft); color: var(--gold-hi); }
.seg button:hover:not(.on) { color: var(--text); }
.lanes { align-self: flex-start; }
.row.sr { grid-template-columns: 34px 1fr 54px 70px 90px 90px; }
.skel { display: flex; flex-direction: column; gap: 8px; padding: 10px 0; }
.skel span { height: 22px; background: linear-gradient(90deg, var(--panel-2), #142636, var(--panel-2)); background-size: 200% 100%; animation: sk 1.2s linear infinite; }
@keyframes sk { to { background-position: -200% 0; } }
</style>
