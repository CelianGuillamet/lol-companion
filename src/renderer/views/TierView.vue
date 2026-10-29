<script setup lang="ts">
// Tier list : Mayhem (arammeta, tous les champions classés par winrate global) ou Faille par rôle (OP.GG,
// palier OP.GG puis winrate), avec tes propres résultats. S'ouvre sur le mode et le rôle de ta partie en cours.
import { computed, onMounted, ref, watch } from 'vue';
import { tone, state, championIcon, pct, hideBroken } from '../store';
import { explore } from '../explore';
import PageHeader from '../ui/PageHeader.vue';
import Segmented from '../ui/Segmented.vue';
import Notice from '../ui/Notice.vue';

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

const MODES = [
  { value: 'mayhem' as const, label: 'Mayhem', title: 'Winrate global ARAM: Mayhem (arammeta)' },
  { value: 'sr' as const, label: 'Faille', title: 'Classée, par rôle (OP.GG)' },
];
const LANE_OPTS = LANES.map((l) => ({ value: l.id, label: l.label }));
async function open(id: number) {
  await explore(id, mode.value === 'sr' ? lane.value : null);
}
</script>

<template>
  <div class="page wrap">
    <PageHeader title="Préparer" :sub="mode === 'mayhem' ? `Champions classés par winrate Mayhem global (arammeta, patch ${state?.data.patch ?? '?'}, 300 parties minimum). Un clic ouvre la fiche : augments et build.` : 'Champions classés par rôle en classée (OP.GG, patch en cours) : palier puis winrate. Un clic ouvre le build du rôle.'">
      <Segmented v-model="mode" :options="MODES" label="Mode" />
    </PageHeader>
    <div class="filters">
      <Segmented v-if="mode === 'sr'" v-model="lane" :options="LANE_OPTS" label="Rôle" />
      <input v-model="q" class="input search" placeholder="Filtrer par nom…" spellcheck="false" aria-label="Filtrer les champions par nom" />
      <select v-if="mode === 'mayhem'" v-model="tag" class="select" aria-label="Classe">
          <option value="">Tous les rôles</option>
          <option v-for="(label, k) in TAGS" :key="k" :value="k">{{ label }}</option>
        </select>
        <label class="small mine"><input v-model="mineOnly" type="checkbox" /> Déjà joués</label>
      <label v-if="mode === 'mayhem'" class="small mine" title="Ajoute tes propres résultats (3 parties minimum) au winrate global, à moitié"><input v-model="forMe" type="checkbox" /> Avec mes résultats</label>
    </div>

    <template v-if="mode === 'sr'">
      <Notice v-if="!srLoading && !srRows.length" kind="error"><p>Méta OP.GG indisponible (pas de connexion ?). Change de rôle ou reviens dans un instant pour réessayer.</p></Notice>
      <section v-else class="card table" :aria-busy="srLoading">
        <div class="row sr headrow faint small"><span>#</span><span>Champion</span><span>Palier</span><span>Winrate</span><span>Parties</span><span>Dans ce rôle</span></div>
        <div v-if="srLoading && !srRows.length" class="skel" aria-hidden="true"><span v-for="i in 8" :key="i" class="skeleton" /></div>
        <button v-for="r in srList" :key="r.id" class="row sr" @click="open(r.id)">
          <span class="num faint">{{ r.rank }}</span>
          <span class="who"><img @error="hideBroken" :src="championIcon(r.id)" width="24" height="24" class="icon" alt="" />{{ r.name }}</span>
          <span class="tier" :class="`t${r.letter}`" :title="`Palier OP.GG ${r.tier ?? '?'}`">{{ r.letter }}</span>
          <span class="num">{{ pct(r.winrate, 0) }}</span>
          <span class="num faint">{{ r.games.toLocaleString('fr-FR') }}</span>
          <span class="num faint">{{ pct(r.roleRate, 0) }}</span>
        </button>
        <div v-if="!srLoading && !srList.length" class="faint small pad">Aucun champion pour ces filtres.</div>
      </section>
    </template>

    <Notice v-if="mode === 'mayhem' && !rows.length" kind="empty"><p>Stats Mayhem en cours de chargement ou indisponibles (arammeta).</p></Notice>
    <section v-else-if="mode === 'mayhem'" class="card table">
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
.wrap { max-width: 960px; }
.filters { display: flex; gap: var(--sp-2); align-items: center; flex-wrap: wrap; }
.search { width: 180px; }
.mine { display: flex; gap: 6px; align-items: center; color: var(--muted); }
.small { font-size: var(--fs-sm); }
.pad { padding: 12px; }
.table { padding: 4px 0; }
.row { width: 100%; display: grid; grid-template-columns: 40px 1fr 56px 72px 90px 80px; gap: 8px; align-items: center; min-height: 40px; padding: 0 14px; border: 0; border-top: 1px solid var(--border); background: transparent; color: inherit; font: inherit; font-size: var(--fs-md); text-align: left; cursor: pointer; }
.row:hover, .row:focus-visible { background: var(--surface-2); }
.headrow { border-top: 0; cursor: default; min-height: 32px; font-size: var(--fs-xs); }
.headrow:hover { background: transparent; }
.who { display: flex; gap: 10px; align-items: center; }
.tier { font-weight: 800; text-align: center; border-radius: var(--radius); padding: 1px 0; width: 26px; font-size: var(--fs-sm); }
/* Paliers dans la gamme or → cristal → gris : pas de rouge (réservé aux défaites) */
.tS { background: rgba(240, 230, 210, 0.16); color: var(--gold-hi); box-shadow: inset 0 0 0 1px rgba(240, 230, 210, 0.45); }
.tA { background: rgba(200, 170, 110, 0.18); color: var(--gold); }
.tB { background: rgba(10, 200, 185, 0.12); color: #7fe3d8; }
.tC { background: rgba(130, 150, 170, 0.14); color: #a9b6c3; }
.tD { background: rgba(110, 110, 120, 0.14); color: var(--faint); }
.row.sr { grid-template-columns: 40px 1fr 56px 72px 90px 96px; }
.skel { display: flex; flex-direction: column; gap: 8px; padding: 10px 14px; }
.skel span { height: 24px; }
@media (max-width: 760px) { .row, .row.sr { grid-template-columns: 30px 1fr 40px 60px 70px; } .row > :nth-child(6) { display: none; } }
</style>
