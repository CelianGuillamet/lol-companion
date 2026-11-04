<script setup lang="ts">
// Champ select Faille (classée, normale, Swiftplay, partie rapide…) : ton rôle, ton champion, l'adversaire de
// lane probable et, avant le verrouillage, les counter-picks dont la supériorité est statistiquement établie.
import { computed, ref } from 'vue';
import { state, championIcon, hideBroken, changeLine, CHANGE_TITLE, opggBehind } from '../store';
import BuildView from './BuildView.vue';
import Confidence from '../ui/Confidence.vue';
import LaneGuide from '../ui/LaneGuide.vue';
import Notice from '../ui/Notice.vue';
import type { ChampSelectView, MatchupView } from '../../core/types';

const props = defineProps<{ cs: ChampSelectView }>();
const sr = computed(() => props.cs.sr!);
const busy = ref(false);
const toast = ref<{ ok: boolean; text: string } | null>(null);
const p = (x: number) => `${Math.round(x * 100)} %`;
const fmt = (n: number) => n.toLocaleString('fr-FR');
const VERDICT: Record<MatchupView['verdict'], string> = {
  favorable: 'Matchup favorable',
  défavorable: 'Matchup défavorable : joue safe jusqu’à ton premier item',
  serré: 'Matchup serré',
  incertain: 'Pas assez de parties pour conclure',
};

const points = (g: number) => `+${(g * 100).toFixed(1).replace('.', ',')} pt`;

async function hoverBan(id: number) {
  busy.value = true;
  const r = await window.api.hoverBan(id);
  toast.value = { ok: r.ok, text: r.message };
  busy.value = false;
}

async function loadout() {
  busy.value = true;
  const r = await window.api.applyLoadout();
  toast.value = { ok: r.ok, text: r.message };
  busy.value = false;
}
</script>

