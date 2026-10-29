<script setup lang="ts">
import { computed, ref } from 'vue';
import { tone, state, championIcon, pct, signed, hideBroken } from '../store';
import Home from '../Home.vue';
import SrSelectPanel from './SrSelectPanel.vue';

const cs = computed(() => state.value?.champSelect ?? null);
const busy = ref<number | 'loadout' | null>(null);
const toast = ref<{ ok: boolean; text: string } | null>(null);

const SOURCE_LABEL = { card: 'Carte', bench: 'Banc', current: 'Ton champion', trade: 'Allié · échange' } as const;

async function take(id: number) {
  busy.value = id;
  const r = await window.api.pickChampion(id);
  toast.value = { ok: r.ok, text: r.message };
  busy.value = null;
}

async function loadout() {
  busy.value = 'loadout';
  const r = await window.api.applyLoadout();
  toast.value = { ok: r.ok, text: r.message };
  busy.value = null;
}

const best = computed(() => cs.value?.candidates[0] ?? null);
const current = computed(() => cs.value?.candidates.find((c) => c.source === 'current') ?? null);
const gain = computed(() => (best.value && current.value && best.value.championId !== current.value.championId ? best.value.score - current.value.score : 0));
const cards = computed(() => cs.value?.candidates.filter((c) => c.source === 'card') ?? []);
/** La décision à prendre maintenant, en une phrase. */
const decision = computed(() => {
  const c = cs.value;
  if (!c || !best.value) return null;
  if (c.cardsOpen) {
    const pick = cards.value[0] ?? best.value;
    const other = cards.value[1];
    return {
      kind: 'card' as const,
      champ: pick,
      title: `Prends ${pick.name}`,
      why: other ? `${signed(pick.score - other.score)} pts par rapport à ${other.name}. L’autre carte part sur le banc de ton équipe.` : 'La carte non choisie part sur le banc de ton équipe.',
      action: `Choisir ${pick.name}`,
    };
  }
  if (current.value && best.value.championId !== current.value.championId && gain.value >= 0.5 && best.value.actionable) {
    const trade = best.value.source === 'trade';
    return {
      kind: best.value.source,
      champ: best.value,
      title: trade ? `Échange pour ${best.value.name}` : `Prends ${best.value.name} sur le banc`,
      why: `${signed(gain.value)} pts par rapport à ${current.value.name}.${trade ? ' Ton allié doit accepter.' : ''}`,
      action: trade ? 'Proposer l’échange' : `Prendre ${best.value.name}`,
    };
  }
  if (current.value) return { kind: 'keep' as const, champ: current.value, title: `Garde ${current.value.name}`, why: 'Rien de mieux sur le banc ni chez tes alliés pour l’instant.', action: null };
  return null;
});
const others = computed(() => (cs.value?.candidates ?? []).filter((c) => c.championId !== decision.value?.champ.championId));
const open = ref<number | null>(null);

</script>

