<script setup lang="ts" generic="T extends string | number">
// Choix exclusif (mode, rôle, rareté, filtre) : un seul composant, flèches gauche/droite au clavier.
const props = defineProps<{ options: { value: T; label: string; title?: string }[]; modelValue: T; label: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: T] }>();
function key(e: KeyboardEvent, i: number) {
  const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
  if (!d) return;
  e.preventDefault();
  const n = props.options.length;
  const next = props.options[(i + d + n) % n];
  emit('update:modelValue', next.value);
  const bar = (e.currentTarget as HTMLElement).parentElement;
  (bar?.children[(i + d + n) % n] as HTMLElement | undefined)?.focus();
}
</script>

<template>
  <div class="seg" role="tablist" :aria-label="label">
    <button
      v-for="(o, i) in options"
      :key="String(o.value)"
      type="button"
      role="tab"
      :aria-selected="o.value === modelValue"
      :tabindex="o.value === modelValue ? 0 : -1"
      :title="o.title"
      @click="emit('update:modelValue', o.value)"
      @keydown="key($event, i)"
    >
      {{ o.label }}
    </button>
  </div>
</template>
