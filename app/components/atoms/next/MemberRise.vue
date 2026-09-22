<script setup lang="ts">
import { onMounted, ref } from 'vue';

/**
 * Появление блока снизу вверх при открытии экрана — строки встают по очереди.
 *
 * Короткое: блок не должен догонять читающего. Очередь задаёт `step` — задержка кратна
 * ему; `prefers-reduced-motion` показывает всё сразу. Появление начинается только
 * в браузере — сервер рисует блоки на месте, иначе без скриптов экран остался бы пустым.
 */
withDefaults(defineProps<{ step?: 0 | 1 | 2 | 3 }>(), { step: 0 });

const shown = ref(false);
const armed = ref(false);

onMounted(() => {
  armed.value = true;
  // Два кадра: первый ставит блок в исходное положение, второй запускает переход из него.
  requestAnimationFrame(() => requestAnimationFrame(() => (shown.value = true)));
});

const DELAY_CLASSES = ['', 'rise-step-1', 'rise-step-2', 'rise-step-3'] as const;
</script>

<template>
  <div class="relative" :class="[armed ? 'rise' : '', shown ? 'rise-in' : '', DELAY_CLASSES[step]]">
    <slot />
  </div>
</template>

<style scoped>
.rise {
  opacity: 0;
  transform: translateY(34px);
  transition:
    opacity 0.8s ease,
    transform 0.8s cubic-bezier(0.22, 0.7, 0.3, 1);
}

.rise-in {
  opacity: 1;
  transform: none;
}

.rise-step-1 { transition-delay: 0.09s; }
.rise-step-2 { transition-delay: 0.18s; }
.rise-step-3 { transition-delay: 0.27s; }

@media (prefers-reduced-motion: reduce) {
  .rise {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
</style>
