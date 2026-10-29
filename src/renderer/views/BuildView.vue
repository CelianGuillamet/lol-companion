<script setup lang="ts">
import { computed } from 'vue';
import { state, championIcon, pct, hideBroken } from '../store';
import ChampionPicker from '../ChampionPicker.vue';
import Confidence from '../ui/Confidence.vue';
import { explored } from '../explore';
import type { BuildPanel } from '../../core/types';

const props = defineProps<{ compact?: boolean; noLive?: boolean; panel?: BuildPanel | null }>();
const b = computed(() => props.panel ?? state.value?.build ?? (props.compact ? null : (explored.value?.build ?? null)));
const ct = computed(() => (state.value?.counters && state.value.counters.enemies.length ? state.value.counters : null));
const nb = computed(() => (state.value?.nextBuy?.rows.length ? state.value.nextBuy : null));
const ROLE = { ad: 'build AD', ap: 'build AP', tank: 'build tank' } as const;
</script>

<template>
  <div v-if="!props.compact && !props.panel && !state?.build" class="pbar"><ChampionPicker /></div>
  <div v-if="!b" class="empty">
    <h2>Pas de build à afficher</h2>
    <p>Le build de ton champion (runes, sorts, items avec leurs icônes) apparaît dès qu’il est choisi au champ select.</p>
  </div>

  <div v-else class="wrap" :class="{ compact: props.compact }">
    <div v-if="!props.compact" class="head">
      <img @error="hideBroken" :src="championIcon(b.championId)" class="icon" width="52" height="52" alt="" />
      <div>
        <h1>{{ b.championName }}</h1>
        <div class="muted">{{ b.mode === 'mayhem' ? 'ARAM: Mayhem' : b.mode === 'sr' ? `Faille${b.lane ? ` · ${b.lane}` : ''}` : 'ARAM' }} · build</div>
        <div v-if="b.note && b.mode === 'sr'" class="faint small">{{ b.note }}</div>
        <div v-if="b.balance?.length" class="bal" title="Modificateurs d’équilibrage ARAM (wiki LoL)">
          <span v-for="x in b.balance" :key="x.label" class="tag" :class="x.good ? 'good' : 'bad'">{{ x.label }}</span>
        </div>
      </div>
    </div>

    <section v-if="nb && !props.noLive" class="card block next">
      <h2>Prochain achat <span class="faint">tu as {{ nb.gold.toLocaleString('fr-FR') }} or<template v-if="nb.buildName"> · build suivi : {{ nb.buildName }}</template></span></h2>
      <div class="nrows">
        <div v-for="(r, i) in nb.rows" :key="r.item.id" class="nrow" :class="{ first: i === 0 }">
          <img @error="hideBroken" :src="r.item.icon ?? ''" :width="i === 0 ? 44 : 34" :height="i === 0 ? 44 : 34" class="ic" alt="" />
          <div class="nmeta">
            <div class="nname">{{ r.item.name }}</div>
            <div class="faint small">{{ r.why }}</div>
            <div v-if="r.step" class="small step">
              maintenant : <img @error="hideBroken" :src="r.step.item.icon ?? ''" width="18" height="18" class="ic" alt="" /> {{ r.step.item.name }}
              <span class="num">({{ r.step.price.toLocaleString('fr-FR') }})</span>
            </div>
          </div>
          <div class="num nprice">
            <div v-if="r.price != null">{{ r.price.toLocaleString('fr-FR') }}</div>
            <div v-if="r.price != null" class="small" :class="r.missing ? 'bad' : 'good'">{{ r.missing ? `il manque ${r.missing.toLocaleString('fr-FR')}` : 'achetable' }}</div>
          </div>
        </div>
      </div>
      <div class="faint small">Or et items lus dans le jeu (API officielle). Les composants ne sont pas détaillés : achète vers le premier item.</div>
    </section>

    <section v-if="ct && !props.noLive" class="card block counters">
      <h2>Contre leur équipe <span class="faint">{{ ROLE[ct.role] }}</span></h2>
      <div class="enemies">
        <span v-for="e in ct.enemies" :key="e.id" class="enemy" :title="e.name">
          <img @error="hideBroken" :src="championIcon(e.id)" width="28" height="28" class="icon" alt="" />
          <span v-if="e.fed" class="fed num">{{ e.fed }}</span>
        </span>
      </div>
      <div v-if="!ct.threats.length" class="faint small">Rien de particulier en face : garde le build le plus gagnant ci-dessous.</div>
      <div v-for="t in ct.threats" :key="t.key" class="threat">
        <div class="tmeta">
          <div class="tname">{{ t.title }}</div>
          <div class="faint small">{{ t.why }}<template v-if="t.champions.length"> · {{ t.champions.map((c) => c.name).join(', ') }}</template></div>
        </div>
        <div class="titems">
          <img @error="hideBroken" v-for="it in t.items" :key="it.id" :src="it.icon ?? ''" :title="it.name" width="34" height="34" class="ic" alt="" />
        </div>
      </div>
    </section>

    <div class="grid">
      <section v-if="b.runes" class="card block">
        <h2>Runes <span class="faint">{{ b.source === 'OP.GG' ? 'les plus jouées (OP.GG)' : 'recommandées par le client' }}</span></h2>
        <div class="runes">
          <div class="styles">
            <img @error="hideBroken" v-if="b.runes.primary?.icon" :src="b.runes.primary.icon" :title="b.runes.primary.name" width="26" height="26" alt="" />
            <img @error="hideBroken" v-if="b.runes.secondary?.icon" :src="b.runes.secondary.icon" :title="b.runes.secondary.name" width="20" height="20" class="sub" alt="" />
          </div>
          <div class="perks">
            <figure v-for="(p, i) in b.runes.perks" :key="p.id" :class="{ key: i === 0 }">
              <img @error="hideBroken" v-if="p.icon" :src="p.icon" :width="i === 0 ? 46 : 30" :height="i === 0 ? 46 : 30" alt="" />
              <figcaption>{{ p.name }}</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section class="card block">
        <h2>Sorts</h2>
        <div v-for="(sp, i) in b.spells" :key="i" class="spells">
          <img @error="hideBroken" v-for="x in sp.items" :key="x.id" :src="x.icon ?? ''" :title="x.name" width="34" height="34" class="ic" alt="" />
          <span class="names">{{ sp.items.map((x) => x.name).join(' + ') }}</span>
          <span v-if="sp.games" class="num muted">{{ pct(sp.winrate) }} · {{ sp.games.toLocaleString('fr-FR') }}</span>
        </div>
      </section>
    </div>

    <section v-if="b.skills || b.starter?.length" class="card block">
      <h2>Départ et compétences</h2>
      <div class="sk">
        <div v-if="b.starter?.length" class="items">
          <img @error="hideBroken" v-for="it in b.starter" :key="it.id" :src="it.icon ?? ''" :title="it.name" width="34" height="34" class="ic" alt="" />
        </div>
        <div v-if="b.skills">
          <div class="maxo">Monte <b v-for="(k, i) in b.skills.max" :key="i">{{ i ? ' › ' : '' }}{{ k }}</b></div>
          <div class="order num">
            <span v-for="(k, i) in b.skills.order.slice(0, 18)" :key="i" class="lvl" :class="{ r: k === 'R' }" :title="`niveau ${i + 1}`">{{ k }}</span>
          </div>
        </div>
      </div>
    </section>

    <section v-if="b.cores.length" class="card block">
      <h2 v-if="b.mode === 'sr'">Build <span class="faint">cœur le plus joué → 4e/5e/6e items, classés par fiabilité</span></h2>
      <h2 v-else>Builds les plus gagnants <span class="faint">2 items de base + 3e item conseillé</span></h2>
      <div v-for="(c, i) in b.cores" :key="i" class="core" :class="{ best: i === 0 }">
        <div class="items">
          <template v-for="(it, j) in c.core" :key="it.id">
            <img @error="hideBroken" :src="it.icon ?? ''" :title="it.name" width="44" height="44" class="ic big" alt="" />
            <span v-if="j < c.core.length - 1" class="plus">+</span>
          </template>
          <span class="arrow">→</span>
          <div v-for="o in c.options" :key="o.id" class="opt" :title="`${o.name} · ${pct(o.winrate)} sur ${o.games} parties`">
            <img @error="hideBroken" :src="o.icon ?? ''" width="34" height="34" class="ic" alt="" />
            <span class="num small" :class="o.winrate >= c.winrate ? 'good' : 'muted'">{{ pct(o.winrate, 0) }}</span>
            <Confidence :winrate="o.winrate" :games="o.games" compact />
          </div>
        </div>
        <div class="meta">
          <div class="cname">{{ c.core.map((x) => x.name).join(' + ') }}</div>
          <div class="faint small">{{ c.name }}</div>
          <div class="num"><strong>{{ pct(c.winrate) }}</strong> <span class="faint small">· {{ c.games.toLocaleString('fr-FR') }} parties</span></div>
          <Confidence :winrate="c.winrate" :games="c.games" />
        </div>
      </div>
    </section>

    <section v-if="b.singles?.length" class="card block">
      <h2>Autres items qui gagnent <span class="faint">à glisser dans le build selon la partie</span></h2>
      <div class="boots">
        <div v-for="o in b.singles" :key="o.id" class="boot">
          <img @error="hideBroken" :src="o.icon ?? ''" width="34" height="34" class="ic" alt="" />
          <div>
            <div class="small">{{ o.name }}</div>
            <div class="num faint small">{{ pct(o.winrate) }} · {{ o.games.toLocaleString('fr-FR') }}</div>
            <Confidence :winrate="o.winrate" :games="o.games" />
          </div>
        </div>
      </div>
    </section>

    <section v-if="b.boots.length" class="card block">
      <h2>Bottes</h2>
      <div class="boots">
        <div v-for="o in b.boots" :key="o.id" class="boot">
          <img @error="hideBroken" :src="o.icon ?? ''" width="34" height="34" class="ic" alt="" />
          <div>
            <div class="small">{{ o.name }}</div>
            <div class="num faint small">{{ pct(o.winrate) }} · {{ o.games.toLocaleString('fr-FR') }}</div>
            <Confidence :winrate="o.winrate" :games="o.games" />
          </div>
        </div>
      </div>
    </section>

    <p v-if="b.note" class="faint small">{{ b.note }}</p>
  </div>
