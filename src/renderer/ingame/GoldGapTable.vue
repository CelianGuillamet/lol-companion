<script setup lang="ts">
// Détail de l'écart d'objets. Faille : rôle contre rôle, ta ligne en tête. ARAM et Mayhem : pas de couloir, chaque
// équipe est juste classée du plus riche au moins riche.
import { computed } from 'vue';
import { state, championIcon, hideBroken, signedGold, shortGold } from '../store';

const gap = computed(() => state.value?.goldGap ?? null);
const rows = computed(() => [...(gap.value?.rows ?? [])].sort((a, b) => (gap.value?.byRole ? Number(b.mine) - Number(a.mine) : 0)));
</script>

<template>
  <section v-if="gap" class="table" aria-label="Valeur des objets par joueur">
    <div class="totals"><span>Ton équipe {{ shortGold(gap.allyGold) }}</span><span class="faint">{{ gap.byRole ? 'par rôle' : 'du plus riche au moins riche' }}</span><span>En face {{ shortGold(gap.enemyGold) }}</span></div>
    <ul>
      <li v-for="(r, i) in rows" :key="i" :class="{ mine: r.mine && gap.byRole }">
        <span class="side">
          <template v-if="r.ally"><img @error="hideBroken" :src="championIcon(r.ally.championId)" width="24" height="24" alt="" /><span class="n">{{ r.ally.championName }}</span><span class="faint">niv. {{ r.ally.level }}</span><strong>{{ shortGold(r.ally.gold) }}</strong></template>
        </span>
        <span class="mid">
          <template v-if="gap.byRole"><span class="faint small">{{ r.role }}</span><strong :class="(r.gap ?? 0) > 0 ? 'up' : (r.gap ?? 0) < 0 ? 'down' : ''">{{ signedGold(r.gap ?? 0) }}</strong></template>
        </span>
        <span class="side right">
          <template v-if="r.enemy"><strong>{{ shortGold(r.enemy.gold) }}</strong><span class="faint">niv. {{ r.enemy.level }}</span><span class="n">{{ r.enemy.championName }}</span><img @error="hideBroken" :src="championIcon(r.enemy.championId)" width="24" height="24" alt="" /></template>
        </span>
      </li>
    </ul>
    <p class="faint small">Objets vus au tableau des scores, au prix du patch. L’or en poche ne compte pas<template v-if="gap.unknown"> ; {{ gap.unknown }} objet{{ gap.unknown > 1 ? 's' : '' }} sans prix compté{{ gap.unknown > 1 ? 's' : '' }} 0</template>.</p>
  </section>
</template>

<style scoped>
.table { padding: 8px 18px 9px; border-bottom: 1px solid var(--border); background: var(--surface-1); }
.totals { display: flex; justify-content: space-between; gap: 10px; font-size: var(--fs-sm); margin-bottom: 4px; }
ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
li { display: grid; grid-template-columns: minmax(0, 1fr) 76px minmax(0, 1fr); align-items: center; gap: 8px; font-size: var(--fs-sm); padding: 1px 4px; }
li.mine { background: var(--surface-2); }
.side { display: flex; align-items: center; gap: 6px; min-width: 0; }
.side.right { justify-content: flex-end; }
.side img { border-radius: 50%; flex: none; }
.n { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.side .faint, .side strong { flex: none; }
.mid { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.up { color: var(--ok); }
.down { color: var(--danger); }
.small { font-size: 12px; }
p { margin: 6px 0 0; }
@media (max-width: 480px) { .table { padding: 8px 12px; } .side .faint { display: none; } li { grid-template-columns: minmax(0, 1fr) 62px minmax(0, 1fr); } }
</style>
