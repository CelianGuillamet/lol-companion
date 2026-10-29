// Exploration hors partie : augments et build de n'importe quel champion, pour préparer ses parties.
import { ref } from 'vue';
import type { AugmentPanel, BuildPanel } from '../core/types';

export const explored = ref<{ id: number; lane: string | null; augments: AugmentPanel | null; build: BuildPanel | null } | null>(null);
export const exploring = ref(false);

declare global {
  interface Window {
    __explore?: (id: number) => Promise<void>;
  }
}

/** lane : fiche Faille (build OP.GG du rôle) ; sans : fiche Mayhem (augments + build arammeta). */
export async function explore(id: number | null, lane: string | null = null): Promise<void> {
  if (!id) {
    explored.value = null;
    return;
  }
  exploring.value = true; // la fiche en cours reste affichée (estompée) pendant le chargement d'un autre rôle
  const [augments, build] = lane
    ? [null, await window.api.championBuild(id, lane)]
    : await Promise.all([window.api.championAugments(id), window.api.championBuild(id)]);
  explored.value = { id, lane, augments, build };
  exploring.value = false;
}

window.__explore = explore; // utilisé par le test de fumée
