<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';
import EnemyIntelligence from './EnemyIntelligence.vue';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const titleId = useId();
let previousFocus: HTMLElement | null = null;

watch(() => props.open, async (open) => {
  await nextTick();
  const el = dialog.value;
  if (!el || open !== props.open) return;
  if (open && !el.open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    el.showModal();
  } else if (!open && el.open) el.close();
}, { immediate: true, flush: 'post' });

function close() { dialog.value?.close(); }
function closed() {
  emit('close');
  if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  previousFocus = null;
}
function backdrop(event: MouseEvent) {
  const el = dialog.value;
  if (!el || event.target !== el) return;
  const bounds = el.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
}
onBeforeUnmount(() => { if (dialog.value?.open) dialog.value.close(); });
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="enemy-dialog" :aria-labelledby="titleId" @cancel.prevent="close" @close="closed" @click="backdrop">
      <header class="dialog-head">
        <h2 :id="titleId">Sorts ennemis</h2>
        <button class="btn" autofocus @click="close" aria-label="Fermer les sorts ennemis">Fermer <kbd>Échap</kbd></button>
      </header>
      <div class="dialog-body"><EnemyIntelligence v-if="open" compact /></div>
    </dialog>
  </Teleport>
</template>

<style scoped>
.enemy-dialog { box-sizing: border-box; width: min(780px, calc(100vw - 24px)); height: min(760px, calc(100dvh - 24px)); max-width: none; max-height: calc(100dvh - 24px); padding: 0; margin: auto; inset: 0; overflow: hidden; color: var(--text); background: var(--bg); border: 1px solid var(--border-strong); border-radius: var(--radius); -webkit-app-region: no-drag; }
.enemy-dialog[open] { display: grid; grid-template-rows: auto minmax(0, 1fr); }
.enemy-dialog::backdrop { background: rgb(0 0 0 / 65%); }
.dialog-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--border); }
.dialog-head h2 { margin: 0; font-size: var(--fs-lg); }
.dialog-head .btn { flex: none; }
.dialog-head kbd { margin-left: 5px; }
.dialog-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 12px; }
</style>
