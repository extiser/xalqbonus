<script setup lang="ts">
import { computed } from 'vue';
import type { MemberCatalogOfficeView } from '~/types/memberView';

/**
 * Шторка «Где заберёте товары?» — `_reference/design/catalog/catalog-office-sheet.html`, первый
 * вход — `catalog-office-sheet-first.html`.
 *
 * Отдельной страницы выбора офиса нет: и при первом входе, и при смене офис выбирается этой
 * шторкой поверх витрины (Руслан, 23-09-2026). Устроена как шторка языка: офисы строками
 * с отметкой, отметка ставится нажатием и ничего не сохраняет.
 *
 * «Сохранить» гаснет, пока отмечен текущий офис или не отмечено ничего — менять нечего.
 * Если отмечен другой офис, а в корзине что-то есть, над кнопками алым мягким — что корзина
 * очистится: говорится до «Сохранить», чтобы не удивлять после. «Отменить» уходит без
 * изменений; при первом входе — из каталога, это решает страница.
 *
 * Отметку держит страница (`selected`): при первом входе её нет, при смене она встаёт на текущий
 * офис, и шторка только сообщает, куда нажали.
 */
const props = defineProps<{
  open: boolean;
  offices: MemberCatalogOfficeView[];
  /** Офис витрины. Нет — первый вход. */
  current: string | null;
  /** Отмеченный офис. */
  selected: string | null;
  /** В корзине что-то есть. */
  cartFilled: boolean;
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

defineEmits<{ select: [officeId: string]; save: [officeId: string]; cancel: [] }>();

const unchanged = computed(() => props.selected === null || props.selected === props.current);
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" :subtitle="texts.subtitle" @close="$emit('cancel')">
    <div role="radiogroup" :aria-label="texts.title" class="flex flex-col gap-2.5">
      <MoleculesNextMemberChoiceRow
        v-for="office in offices"
        :key="office.id"
        :label="office.name"
        :prefix="texts.office"
        :caption="office.address"
        :selected="selected === office.id"
        @select="$emit('select', office.id)"
      />
    </div>

    <p v-if="!unchanged && cartFilled" class="m-0 mt-4 px-1 text-center text-[14px] font-normal leading-[1.45] text-xb-scarlet-soft">
      {{ texts.warning }}
    </p>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :disabled="unchanged" @click="selected && $emit('save', selected)">
        {{ texts.save }}
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('cancel')">{{ texts.cancel }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
