<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import type { MemberGiftView } from '~/types/memberView';

/**
 * Шторка подарков — `_reference/design/gifts/main-screen-gift-sheet.html` (один подарок),
 * `main-screen-gifts-sheet.html` (несколько), поведение — `main-screen-gifts-take.html`.
 *
 * Под заголовком — список подарков с «Забрать» у каждого, причина целиком, у подарка с обложкой — она
 * сверху карточки (`main-screen-gift-sheet-cover.html`). «Забрать всё» — при двух и больше. Пока
 * оно ждёт ответа, «Закрыть» погашена и Escape шторку не закрывает.
 *
 * Состояний шторка не хранит: какие подарки ждут ответа, лопаются или не забрались, приходит
 * свойствами. Каждый подарок — свой исход: при «Забрать всё» страница лопает забранные по очереди
 * с шагом 0.48 с, а незабранным даёт их ошибку.
 *
 * Лопается последний — шторка отдаёт `close` сама, вместе с началом его лопания, а не после
 * схлопывания места (решение Руслана 24-09-2026): серпантин долетает поверх главной. Уезжает
 * она обычным выездом `MemberSheet`.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    gifts: MemberGiftView[];
    /** Подарки, которые ждут ответа на «Забрать». */
    busy?: readonly string[];
    /** Забранные — лопаются. */
    popping?: readonly string[];
    /** Незабранные — строка ошибки под карточкой. */
    errors?: Readonly<Record<string, string>>;
    /** «Забрать всё» ждёт ответа. */
    takingAll?: boolean;
    texts: {
      /** «Подарок от Xalq Taxi» или «Подарки от Xalq Taxi» — по числу. */
      title: string;
      subtitle: string;
      take: string;
      takeAll: string;
      close: string;
    };
  }>(),
  { busy: () => [], popping: () => [], errors: () => ({}), takingAll: false },
);

const emit = defineEmits<{ take: [giftId: string]; takeAll: []; close: []; popped: [giftId: string] }>();

/** Шторка уезжает вместе с серпантином последнего подарка. */
const CLOSE_WITH_LAST_MS = 260;

const lastPopping = computed(
  () => props.gifts.length > 0 && props.gifts.every((gift) => props.popping.includes(gift.id)),
);

let closeTimer: ReturnType<typeof setTimeout> | undefined;

watch(lastPopping, (popping) => {
  if (popping && props.open) {
    closeTimer = setTimeout(() => emit('close'), CLOSE_WITH_LAST_MS);
  }
});

onBeforeUnmount(() => clearTimeout(closeTimer));

function close(): void {
  if (!props.takingAll) {
    emit('close');
  }
}
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" :subtitle="texts.subtitle" @close="close">
    <div class="flex flex-col gap-2.5">
      <MoleculesNextMemberGiftCard
        v-for="gift in gifts"
        :key="gift.id"
        :gift="gift"
        mode="take"
        :take-label="texts.take"
        reason-full
        show-cover
        :busy="busy.includes(gift.id)"
        :error="errors[gift.id]"
        :popping="popping.includes(gift.id)"
        @take="emit('take', gift.id)"
        @popped="emit('popped', gift.id)"
      />
    </div>

    <template #buttons>
      <AtomsNextMemberButton v-if="gifts.length >= 2" size="l" tone="gold-calm" :busy="takingAll" @click="emit('takeAll')">
        {{ texts.takeAll }}
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" :disabled="takingAll" @click="close">{{ texts.close }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
