<script setup lang="ts">
// Achats en partie (refait après la 1re vraie partie) :
// 1. le prochain item, gros, avec la raison en clair (qui en face l'impose) ;
// 2. ton parcours sur 6 places : ce que tu as déjà (coché), ce qui vient ensuite ;
// 3. les deux équipes en direct : dégâts, rôle, score et items de chacun, et ce que ça change pour toi.
import { computed } from 'vue';
import { state, championIcon, hideBroken } from '../store';
import { purchaseOf } from '../purchase';

withDefaults(defineProps<{ emphasize?: boolean }>(), { emphasize: true });

const nb = computed(() => state.value?.nextBuy ?? null);
const ct = computed(() => (state.value?.counters?.enemies.length ? state.value.counters : null));
const next = computed(() => nb.value?.rows[0] ?? null);
const purchase = computed(() => purchaseOf(nb.value));
const later = computed(() => nb.value?.rows.slice(1) ?? []);
const plan = computed(() => {
  const p = nb.value?.plan ?? [];
  return [...p, ...Array.from({ length: Math.max(0, 6 - p.length) }, () => null)];
});
const nextIndex = computed(() => (nb.value?.plan ?? []).findIndex((s) => !s.owned));
const fmt = (n: number) => n.toLocaleString('fr-FR');
const lane = computed(() => state.value?.counters?.lane ?? null);
const DMG: Record<string, string> = { AD: 'physique', AP: 'magique', mixte: 'mixte' };
</script>

