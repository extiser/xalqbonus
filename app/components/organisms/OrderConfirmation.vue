<script setup lang="ts">
import type { MemberOffice, MemberOrderLine, MemberOrderTexts } from '#shared/types/miniapp';

/**
 * Подтверждение перед оформлением: офис, состав, сумма и оговорка про списание.
 *
 * Оговорка стоит над кнопкой, а не мелким шрифтом под ней: баллы уходят в момент оформления,
 * а не на стойке, и водитель, привыкший «платить при получении», должен узнать это до нажатия.
 */
defineProps<{
  office: MemberOffice;
  lines: MemberOrderLine[];
  total: number;
  placing: boolean;
  /** Отказ оформления на языке водителя. Кнопки остаются: исправить можно, не уходя. */
  errorMessage: string | null;
  texts: MemberOrderTexts;
}>();

defineEmits<{ place: []; edit: [] }>();
</script>

<template>
  <section class="flex flex-col gap-5">
    <header class="flex flex-col gap-0.5">
      <h1 class="text-2xl font-semibold">{{ texts.confirmTitle }}</h1>
      <p class="text-base font-medium text-slate-700">{{ office.name }}</p>
      <p class="text-sm text-slate-500">{{ office.address }}</p>
    </header>

    <MoleculesOrderLineList
      :lines="lines"
      :total="total"
      :total-label="texts.cartTotal"
      :points-unit="texts.points"
      :pieces-unit="texts.pieces"
    />

    <p class="rounded-2xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
      {{ texts.confirmNote }}
    </p>

    <p v-if="errorMessage" class="text-sm leading-relaxed text-red-700">{{ errorMessage }}</p>

    <div class="flex flex-col gap-2">
      <AtomsMiniAppButton
        :label="texts.placeOrder"
        :disabled="placing || lines.length === 0"
        @click="$emit('place')"
      />
      <AtomsMiniAppButton variant="secondary" :label="texts.editOrder" @click="$emit('edit')" />
    </div>
  </section>
</template>
