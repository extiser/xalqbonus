<script setup lang="ts">
import { computed } from 'vue';
import type { MemberCatalogOfficeView } from '~/types/memberView';

/**
 * Шторка выбора офиса каталога. Три случая, заголовок и кнопку ставит страница:
 * - «Где заберёте товары?» со «Сохранить» — смена офиса со строки «Сменить»
 *   (`_reference/design/catalog/catalog-office-sheet.html`);
 * - «Где заберёте?» с «Добавить в корзину» — первый «+» в каталоге без офиса: только офисы,
 *   где товар есть, у каждого его остаток (`catalog-pick-office.html`, issue #234);
 * - «Где заберёте?» с «Выбрать» — ссылка «Выбрать» в строке офиса: все офисы, без остатков.
 *
 * Отдельной страницы выбора офиса нет: офис выбирается этой шторкой поверх витрины (Руслан,
 * 23-09-2026). Устроена как шторка языка: офисы строками с отметкой, отметка ставится нажатием
 * и ничего не сохраняет.
 *
 * Кнопка сохранения гаснет, пока отмечен текущий офис или не отмечено ничего — менять нечего.
 * Если отмечен другой офис, а в корзине что-то есть, над кнопками алым мягким — что корзина
 * очистится: говорится до «Сохранить», чтобы не удивлять после. «Отменить» уходит без изменений.
 *
 * Тем же местом и видом — `notice`: товар в отмеченном офисе закончился, пока выбирали
 * (`catalog-pick-office-sold-out.html`), или витрина офиса не прочиталась. Пока страница
 * проверяет офис (`busy`), кнопка сохранения ждёт с кольцом, а «Отменить» и Escape не закрывают:
 * запрос уже ушёл.
 *
 * Отметку держит страница (`selected`): при выборе её нет, при смене она встаёт на текущий
 * офис, и шторка только сообщает, куда нажали.
 */
const props = defineProps<{
  open: boolean;
  offices: MemberCatalogOfficeView[];
  /** Офис витрины. Нет — офис ещё не выбран. */
  current: string | null;
  /** Отмеченный офис. */
  selected: string | null;
  /** В корзине что-то есть. */
  cartFilled: boolean;
  /** Офис проверяется: кнопка сохранения ждёт с кольцом, закрыть шторку нельзя. */
  busy?: boolean;
  /** Строка алым мягким над кнопками: товар закончился, витрина не прочиталась. */
  notice?: string;
  texts: {
    title: string;
    subtitle: string;
    /** Подпись перед именем: «Офис». */
    office: string;
    warning: string;
    save: string;
    cancel: string;
  };
}>();

const emit = defineEmits<{ select: [officeId: string]; save: [officeId: string]; cancel: [] }>();

const cancel = (): void => {
  if (!props.busy) {
    emit('cancel');
  }
};

const unchanged = computed(() => props.selected === null || props.selected === props.current);
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" :subtitle="texts.subtitle" @close="cancel">
    <div role="radiogroup" :aria-label="texts.title" class="flex flex-col gap-2.5">
      <MoleculesNextMemberChoiceRow
        v-for="office in offices"
        :key="office.id"
        :label="office.name"
        :prefix="texts.office"
        :caption="office.address"
        :stock="office.stock"
        :selected="selected === office.id"
        @select="$emit('select', office.id)"
      />
    </div>

    <p v-if="notice || (!unchanged && cartFilled)" class="m-0 mt-4 px-1 text-center text-[14px] font-normal leading-[1.45] text-xb-scarlet-soft">
      {{ notice ?? texts.warning }}
    </p>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :disabled="unchanged" :busy="busy" @click="selected && $emit('save', selected)">
        {{ texts.save }}
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" :disabled="busy" @click="cancel">{{ texts.cancel }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
