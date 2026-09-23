<script setup lang="ts">
import type { MemberHeatStage } from '~/types/memberView';

/**
 * Нагрев фона экрана участника — `product/design/comeback/03-member-heat-scale.html`.
 *
 * Слой = сила ступени снаружи, дыхание внутри. Ступень меняет только прозрачность слоёв,
 * и переход между ступенями идёт плавно, за 1.2 с: холодно (синий), гранат, огонь (янтарь).
 * Периоды дыхания разные — пятна не сходятся в одну фазу.
 *
 * Лежит под содержимым целиком; место и обрезку задаёт контейнер.
 */
defineProps<{ stage: MemberHeatStage }>();
</script>

<template>
  <div class="pointer-events-none absolute inset-0" :class="`heat-s${stage}`" aria-hidden="true">
    <div class="heat-layer heat-warm"><div class="heat-blob heat-b-warm" /></div>
    <div class="heat-layer heat-wash"><div class="heat-blob heat-b-wash" /></div>
    <div class="heat-layer heat-cold"><div class="heat-blob heat-b-cold" /></div>
    <div class="heat-layer heat-ruby"><div class="heat-blob heat-b-ruby" /></div>
    <div class="heat-layer heat-ember"><div class="heat-blob heat-b-ember" /></div>
    <div class="heat-layer heat-gold"><div class="heat-blob heat-b-gold" /></div>
    <div class="heat-veil" />
    <div class="heat-fade" />
  </div>
</template>

<style scoped>
.heat-layer { position: absolute; inset: 0; opacity: 0; transition: opacity 1.2s ease; }
.heat-blob { position: absolute; left: 50%; top: 58%; border-radius: 50%; transform: translate(-50%, -50%); will-change: transform, opacity; }

.heat-b-warm { width: 520px; height: 420px; filter: blur(56px); background: radial-gradient(circle, rgba(150, 60, 20, 0.85) 0%, rgba(150, 60, 20, 0.46) 46%, rgba(110, 40, 12, 0) 72%); animation: heat-pulse-b 7s ease-in-out infinite; }
.heat-b-wash { width: 500px; height: 400px; filter: blur(54px); background: radial-gradient(circle, rgba(120, 26, 52, 0.85) 0%, rgba(120, 26, 52, 0.46) 46%, rgba(90, 16, 40, 0) 72%); }
.heat-b-cold { width: 420px; height: 360px; filter: blur(40px); background: radial-gradient(circle, rgba(58, 74, 132, 1) 0%, rgba(58, 74, 132, 0.52) 46%, rgba(40, 52, 96, 0) 72%); animation: heat-pulse-a 8s ease-in-out infinite; }
.heat-b-ruby { width: 380px; height: 330px; filter: blur(42px); background: radial-gradient(circle, rgba(214, 38, 78, 1) 0%, rgba(214, 38, 78, 0.48) 46%, rgba(120, 20, 48, 0) 72%); animation: heat-pulse-b 11s ease-in-out infinite; }
.heat-b-ember { width: 400px; height: 340px; filter: blur(44px); background: radial-gradient(circle, rgba(232, 96, 36, 1) 0%, rgba(232, 96, 36, 0.46) 46%, rgba(140, 48, 14, 0) 72%); animation: heat-pulse-c 9s ease-in-out infinite; }
.heat-b-gold { width: 320px; height: 290px; filter: blur(46px); background: radial-gradient(circle, rgba(250, 156, 44, 1) 0%, rgba(250, 156, 44, 0.42) 46%, rgba(150, 84, 16, 0) 72%); animation: heat-pulse-a 13s ease-in-out infinite; }

.heat-s1 .heat-wash { opacity: 0.26; }
.heat-s1 .heat-cold { opacity: 0.88; }
.heat-s1 .heat-ruby { opacity: 0.14; }
.heat-s2 .heat-wash { opacity: 0.34; }
.heat-s2 .heat-cold { opacity: 0.1; }
.heat-s2 .heat-ruby { opacity: 0.94; }
.heat-s2 .heat-ember { opacity: 0.16; }
.heat-s3 .heat-warm { opacity: 0.3; }
.heat-s3 .heat-ember { opacity: 0.86; }
.heat-s3 .heat-gold { opacity: 0.9; }

.heat-veil { position: absolute; inset: 0; background: radial-gradient(ellipse 78% 58% at 50% 58%, rgba(11, 13, 17, 0.52) 0%, rgba(11, 13, 17, 0.3) 55%, rgba(11, 13, 17, 0) 100%); }
.heat-fade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(11, 13, 17, 0) 58%, rgba(11, 13, 17, 0.82) 88%, #0b0d11 100%); }

@keyframes heat-pulse-a {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.88; }
  25% { transform: translate(-44%, -56%) scale(1.26); opacity: 1; }
  50% { transform: translate(-56%, -45%) scale(0.84); opacity: 0.46; }
  75% { transform: translate(-53%, -57%) scale(1.14); opacity: 0.92; }
  100% { transform: translate(-50%, -50%) scale(1); opacity: 0.88; }
}

@keyframes heat-pulse-b {
  0% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.7; }
  30% { transform: translate(-57%, -44%) scale(0.82); opacity: 1; }
  60% { transform: translate(-43%, -58%) scale(1.3); opacity: 0.44; }
  100% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.7; }
}

@keyframes heat-pulse-c {
  0% { transform: translate(-50%, -50%) scale(0.94); opacity: 0.52; }
  35% { transform: translate(-55%, -55%) scale(1.28); opacity: 1; }
  70% { transform: translate(-45%, -44%) scale(1.02); opacity: 0.42; }
  100% { transform: translate(-50%, -50%) scale(0.94); opacity: 0.52; }
}

@media (prefers-reduced-motion: reduce) {
  .heat-blob {
    animation: none !important;
  }
}
</style>
