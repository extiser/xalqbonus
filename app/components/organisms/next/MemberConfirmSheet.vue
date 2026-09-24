<script setup lang="ts">
import type { MemberCartLineView } from '~/types/memberView';

/**
 * Шторка «Проверьте заказ» — `_reference/design/catalog/catalog-confirm.html`, состояния —
 * `catalog-confirm-states.html`.
 *
 * Шторкой поверх витрины, как смена офиса: водитель не уходит со страницы, и «Отменить»
 * возвращает к той же корзине. Под заголовком — где забирать: офис по роли «Офис в каталоге»
 * и адрес. Состав — как на экране заказа, только количество меняется прямо здесь: тихий
 * счётчик под названием (Руслан, 23-09-2026). До нуля — строка уходит из заказа; ушла последняя —
 * шторка закрывается. Это решает страница, шторка отдаёт нажатия.
 *
 * Оговорка про списание — над кнопками плашкой золотого тона: водитель привык «платить при
 * получении» и должен узнать до нажатия; это важно, но не ошибка.
 *
 * Пока заказ оформляется (`busy`), «Оформить заказ» ждёт с кольцом, а «Отменить» гаснет —
 * водитель не уйдёт из шторки, пока заказ создаётся. Отказ — текстом алым мягким над кнопками,
 * кнопки остаются: исправить можно, не уходя.
 */
withDefaults(
  defineProps<{
    open: boolean;
    office: { label: string; name: string; address: string };
    lines: MemberCartLineView[];
    /** «Сумма» числом: «2 310». */
    total: string;
    busy?: boolean;
    /** Текст отказа оформления. */
    error?: string;
    texts: {
      title: string;
      total: string;
      note: string;
      place: string;
      cancel: string;
      decrease: string;
      increase: string;
    };
  }>(),
  { busy: false, error: undefined },
);

defineEmits<{ inc: [lineId: string]; dec: [lineId: string]; place: []; cancel: [] }>();
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" @close="!busy && $emit('cancel')">
    <template #subtitle>
      <!-- Кегль 15 у блока — высота строки офиса, как у `.office` в макете: 21, а не 22 -->
      <div class="text-[15px]">
        <MoleculesNextMemberOfficeLine :label="office.label" :name="office.name" />
      </div>
      <div class="mt-0.5 text-[13px] font-light text-xb-grey">{{ office.address }}</div>
    </template>

    <MoleculesNextMemberOrderLines :lines="lines" :total="total" :texts="{ total: texts.total }">
      <template #line="{ line }">
        <AtomsNextMemberQtyStepper
          size="line"
          :count="line.count"
          :label="line.quantity"
          :max="line.available"
          :texts="{ decrease: texts.decrease, increase: texts.increase }"
          @inc="$emit('inc', line.id)"
          @dec="$emit('dec', line.id)"
        />
      </template>
    </MoleculesNextMemberOrderLines>

    <p class="m-0 mt-4 rounded-[14px] border border-[rgba(247,188,62,0.22)] bg-[rgba(247,188,62,0.08)] px-3.5 py-3 text-[14px] font-normal leading-[1.45] text-xb-gold-light">
      {{ texts.note }}
    </p>

    <p v-if="error" class="m-0 mt-3.5 px-1 text-center text-[14px] font-normal leading-[1.45] text-xb-scarlet-soft">{{ error }}</p>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :busy="busy" @click="$emit('place')">{{ texts.place }}</AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" :disabled="busy" @click="$emit('cancel')">{{ texts.cancel }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