<template>
  <section class="buy">
    <header>
      <h2>Achat</h2>
      <span v-if="nb" class="gold num wide">
        {{ fmt(nb.gold) }} or<span v-if="nb.respawn" class="dead"> · mort {{ nb.respawn }} s</span>
      </span>
    </header>

    <p v-if="!nb" class="faint small">L’or et tes items s’affichent dès que la partie a commencé.</p>

    <template v-else>
      <article v-if="purchase && next" class="next" :class="{ reco: emphasize && purchase.canBuy }">
        <img @error="hideBroken" :src="purchase.item.icon ?? ''" width="48" height="48" class="ic big" alt="" />
        <div class="what">
          <div class="action-label">{{ purchase.canBuy ? 'Acheter maintenant' : purchase.kind === 'saving' ? 'À économiser' : 'Prix indisponible' }}</div>
          <div class="name">{{ purchase.item.name }}</div>
          <div class="why">{{ next.why }}</div>
          <div v-if="purchase.kind === 'component'" class="goal">Composant pour {{ purchase.target.name }}</div>
          <div v-if="purchase.kind === 'unknown'" class="goal">Vérifie le coût dans la boutique.</div>
        </div>
        <div v-if="purchase.cost != null" class="price num">
          <div>{{ fmt(purchase.cost) }} or</div>
          <div v-if="purchase.canBuy" class="good">achetable</div>
          <div v-else-if="purchase.missing != null" class="faint">manque {{ fmt(purchase.missing) }} or</div>
          <div v-if="purchase.goldAfter != null" class="faint">reste {{ fmt(purchase.goldAfter) }} or après achat</div>
        </div>
      </article>
      <p v-if="purchase?.kind === 'component' && purchase.missing != null" class="goal-note">
        Objectif : {{ purchase.target.name }} · encore {{ fmt(purchase.missing) }} or à économiser pour le terminer.
      </p>
      <p v-else-if="!next" class="faint small">Aucun achat conseillé pour cet inventaire. Le build complet reste consultable ci-dessous.</p>

      <div class="path" aria-label="Ton build : achetés puis à venir">
        <div v-for="(s, i) in plan" :key="i" class="slot" :class="{ owned: s?.owned, now: i === nextIndex, empty: !s }" :title="s ? `${s.item.name}${s.owned ? ' (acheté)' : s.why ? ` — ${s.why}` : ''}` : ''">
          <img v-if="s" @error="hideBroken" :src="s.item.icon ?? ''" width="40" height="40" class="ic" alt="" />
          <span v-if="s?.owned" class="tick" aria-hidden="true">✓</span>
        </div>
      </div>
      <p v-if="later.length" class="then">
        Ensuite : <template v-for="(r, i) in later" :key="r.item.id">{{ i ? ' · ' : '' }}<b>{{ r.item.name }}</b> <span class="faint">({{ r.why }})</span></template>
      </p>
      <p v-if="nb.buildInfo" class="src">
        <template v-if="state?.mode === 'sr'">Build OP.GG : {{ Math.round(nb.buildInfo.winrate * 100) }} % sur {{ fmt(nb.buildInfo.games) }} parties ({{ state?.build?.lane ?? 'Faille' }}).</template>
        <template v-else>Build {{ nb.buildName }} : {{ Math.round(nb.buildInfo.winrate * 100) }} % sur {{ fmt(nb.buildInfo.games) }} parties Mayhem
        (arammeta){{ nb.buildInfo.count === 1 ? ', seul build courant pour ce champion' : '' }}.</template>
        <template v-if="nb.buildInfo.adapted.length"> Adapté à leur équipe : {{ nb.buildInfo.adapted.join(', ') }}.</template>
      </p>
    </template>

    <div v-if="lane" class="lane" :class="lane.verdict">
      <img @error="hideBroken" :src="championIcon(lane.opponent.id)" width="30" height="30" class="ch" alt="" />
      <div>
        <div class="n">Ta lane : contre {{ lane.opponent.name }}</div>
        <div class="t" v-if="lane.games">{{ Math.round(lane.myWinRate * 100) }} % de victoires sur {{ fmt(lane.games) }} parties ({{ Math.round(lane.lo * 100) }}–{{ Math.round(lane.hi * 100) }} %) : {{ lane.verdict }}</div>
        <div class="t" v-else>Pas assez de parties sur ce matchup pour conclure.</div>
      </div>
    </div>

    <template v-if="ct">
      <h3>Leur équipe</h3>
      <ul class="team">
        <li v-for="e in ct.enemies" :key="e.id" :class="{ fed: e.fed }">
          <img @error="hideBroken" :src="championIcon(e.id)" width="30" height="30" class="ch" alt="" />
          <div class="who">
            <div class="n">{{ e.name }} <span v-if="e.kda" class="kda num">{{ e.kda }}</span></div>
            <div class="t">
              <span v-if="e.dmg" class="dmg" :class="e.dmg">{{ DMG[e.dmg] }}</span>
              <span v-for="t in e.tags ?? []" :key="t">{{ t }}</span>
            </div>
          </div>
          <div class="its">
            <img v-for="it in e.items ?? []" :key="it.id" @error="hideBroken" :src="it.icon ?? ''" :title="it.name" width="20" height="20" class="ic" alt="" />
          </div>
        </li>
      </ul>

      <ul v-if="ct.threats.length || ct.notes?.length" class="reads">
        <li v-for="t in ct.threats" :key="t.key" :class="{ urgent: t.urgent }">
          <div>
            <b>{{ t.title }}</b>{{ t.urgent ? ' — prioritaire' : '' }} : {{ t.why }}<template v-if="t.champions.length"> ({{ t.champions.map((c) => c.name).join(', ') }})</template>.
          </div>
          <div class="its">
            <img v-for="it in t.items.slice(0, 3)" :key="it.id" @error="hideBroken" :src="it.icon ?? ''" :title="it.name" width="24" height="24" class="ic" alt="" />
          </div>
        </li>
        <li v-for="n in ct.notes ?? []" :key="n" class="note">{{ n }}</li>
      </ul>
      <p v-else class="faint small">Rien de particulier en face : suis le build.</p>

      <div v-if="ct.allies?.length" class="allies">
        <span class="faint small">Ton équipe</span>
        <span v-for="a in ct.allies" :key="a.id" class="ally" :title="`${a.name}${a.dmg ? ` · ${DMG[a.dmg]}` : ''}${a.tags?.length ? ` · ${a.tags.join(', ')}` : ''}`">
          <img @error="hideBroken" :src="championIcon(a.id)" width="24" height="24" class="ch" alt="" />
          <span v-if="a.tags?.includes('tank')" class="mini">tank</span>
        </span>
      </div>
    </template>
  </section>
