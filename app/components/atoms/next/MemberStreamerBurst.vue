<script setup lang="ts">
import { ref } from 'vue';

/**
 * Серпантин — `_reference/design/gifts/main-screen-gifts-take.html`, `.streamer` и `burst()`.
 *
 * Обёртка вокруг того, из чего он вылетает: `burst()` разбрасывает частицы из её прямоугольника —
 * по середине ширины и высоты, как в макете, а не из одной точки. Цвета — конфетти акции:
 * гранат, золото, оранжевый, белый.
 *
 * Частицы кладутся прямо в `body` и убирают себя сами: подарок, из которого они вылетели,
 * схлопывается и уходит из списка раньше, чем они долетят, а шторка уезжает вниз вместе
 * с последним — серпантин должен долететь поверх главной. Поэтому и стили частиц не scoped:
 * частицы не часть разметки компонента.
 *
 * При «уменьшении движения» серпантина нет вовсе.
 */
const COLORS = ['#E8365D', '#F7BC3E', '#FAA02C', '#F4F6F8'];
const PARTICLE_COUNT = 26;
/** Самая долгая частица летит 2.1 с — убираем с запасом. */
const PARTICLE_LIFETIME_MS = 2300;

const area = ref<HTMLElement | null>(null);

function burst(): void {
  if (!area.value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  const rect = area.value.getBoundingClientRect();

  for (let index = 0; index < PARTICLE_COUNT; index += 1) {
    const particle = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 120;

    particle.className = 'member-streamer';
    particle.style.left = `${rect.left + rect.width * (0.15 + 0.7 * Math.random())}px`;
    particle.style.top = `${rect.top + rect.height * (0.3 + 0.4 * Math.random())}px`;
    particle.style.background = COLORS[index % COLORS.length] ?? '#F4F6F8';
    particle.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
    // Разлёт сплюснут по вертикали и сдвинут вниз: частицы оседают
    particle.style.setProperty('--y', `${Math.sin(angle) * distance * 0.7 + 80 + Math.random() * 60}px`);
    particle.style.setProperty('--r', `${Math.random() * 900 - 450}deg`);
    particle.style.setProperty('--d', `${1.3 + Math.random() * 0.8}s`);

    document.body.appendChild(particle);
    setTimeout(() => particle.remove(), PARTICLE_LIFETIME_MS);
  }
}

defineExpose({ burst });
</script>

<template>
  <div ref="area">
    <slot />
  </div>
</template>

<style>
.member-streamer {
  position: fixed;
  z-index: 40;
  width: 7px;
  height: 11px;
  border-radius: 1px;
  pointer-events: none;
  animation: member-streamer var(--d) cubic-bezier(0.15, 0.7, 0.35, 1) forwards;
}

@keyframes member-streamer {
  0% {
    opacity: 1;
    transform: translate(0, 0) rotate(0deg);
  }

  60% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translate(var(--x), var(--y)) rotate(var(--r));
  }
}

@media (prefers-reduced-motion: reduce) {
  .member-streamer {
    display: none;
  }
}
</style>