<template>
  <div class="page wrap">
    <Notice v-if="opggBehind(state?.data)" kind="warn"><p>Patch tout neuf : ces winrates viennent encore du {{ state?.data.opggPatch }}. Un champion modifié peut être mal classé.</p></Notice>
    <section class="head" :class="{ reco: !!sr.me }">
      <img v-if="sr.me" @error="hideBroken" :src="championIcon(sr.me.id)" width="76" height="76" class="icon portrait" alt="" />
      <div class="txt">
        <div class="faint small">{{ sr.queueLabel }}<template v-if="sr.laneLabel"> · rôle {{ sr.laneLabel }}</template></div>
        <h1>{{ sr.me ? sr.me.name : 'Choisis ton champion' }}</h1>
        <p v-if="sr.me" class="num">
          {{ p(sr.me.winRate) }} de victoires sur {{ fmt(sr.me.games) }} parties
          <Confidence :winrate="sr.me.winRate" :games="sr.me.games" />
          <span v-if="sr.me.tier" class="tier" :title="`Palier OP.GG ${sr.me.tier} (1 = le plus fort)`">palier {{ ['S', 'S', 'A', 'B', 'C', 'D'][sr.me.tier] ?? 'D' }}</span>
        </p>
        <p v-if="sr.me?.change" class="chg" :title="CHANGE_TITLE">{{ changeLine(sr.me.change) }}</p>
        <p v-if="sr.note" class="faint small">{{ sr.note }}</p>
      </div>
      <button class="btn big" :disabled="!cs.myChampionId || busy" @click="loadout">{{ busy ? 'Import…' : 'Importer runes et sorts' }}</button>
    </section>
    <p v-if="toast" class="toast" :class="toast.ok ? 'good' : 'bad'">{{ toast.text }}</p>

    <section v-if="sr.bans" class="card block">
      <h2>Bans conseillés <span class="faint">points de victoire gagnés, estimation prudente</span></h2>
      <ul v-if="sr.bans.options.length" class="cp">
        <li v-for="b in sr.bans.options" :key="b.id" class="ban">
          <img @error="hideBroken" :src="championIcon(b.id)" width="34" height="34" class="icon" alt="" />
          <div>
            <span class="n">{{ b.name }}<span v-if="b.change" class="chg" :title="CHANGE_TITLE">{{ changeLine(b.change) }}</span></span>
            <div class="faint small">
              <template v-if="b.myWinRate != null">{{ p(b.myWinRate) }} pour toi contre lui, en face de toi dans {{ p(b.share) }} des parties</template>
              <template v-else>{{ p(b.winRate) }} en {{ b.laneLabel }}, joué dans {{ p(b.share) }} des parties</template>
            </div>
          </div>
          <span class="num good">{{ points(b.gain) }}</span>
          <span v-if="sr.bans.hovered === b.id" class="small faint">survolé</span>
          <button v-else class="btn ghost" :disabled="!sr.bans.myTurn || busy" @click="hoverBan(b.id)">Survoler</button>
        </li>
      </ul>
      <p v-else class="muted small">Aucun ban ne se détache : un champion fort que ton équipe peut encore prendre ne rapporte rien à bannir.</p>
      <p class="faint small">Comptés : {{ sr.bans.lanes }} rôle{{ sr.bans.lanes > 1 ? 's' : '' }} sur 5, le tien et ceux dont l’allié a montré son champion. Survoler ne valide rien : le ban se confirme dans le client.</p>
    </section>

    <section v-if="sr.matchup" class="card block mu" :class="sr.matchup.verdict">
      <img @error="hideBroken" :src="championIcon(sr.matchup.opponent.id)" width="44" height="44" class="icon" alt="" />
      <div>
        <h2>Contre {{ sr.matchup.opponent.name }} <span v-if="sr.matchup.guessed" class="faint small">(rôle deviné)</span></h2>
        <div v-if="sr.matchup.games" class="num">
          {{ p(sr.matchup.myWinRate) }} sur {{ fmt(sr.matchup.games) }} parties
          <span class="faint">({{ p(sr.matchup.lo) }}–{{ p(sr.matchup.hi) }})</span>
          <Confidence :winrate="sr.matchup.myWinRate" :games="sr.matchup.games" />
        </div>
        <div class="small" :class="sr.matchup.verdict === 'favorable' ? 'good' : sr.matchup.verdict === 'défavorable' ? 'bad' : 'muted'">{{ VERDICT[sr.matchup.verdict] }}</div>
        <div v-if="sr.matchup.opponent.change" class="chg" :title="CHANGE_TITLE">{{ sr.matchup.opponent.name }} {{ changeLine(sr.matchup.opponent.change) }}</div>
        <LaneGuide v-if="sr.matchup.guide" :guide="sr.matchup.guide" :opponent="sr.matchup.opponent.name" />
      </div>
    </section>

    <section v-if="sr.counterPicks.length" class="card block">
      <h2>Counter-picks contre {{ sr.matchup?.opponent.name }} <span class="faint">seulement ceux dont l’avantage est sûr à 95 %</span></h2>
      <ul class="cp">
        <li v-for="c in sr.counterPicks" :key="c.id">
          <img @error="hideBroken" :src="championIcon(c.id)" width="34" height="34" class="icon" alt="" />
          <span class="n">{{ c.name }}<span v-if="c.change" class="chg" :title="CHANGE_TITLE">{{ changeLine(c.change) }}</span></span>
          <span class="num">{{ p(c.winRate) }} <span class="faint small">· {{ fmt(c.games) }}</span></span>
          <span class="small" :class="c.mastery && c.mastery >= 5 ? 'good' : 'faint'">{{ c.mastery ? `maîtrise ${c.mastery}` : 'jamais joué' }}</span>
        </li>
      </ul>
      <p class="faint small">Un counter que tu ne maîtrises pas gagne souvent moins que ton champion habituel.</p>
    </section>

    <section v-if="sr.dangers.length" class="card block">
      <h2>Autres ennemis qui te posent problème</h2>
      <ul class="cp">
        <li v-for="d in sr.dangers" :key="d.id">
          <img @error="hideBroken" :src="championIcon(d.id)" width="30" height="30" class="icon" alt="" />
          <span class="n">{{ d.name }}</span>
          <span class="num bad">{{ p(d.myWinRate) }}</span>
          <span class="faint small">{{ fmt(d.games) }} parties</span>
        </li>
      </ul>
    </section>

    <BuildView v-if="state?.build" compact no-live :panel="state.build" />
  </div>
</template>

<style scoped>
.wrap { max-width: 980px; }
.head { display: grid; grid-template-columns: auto 1fr auto; gap: 16px; align-items: center; padding: 16px 18px; background: linear-gradient(110deg, rgba(200, 170, 110, 0.14), var(--panel-2) 60%); }
.head p { margin: 4px 0 0; }
.portrait { border-radius: var(--radius); }
.tier { margin-left: 8px; color: var(--gold); font-family: var(--display); }
.block { padding: 12px 14px; }
.block h2 { margin-bottom: 8px; }
.mu { display: grid; grid-template-columns: 44px 1fr; gap: 12px; align-items: center; }
.mu.favorable { box-shadow: inset 3px 0 0 var(--good); }
.mu.défavorable { box-shadow: inset 3px 0 0 var(--bad); }
.cp { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.cp li { display: grid; grid-template-columns: 34px 1fr auto auto; gap: 10px; align-items: center; padding: 6px 8px; border-bottom: 1px solid var(--border); }
.cp li.ban { grid-template-columns: 34px 1fr auto auto; }
.n { font-weight: 650; }
.chg { margin: 2px 0 0; font-size: var(--fs-sm); color: var(--muted); }
.n .chg { display: block; font-weight: 400; }
.toast { margin: 0; }
.small { font-size: 12px; }
</style>