</template>

<style scoped>
.buy { display: flex; flex-direction: column; gap: 10px; }
header { display: flex; justify-content: space-between; align-items: baseline; }
h2 { font-size: 15px; }
h3 { margin: 8px 0 0; }
.gold { color: var(--gold); font-weight: 700; font-size: 15px; }
.dead { color: var(--bad); }
.ic { border-radius: var(--radius); background: var(--panel-2); display: block; }
.next { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 12px 12px 12px 18px; background: linear-gradient(110deg, rgba(200, 170, 110, 0.14), var(--panel-2) 55%); }
.big { border-radius: var(--radius); }
.next .name { font-weight: 700; font-size: 17px; }
.what { min-width: 0; overflow-wrap: anywhere; }
.action-label { font-size: 11px; color: var(--gold); margin-bottom: 4px; font-weight: 650; letter-spacing: 0.04em; text-transform: uppercase; }
.next .why { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
.goal { font-size: 12px; color: var(--text); margin-top: 5px; }
.goal-note { margin: 0; color: var(--muted); font-size: 12px; }
.price { text-align: right; font-size: 14px; font-weight: 700; }
.price s { font-weight: 500; font-size: 11.5px; }
.price div + div { font-size: 11.5px; font-weight: 600; }
.path { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.slot { position: relative; aspect-ratio: 1; max-width: 52px; border-radius: var(--radius); background: var(--panel); display: grid; place-items: center; border: 1px solid var(--line); }
.slot .ic { width: 100%; height: 100%; border-radius: var(--radius); }
.slot.owned .ic { opacity: 0.55; }
.slot.now { border-color: var(--gold); box-shadow: 0 0 0 1px var(--gold); }
.slot.empty { border-style: dashed; background: transparent; }
.tick { position: absolute; right: -4px; bottom: -4px; width: 16px; height: 16px; border-radius: 50%; background: var(--good); color: #0e1520; font-size: 11px; font-weight: 800; display: grid; place-items: center; }
.src { margin: 0; font-size: 11.5px; color: var(--faint); }
.then { margin: 0; font-size: 12.5px; }
.team, .reads { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.team li { display: grid; grid-template-columns: 30px 1fr auto; gap: 10px; align-items: center; padding: 5px 8px; border-radius: var(--radius); background: var(--panel); }
.team li.fed { box-shadow: inset 3px 0 0 var(--bad); }
.ch { border-radius: 50%; display: block; }
.who .n { font-weight: 650; font-size: 13px; }
.kda { color: var(--muted); font-weight: 500; font-size: 12px; margin-left: 4px; }
.team li.fed .kda { color: var(--bad); font-weight: 700; }
.who .t { display: flex; gap: 5px; flex-wrap: wrap; font-size: 11px; color: var(--muted); }
.dmg { font-weight: 650; }
.dmg.AD { color: #ff9b6b; }
.dmg.AP { color: #8fb8ff; }
.its { display: flex; gap: 3px; flex-wrap: wrap; justify-content: flex-end; max-width: 150px; }
.reads li { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius); background: var(--panel); font-size: 12.5px; }
.reads li.urgent { box-shadow: inset 3px 0 0 var(--gold); }
.reads li.note { color: var(--muted); }
.allies { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ally { position: relative; display: flex; flex-direction: column; align-items: center; }
.mini { font-size: 9.5px; color: var(--muted); }
.lane { display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-items: center; padding: 8px 10px; background: var(--panel); }
.lane .n { font-weight: 650; font-size: 13px; }
.lane .t { font-size: 12px; color: var(--muted); }
.lane.favorable { box-shadow: inset 3px 0 0 var(--good); }
.lane.défavorable { box-shadow: inset 3px 0 0 var(--bad); }
@media (max-width: 520px) {
  .next { grid-template-columns: 40px minmax(0, 1fr); gap: 10px; padding: 12px; }
  .big { width: 40px; height: 40px; }
  .price { grid-column: 2; text-align: left; display: flex; flex-wrap: wrap; gap: 3px 10px; align-items: baseline; }
}
</style>