</template>

<style scoped>
.pbar { padding: 16px 24px 0; }
.wrap { padding: 22px 24px 30px; display: flex; flex-direction: column; gap: 14px; max-width: 1100px; }
.wrap.compact { padding: 0; gap: 10px; }
.head { display: flex; gap: 14px; align-items: center; }
.head h1 { font-size: 22px; }
.grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 12px; }
.compact .grid { grid-template-columns: 1fr; }
.block { padding: 14px 16px; }
h2 { font-size: 14px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
h2 .faint { font-weight: 400; font-size: 12px; }
.small { font-size: 12px; }
.ic { border-radius: var(--radius); background: var(--panel-2); border: 1px solid var(--line); }
.ic.big { border-color: rgba(200, 170, 110, 0.5); }
.runes { display: flex; gap: 14px; align-items: flex-start; }
.styles { display: flex; flex-direction: column; gap: 8px; align-items: center; padding-top: 6px; }
.styles .sub { opacity: 0.8; }
.perks { display: flex; flex-wrap: wrap; gap: 10px 14px; }
figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; width: 64px; }
figure.key { width: 84px; }
figure img { border-radius: 50%; background: var(--panel-2); }
figcaption { font-size: 11px; color: var(--muted); text-align: center; line-height: 1.2; }
.spells { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
.spells .names { flex: 1; font-size: 13px; }
.core { display: flex; justify-content: space-between; gap: 16px; align-items: center; padding: 10px 0; border-top: 1px solid var(--line); }
.core:first-of-type { border-top: 0; padding-top: 0; }
.core.best .cname { color: var(--gold); }
.items { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.plus, .arrow { color: var(--faint); font-weight: 700; padding: 0 2px; }
.opt { display: flex; flex-direction: column; align-items: center; gap: 2px; }
.meta { text-align: right; min-width: 200px; }
.cname { font-size: 13px; font-weight: 600; }
.boots { display: flex; gap: 18px; flex-wrap: wrap; }
.boot { display: flex; gap: 8px; align-items: center; }
.counters { border-left: 3px solid var(--gold); }
.enemies { display: flex; gap: 6px; margin: -4px 0 8px; }
.enemy { display: flex; flex-direction: column; align-items: center; gap: 1px; }
.fed { font-size: 10px; color: var(--bad); font-weight: 700; }
.threat { display: flex; justify-content: space-between; align-items: center; gap: 14px; padding: 8px 0; border-top: 1px solid var(--line); }
.tname { font-weight: 650; font-size: 13px; }
.titems { display: flex; gap: 5px; }
.bal { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.tag { font-size: 11px; padding: 1px 6px; border-radius: var(--radius); background: var(--panel-2); border: 1px solid var(--line); }
.next { border-left: 3px solid var(--good); }
.nrows { display: flex; flex-direction: column; gap: 6px; margin-bottom: 6px; }
.nrow { display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; }
.nrow.first .nname { font-weight: 700; color: var(--gold); }
.nname { font-size: 13px; font-weight: 600; }
.nprice { text-align: right; font-size: 13px; }
.step { display: flex; align-items: center; gap: 5px; color: var(--good); margin-top: 2px; }
.compact .core { flex-direction: column; align-items: flex-start; gap: 6px; }
.compact .meta { text-align: left; min-width: 0; }
.sk { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
.maxo { font-size: 13px; margin-bottom: 6px; }
.maxo b { color: var(--gold-hi); font-family: var(--display); }
.order { display: flex; gap: 3px; flex-wrap: wrap; }
.lvl { width: 20px; height: 20px; display: grid; place-items: center; font-size: 11px; font-weight: 700; background: var(--panel-2); border: 1px solid var(--line); }
.lvl.r { color: var(--gold-hi); border-color: var(--gold-lo); }
</style>
