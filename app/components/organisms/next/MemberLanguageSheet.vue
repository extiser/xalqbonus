<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MemberLanguage, MemberLanguageOptionView } from '~/types/memberView';

/**
 * Шторка «Язык» из профиля — `product/design/artboard/language-sheet.html`.
 *
 * Шторка, а не экран: выбор из двух строк, прокрутки и порядка нет. Выбор — отметкой,
 * применяется «Сохранить»; «Закрыть» уходит без изменений. Название языка — на нём самом:
 * узбекоговорящий найдёт «O'zbek», даже если экран сейчас по-русски.
 *
 * «Сохранить» гаснет, пока отмечен текущий язык: сохранять нечего. Отметка — состояние
 * самой шторки, пока она открыта; при каждом открытии она встаёт на текущий язык.
 */
const props = defineProps<{
  open: boolean;
  current: MemberLanguage;
  options: MemberLanguageOptionView[];
  texts: {
    title: string;
    subtitle: string;
    save: string;
    close: string;
  };
}>();

defineEmits<{ save: [language: MemberLanguage]; close: [] }>();

const picked = ref<MemberLanguage>(props.current);

watch(
  () => props.open,
  (open) => {
    if (open) {
      picked.value = props.current;
    }
  },
);
</script>

<template>
  <MoleculesNextMemberSheet :open="open" :title="texts.title" :subtitle="texts.subtitle" @close="$emit('close')">
    <div role="radiogroup" :aria-label="texts.title" class="flex flex-col gap-2.5">
      <MoleculesNextMemberChoiceRow
        v-for="option in options"
        :key="option.language"
        :label="option.label"
        :selected="picked === option.language"
        @select="picked = option.language"
      />
    </div>

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :disabled="picked === current" @click="$emit('save', picked)">
        {{ texts.save }}
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('close')">{{ texts.close }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
