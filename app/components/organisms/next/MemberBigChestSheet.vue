<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import type { MemberRewardTicketView } from '~/types/memberView';

/**
 * Шторка крупного сундука — трёх дней или недели: `product/design/comeback/05-3days-chest-sheet.html`,
 * `05-week-chest-sheet.html` и их листы состояний.
 *
 * Сундук один на всё окно, поэтому сетки нет: он стоит посередине и занимает место, которое
 * у сундуков дня делят семеро. Шторки двух сундуков отличаются картинкой и словами — одна
 * шторка с вариантом сундука.
 *
 * Шапка держится во всех состояниях, кроме полученной награды: подзаголовок схлопывается
 * вместе с ростом сундука, заголовок меняется с предмета на событие. Сцена открытия та же,
 * что у сундуков дня: разгон, вспышка, вылет карточки, «Готово».
 */
const props = defineProps<{
  open: boolean;
  kind: '3days' | 'week';
  state: 'locked' | 'ready' | 'opened' | 'lost';
  ticket: MemberRewardTicketView;
  texts: {
    title: string;
    titleDone: string;
    subtitle: string;
    note: string;
    noteLink?: string;
    close: string;
    done: string;
    revealNote: string;
    link: string;
  };
}>();

const emit = defineEmits<{ close: []; open: []; done: []; link: [] }>();

/** Ширина карточки награды и воздух над ней — сняты с эталона. */
const TICKET_WIDTH = 250;
const ABOVE_TICKET = 51;

const stage = ref<HTMLElement | null>(null);
const bursting = ref(false);
const revealed = ref(false);
const grownHeight = ref(0);
const from = ref({ x: 0, y: 0, scale: 0.2 });
const flash = ref({ x: 0, y: 0 });

const title = computed(() => (revealed.value ? props.texts.titleDone : props.texts.title));

function startOpening(): void {
  if (bursting.value || !stage.value) {
    return;
  }

  const width = Math.min(TICKET_WIDTH, stage.value.clientWidth);

  grownHeight.value = (width * 30) / 22 + ABOVE_TICKET;
  bursting.value = true;
  emit('open');
}

async function reveal(): Promise<void> {
  await nextTick();

  const root = stage.value;
  const chest = root?.querySelector('[data-big-chest-image]');
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
  revealed.value = false;
  bursting.value = false;
  emit('done');
}
</script>

<template>
  <MoleculesNextMemberSheet
    :open="open"
    :title="title"
    :subtitle="texts.subtitle"
    :subtitle-hidden="bursting"
    @close="$emit('close')"
  >
    <div ref="stage" class="relative">
      <MoleculesNextMemberBigChest
        :kind="kind"
        :state="state"
        :note="texts.note"
        :note-link="texts.noteLink"
        :bursting="bursting"
        :opened="revealed"
        :grown-height="grownHeight"
        @open="startOpening"
        @burst="reveal"
        @link="$emit('link')"
      />

      <div class="mt-6" :class="bursting ? 'invisible' : ''">
        <AtomsNextMemberButton size="l" tone="grey" @click="$emit('close')">{{ texts.close }}</AtomsNextMemberButton>
      </div>

      <MoleculesNextMemberRewardReveal
        :revealed="revealed"
        :ticket="ticket"
        :from="from"
        :flash="flash"
        :texts="{ note: texts.revealNote, link: texts.link, done: texts.done }"
        @done="finish"
        @link="$emit('link')"
      />
    </div>
  </MoleculesNextMemberSheet>
</template>
