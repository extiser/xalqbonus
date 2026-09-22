<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { MemberChestCardView, MemberRewardTicketView } from '~/types/memberView';

/**
 * Шторка «Сундуки дня» — эталон `product/design/comeback/04-day-chests-sheet.html`,
 * сцены `04-day-chests-sheet-states.html`.
 *
 * Семь карточек — по одной на день окна, три в ряд; седьмая одна в третьем ряду и стоит
 * по центру: у края она читалась бы как ошибка раскладки.
 *
 * Открытие. Нажатие на золотую разгоняет сундук прямо в сетке, подзаголовок схлопывается
 * теми же кадрами, а сетка дорастает до размера награды — к вылету геометрия уже конечная,
 * и карточке награды есть куда лететь. Из сундука бьёт вспышка, награда вылетает во всю
 * шторку, заголовок называет событие. «Готово» возвращает в сетку.
 *
 * Что нажато и что сейчас летит — состояние самой шторки на время сцены; открыт ли сундук
 * на самом деле — решает родитель: `open` уходит наверх в момент нажатия, `done` — по «Готово».
 */
const props = defineProps<{
  open: boolean;
  cards: MemberChestCardView[];
  /** Что вылетит из сундука — известно родителю к моменту нажатия. */
  ticket: MemberRewardTicketView;
  texts: {
    title: string;
    titleDone: string;
    subtitle: string;
    close: string;
    done: string;
    note: string;
    link: string;
  };
}>();

const emit = defineEmits<{ close: []; open: [cardId: string]; done: [cardId: string]; link: [] }>();

/** Ширина карточки награды — снята с эталона. */
const TICKET_WIDTH = 250;
/** Всё, что в слое награды ниже карточки: воздух, подпись, кнопка, нижнее поле. */
const BELOW_TICKET = 75;

const stage = ref<HTMLElement | null>(null);
const grid = ref<HTMLElement | null>(null);

const burstingId = ref<string | null>(null);
const revealed = ref(false);
const growth = ref(0);
const from = ref({ x: 0, y: 0, scale: 0.2 });
const flash = ref({ x: 0, y: 0 });

const title = computed(() => (revealed.value ? props.texts.titleDone : props.texts.title));

function startOpening(cardId: string): void {
  if (burstingId.value !== null || !grid.value) {
    return;
  }

  // Сколько сетке не хватает до высоты награды: карточка 22 × 30, под ней подпись и кнопка.
  const width = Math.min(TICKET_WIDTH, grid.value.clientWidth);
  const needed = (width * 30) / 22 + BELOW_TICKET;

  growth.value = Math.max(0, needed - grid.value.offsetHeight);
  burstingId.value = cardId;
  emit('open', cardId);
}

/** Откуда лететь: сундук лежит в сетке, карточка — в слое поверх неё, числа берутся замером. */
async function reveal(): Promise<void> {
  await nextTick();

  const root = stage.value;
  const chest = root?.querySelector(`[data-card-id="${burstingId.value}"] img`);
  const ticket = root?.querySelector('[data-reveal-ticket]');

  if (root && chest && ticket) {
    const box = root.getBoundingClientRect();
    const chestBox = chest.getBoundingClientRect();
    const ticketBox = ticket.getBoundingClientRect();
    const chestX = chestBox.left + chestBox.width / 2;
    const chestY = chestBox.top + chestBox.height / 2;

    from.value = {
      x: chestX - (ticketBox.left + ticketBox.width / 2),
      y: chestY - (ticketBox.top + ticketBox.height / 2),
      scale: Number((chestBox.width / ticketBox.width).toFixed(3)),
    };
    flash.value = { x: chestX - box.left, y: chestY - box.top };
  }

  revealed.value = true;
}

function finish(): void {
  const cardId = burstingId.value;

  revealed.value = false;
  burstingId.value = null;
  growth.value = 0;

  if (cardId !== null) {
    emit('done', cardId);
  }
}
</script>

<template>
  <MoleculesNextMemberSheet
    :open="open"
    :title="title"
    :subtitle="texts.subtitle"
    :subtitle-hidden="burstingId !== null"
    @close="$emit('close')"
  >
    <div ref="stage" class="relative">
      <div
        ref="grid"
        class="grid grid-cols-3 gap-2.5 transition-[padding] duration-[900ms] ease-[cubic-bezier(0.36,0.07,0.19,0.97)] motion-reduce:transition-none"
        :style="{ paddingBottom: `${growth}px` }"
      >
        <div
          v-for="(card, index) in cards"
          :key="card.id"
          :data-card-id="card.id"
          :class="index === 6 ? 'col-start-2' : ''"
        >
          <MoleculesNextMemberChestCard
            :card="card"
            :bursting="burstingId === card.id"
            :opened="burstingId === card.id && revealed"
            @open="startOpening(card.id)"
            @burst="reveal"
          />
        </div>
      </div>

      <div class="mt-6" :class="burstingId !== null ? 'invisible' : ''">
        <AtomsNextMemberButton size="l" tone="grey" @click="$emit('close')">{{ texts.close }}</AtomsNextMemberButton>
      </div>

      <MoleculesNextMemberRewardReveal
        :revealed="revealed"
        :ticket="ticket"
        :from="from"
        :flash="flash"
        :texts="{ note: texts.note, link: texts.link, done: texts.done }"
        @done="finish"
        @link="$emit('link')"
      />
    </div>
  </MoleculesNextMemberSheet>
</template>
