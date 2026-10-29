<script setup lang="ts">
// Choix d'un champion à explorer (recherche dans tous les champions, triés par nom).
import { computed, onMounted, ref } from 'vue';
import { championIcon, pct, hideBroken } from './store';
import { explore, explored, exploring } from './explore';

const champions = ref<{ id: number; name: string; winrate: number | null }[]>([]);
const q = ref('');
const open = ref(false);
onMounted(async () => (champions.value = await window.api.listChampions()));
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const matches = computed(() => {
  const s = norm(q.value);
  if (!s) return [];
  return champions.value.filter((c) => norm(c.name).includes(s)).slice(0, 8);
});
async function pick(id: number) {
  q.value = '';
  open.value = false;
  await explore(id);
}
</script>

<template>
  <div class="picker">
    <div class="field">
      <input v-model="q" class="search" placeholder="Explorer un champion…" spellcheck="false" @focus="open = true" @keydown.enter="matches[0] && pick(matches[0].id)" />
      <div v-if="open && matches.length" class="list card">
        <button v-for="c in matches" :key="c.id" @mousedown.prevent="pick(c.id)">
          <img @error="hideBroken" :src="championIcon(c.id)" width="22" height="22" class="icon" alt="" />
          <span>{{ c.name }}</span>
          <span class="num faint small">{{ pct(c.winrate, 1) }}</span>
        </button>
      </div>
    </div>
    <span v-if="exploring" class="faint small">Chargement…</span>
    <button v-else-if="explored" class="btn" @click="explore(null)">Fermer l’exploration</button>
  </div>
</template>

<style scoped>
.picker { display: flex; gap: 10px; align-items: center; }
.field { position: relative; }
.search { background: var(--panel-2); color: var(--text); border: 1px solid var(--line); border-radius: var(--radius); padding: 6px 10px; font: inherit; font-size: 13px; width: 230px; }
.list { position: absolute; top: 36px; left: 0; width: 260px; z-index: 5; padding: 4px; display: flex; flex-direction: column; }
.list button { display: grid; grid-template-columns: 22px 1fr auto; gap: 8px; align-items: center; border: 0; background: transparent; color: var(--text); padding: 5px 6px; border-radius: var(--radius); cursor: pointer; font: inherit; font-size: 13px; text-align: left; }
.list button:hover { background: var(--panel-2); }
.small { font-size: 12px; }
</style>