<template>
  <Home v-if="!cs" />
  <SrSelectPanel v-else-if="cs.sr" :cs="cs" />

  <div v-else class="wrap">
    <!-- La décision : le seul bloc qui compte quand le chrono tourne -->
    <section v-if="decision" class="decision" :class="[decision.kind, { reco: decision.kind !== 'keep' }]">
      <img @error="hideBroken" :src="championIcon(decision.champ.championId)" width="76" height="76" class="icon portrait" alt="" />
      <div class="dtext">
        <h1>{{ decision.title }}</h1>
        <p>{{ decision.why }}</p>
        <div class="dmeta">
          <span v-for="r in decision.champ.reasons" :key="r.label" class="reason">
            {{ r.label }} <b class="num" :class="r.points > 0 ? 'good' : r.points < 0 ? 'bad' : 'faint'">{{ r.points ? signed(r.points) : '' }}</b>
          </span>
        </div>
      </div>
      <div class="dact">
        <div class="score num wide" :class="decision.champ.score >= 0 ? 'good' : 'bad'">{{ signed(decision.champ.score) }}</div>
        <button v-if="decision.action" class="btn primary big" :disabled="busy !== null" @click="take(decision.champ.championId)">
          {{ busy === decision.champ.championId ? '…' : decision.action }}
        </button>
        <button v-else class="btn big" :disabled="!cs.myChampionId || busy === 'loadout'" @click="loadout">
          {{ busy === 'loadout' ? 'Import…' : 'Importer runes et sorts' }}
        </button>
      </div>
    </section>

    <p v-if="toast" class="toast" :class="toast.ok ? 'good' : 'bad'">{{ toast.text }}</p>

    <!-- Ton équipe en une ligne -->
    <section class="team">
      <div class="allies">
        <img @error="hideBroken" v-for="a in cs.allies" :key="a.championId" :src="championIcon(a.championId)" :title="a.name" class="icon" width="30" height="30" alt="" />
        <span v-if="!cs.allies.length" class="faint">Alliés en attente</span>
      </div>
      <div class="adbar" :title="`Dégâts physiques ${pct(cs.needs.adShare, 0)}`">
        <span class="lbl">AD</span>
        <div class="bar"><div class="ad" :style="{ width: `${cs.needs.adShare * 100}%` }" /></div>
        <span class="lbl">AP</span>
      </div>
      <span v-for="l in cs.needs.lacks" :key="l" class="need">Il manque {{ l }}</span>
      <span v-if="!cs.needs.lacks.length && cs.allies.length" class="faint">Compo équilibrée</span>
      <span v-if="cs.mates?.length" class="mates">
        Déjà joué avec
        <span v-for="m in cs.mates" :key="m.name" class="mate">{{ m.name.split('#')[0] }} <b class="num" :class="tone(m.wins, m.games)">{{ m.wins }}-{{ m.games - m.wins }}</b></span>
      </span>
    </section>

    <!-- Les autres options, repliées -->
    <section v-if="others.length" class="others">
      <h2>Autres options</h2>
      <ol>
        <li v-for="c in others" :key="c.championId" :class="{ mine: c.source === 'current' }">
          <button class="row" :aria-expanded="open === c.championId" @click="open = open === c.championId ? null : c.championId">
            <img @error="hideBroken" :src="championIcon(c.championId)" class="icon" width="40" height="40" alt="" />
            <span class="nm">
              <span class="n">{{ c.name }}</span>
              <span class="src" :class="c.source">{{ SOURCE_LABEL[c.source] }}</span>
              <span v-if="c.balanceChange" class="chg" :title="c.balanceChange">équilibrage modifié</span>
            </span>
            <span class="score num wide" :class="c.score > 0 ? 'good' : c.score < 0 ? 'bad' : ''">{{ signed(c.score) }}</span>
          </button>
          <div v-if="open === c.championId" class="detail">
            <ul>
              <li v-for="r in c.reasons" :key="r.label">
                <span>{{ r.label }}</span>
                <span class="num" :class="r.points > 0 ? 'good' : r.points < 0 ? 'bad' : 'faint'">{{ r.points ? signed(r.points) : '' }}</span>
              </li>
            </ul>
            <div class="facts">
              <span v-if="c.mastery && c.mastery.points >= 1000">Maîtrise {{ c.mastery.level }}, {{ c.mastery.points >= 1e6 ? (c.mastery.points / 1e6).toFixed(1).replace('.', ',') + ' M' : Math.round(c.mastery.points / 1000) + ' k' }} points</span>
              <span v-else-if="c.mastery === null">Jamais joué</span>
              <span v-for="b in c.balance ?? []" :key="b.label" :class="b.good ? 'good' : 'bad'">{{ b.label }}</span>
              <span v-if="c.balanceChange" class="chg">{{ c.balanceChange }}</span>
            </div>
            <button v-if="c.actionable" class="btn" :disabled="busy !== null" @click="take(c.championId)">
              {{ busy === c.championId ? '…' : c.source === 'card' ? `Choisir ${c.name}` : c.source === 'trade' ? 'Proposer l’échange' : `Prendre ${c.name}` }}
            </button>
          </div>
        </li>
      </ol>
    </section>

    <div class="foot">
      <button v-if="decision?.action" class="btn" :disabled="!cs.myChampionId || busy === 'loadout'" @click="loadout">
        {{ busy === 'loadout' ? 'Import…' : 'Importer runes et sorts' }}
      </button>
      <p v-if="cs.dataNote" class="faint small">{{ cs.dataNote }}</p>
      <p class="faint small">Score = points de winrate attendus : winrate Mayhem, synergies avec tes alliés, compo, tes propres résultats.</p>
    </div>
  </div>
