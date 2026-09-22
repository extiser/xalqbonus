<script setup lang="ts">
import { computed, useId } from 'vue';
import type { MemberRewardTicketView } from '~/types/memberView';

/**
 * Карточка награды — билет с корешком, `product/design/comeback/06-reward-card-sketch.html`.
 *
 * Сверху полоса отрыва, по бокам вырезы-полукружия — одним SVG с маской, поэтому вырезы
 * прозрачны. По углам накладки металла ступени, у низа значок: гранат ступени, у золотой —
 * корона, как знак сундука недели. По карточке ходит блик, полоса отрыва переливается,
 * сама карточка покачивается в перспективе.
 *
 * Всё внутри выражено в долях ширины карточки: сумма 1.727em, подпись 1.09em при кегле
 * в двадцатую ширины. Ширину задаёт контейнер — карточка растёт вместе с ним.
 */
const props = defineProps<{ ticket: MemberRewardTicketView }>();

/** Металл ступени: градиент полосы отрыва, цвет корешка, значок. */
const TIERS = {
  steel: { edge: '#5E6674', shine: '#A7B0BD', stub: '#727C88', badge: '/design/pomegranate-steel.png', badgeBox: [94, 230, 32] },
  bronze: { edge: '#96552A', shine: '#E0A070', stub: '#A86E43', badge: '/design/pomegranate-bronze.png', badgeBox: [94, 230, 32] },
  silver: { edge: '#96A0AE', shine: '#F0F4F8', stub: '#6B7C94', badge: '/design/pomegranate-silver.png', badgeBox: [94, 230, 32] },
  gold: { edge: '#C98A12', shine: '#FFE9A8', stub: '#A17420', badge: '/design/crown-gold.png', badgeBox: [93, 232, 34] },
} as const;

const tier = computed(() => TIERS[props.ticket.tier]);
const corner = computed(() => `/design/corner-${props.ticket.tier}.png`);

// Имена внутри SVG общие на всю страницу: у двух карточек рядом маска одной резала бы другую.
const id = useId();
const maskId = `ticket-cut-${id}`;
const metalId = `ticket-metal-${id}`;
const glareId = `ticket-glare-${id}`;
</script>

<template>
  <div class="ticket" :style="{ '--stub-color': tier.stub }">
    <div class="ticket-card">
      <svg class="ticket-shape" viewBox="0 0 220 300" aria-hidden="true">
        <defs>
          <mask :id="maskId">
            <rect x="0" y="0" width="220" height="300" rx="18" fill="#fff" />
            <circle cx="0" cy="66.5" r="23.5" fill="#000" />
            <circle cx="220" cy="66.5" r="23.5" fill="#000" />
          </mask>
          <linearGradient :id="metalId" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" :stop-color="tier.edge" />
            <stop offset="0.35" :stop-color="tier.shine" />
            <stop offset="0.5" stop-color="#FFFFFF" />
            <stop offset="0.65" :stop-color="tier.shine" />
            <stop offset="1" :stop-color="tier.edge" />
            <animateTransform attributeName="gradientTransform" type="translate" values="-1 0; 1 0; -1 0" dur="5s" repeatCount="indefinite" />
          </linearGradient>
          <linearGradient :id="glareId" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.75" />
            <stop offset="1" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <g :mask="`url(#${maskId})`">
          <rect x="0" y="0" width="220" height="300" rx="18" fill="#F6F5F1" />
          <rect x="30" y="64.5" width="160" height="4" rx="2" :fill="`url(#${metalId})`" />
          <image
            :href="tier.badge"
            :x="tier.badgeBox[0]"
            :y="tier.badgeBox[1]"
            :width="tier.badgeBox[2]"
            :height="tier.badgeBox[2]"
          />
          <rect x="-120" y="-40" width="90" height="380" :fill="`url(#${glareId})`" transform="rotate(16 110 150)">
            <animate attributeName="x" values="-120;250;-120" dur="6s" repeatCount="indefinite" />
          </rect>
        </g>
      </svg>
      <img class="ticket-corner ticket-corner-tl" :src="corner" alt="">
      <img class="ticket-corner ticket-corner-tr" :src="corner" alt="">
      <img class="ticket-corner ticket-corner-br" :src="corner" alt="">
      <img class="ticket-corner ticket-corner-bl" :src="corner" alt="">
      <div class="ticket-stub">{{ ticket.stub }}</div>
      <div class="ticket-inner">
        <div class="ticket-title">{{ ticket.title }}</div>
        <div class="ticket-sub">{{ ticket.subtitle }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Кегль — двадцатая ширины карточки: ширину даёт контейнер, всё внутри в em. */
.ticket {
  container-type: inline-size;
  width: 100%;
  font-family: var(--font-manrope);
}

.ticket-card {
  position: relative;
  width: 100%;
  aspect-ratio: 220 / 300;
  font-size: 5cqw;
  animation: ticket-float 6s ease-in-out infinite;
}

/* Тень в два слоя: ближняя сажает карточку на фон, дальняя отрывает от него. */
.ticket-shape {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 0.45em 0.8em rgba(0, 0, 0, 0.38)) drop-shadow(0 1.9em 3.6em rgba(0, 0, 0, 0.5));
}

.ticket-corner {
  position: absolute;
  width: 3.364em;
  height: 3.364em;
  pointer-events: none;
}

.ticket-corner-tl { top: -0.273em; left: -0.273em; }
.ticket-corner-tr { top: -0.273em; right: -0.273em; transform: rotate(90deg); }
.ticket-corner-br { bottom: -0.273em; right: -0.273em; transform: rotate(180deg); }
.ticket-corner-bl { bottom: -0.273em; left: -0.273em; transform: rotate(270deg); }

.ticket-stub {
  position: absolute;
  inset: 0 0 auto;
  height: 22.2%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1em;
  font-weight: 700;
  letter-spacing: 0.055em;
  text-transform: uppercase;
  color: var(--stub-color);
}

.ticket-inner {
  position: absolute;
  inset: 22.2% 0 26%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 10%;
  text-align: center;
}

/* Сумма и подпись — в долях карточки (шкала шрифтов, «Карточка награды из сундука»). */
.ticket-title {
  font-size: 1.727em;
  font-weight: 800;
  line-height: 1.2;
  color: #1a1a1c;
}

.ticket-sub {
  margin-top: 0.545em;
  font-size: 1.09em;
  font-weight: 500;
  color: #6b6f77;
}

@keyframes ticket-float {
  0%,
  100% { transform: perspective(760px) rotateX(5deg) rotateY(-8deg) translateY(0); }
  50% { transform: perspective(760px) rotateX(-5deg) rotateY(8deg) translateY(-0.9em); }
}

@media (prefers-reduced-motion: reduce) {
  .ticket-card {
    animation: none;
  }
}
</style>