</template>

<style scoped>
.wrap { padding: 22px 26px 30px; max-width: 980px; display: flex; flex-direction: column; gap: 18px; }
.small { font-size: 12px; }
.decision {
  position: relative; display: grid; grid-template-columns: 76px 1fr auto; gap: 18px; align-items: center;
  padding: 20px 22px; background: linear-gradient(120deg, rgba(200, 170, 110, 0.13) 0%, #0f1d2a 45%, #0a1520 100%);
}
/* Garder son champion : pas de recommandation, simple filet d'or patiné */
.decision.keep { border: 1px solid transparent; border-image: var(--frame) 1; }
.portrait { border-radius: var(--radius); }
.dtext h1 { font-size: 28px; line-height: 1.05; }
.dtext p { margin: 6px 0 0; color: var(--muted); max-width: 60ch; }
.dmeta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 10px; font-size: 12px; color: var(--muted); }
.dmeta b { font-weight: 700; margin-left: 2px; }
.dact { display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }
.score { font-size: 30px; font-weight: 750; line-height: 1; }
.btn.big { padding: 11px 18px; font-size: 15px; border-radius: var(--radius); }
.toast { margin: -6px 0 0; font-weight: 600; }
.team { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; font-size: 13px; }
.allies { display: flex; gap: 4px; }
.adbar { display: flex; gap: 6px; align-items: center; }
.lbl { font-size: 11px; color: var(--muted); font-weight: 650; }
.bar { width: 110px; height: 6px; border-radius: var(--radius); background: #6f8dff; overflow: hidden; }
.ad { height: 100%; background: #ff9d5c; }
.need { color: var(--gold); font-weight: 600; }
.mates { display: flex; gap: 6px; align-items: center; color: var(--muted); }
.mate { color: var(--text); background: var(--panel); border-radius: var(--radius); padding: 2px 7px; }
.others h2 { font-size: 14px; color: var(--muted); font-weight: 600; margin-bottom: 8px; }
.others ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.others li { border-radius: var(--radius); background: var(--panel); }
.others li.mine { box-shadow: inset 3px 0 0 var(--muted); }
.row { width: 100%; display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center; padding: 8px 12px; border: 0; background: transparent; cursor: pointer; text-align: left; border-radius: var(--radius); }
.row:hover { background: rgba(255, 255, 255, 0.025); }
.nm { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.n { font-weight: 650; font-size: 15px; }
.src { font-size: 12px; color: var(--muted); }
.src.card { color: var(--gold); }
.src.bench { color: var(--blue); }
.src.trade { color: var(--good); }
.chg { font-size: 12px; color: #f0b45a; }
.others .score { font-size: 20px; }
.detail { padding: 0 12px 12px 64px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.detail ul { list-style: none; margin: 0; padding: 0; width: 100%; max-width: 560px; font-size: 13px; color: var(--muted); }
.detail ul li { display: flex; justify-content: space-between; gap: 12px; background: none; padding: 2px 0; }
.facts { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
.foot { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
.foot p { margin: 0; }
@media (max-width: 760px) {
  .decision { grid-template-columns: 56px 1fr; }
  .dact { grid-column: 1 / -1; flex-direction: row; justify-content: space-between; width: 100%; }
}
</style>
