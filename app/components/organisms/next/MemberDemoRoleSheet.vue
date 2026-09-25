<script setup lang="ts">
import { ref, watch } from 'vue';
import type { MemberDemoRole, MemberDemoRoleOptionView } from '~/types/memberView';

/**
 * Шторка «Войти как» — `_reference/design/demo/01-main-screen-demo.html`, `.ds-sheet`
 * (issue #205). Открывается «Сменить» в полосе «Демо-аккаунт».
 *
 * Собрана по образцу шторки языка (`MemberLanguageSheet`): выбор отметкой, текущая роль
 * отмечена при открытии, «Войти» гранатом гаснет, пока отмечена текущая — входить некуда.
 * «Закрыть» серой уходит без изменений; затемнение шторку не закрывает.
 *
 * Пока роль записывается (`busy`), «Войти» ждёт с кольцом; отказ оставляет шторку открытой
 * с тем же выбором, и повтор — тем же нажатием.
 */
const props = withDefaults(
  defineProps<{
    open: boolean;
    current: MemberDemoRole;
    options: MemberDemoRoleOptionView[];
    busy?: boolean;
    texts: {
      title: string;
      subtitle: string;
      enter: string;
      close: string;
    };
  }>(),
  { busy: false },
);

defineEmits<{ enter: [role: MemberDemoRole]; close: [] }>();

const picked = ref<MemberDemoRole>(props.current);

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
        :key="option.role"
        :label="option.label"
        :selected="picked === option.role"
        @select="picked = option.role"
      />
    </div>

    <template #buttons>
      <AtomsNextMemberButton
        size="l"
        tone="garnet"
        :disabled="picked === current"
        :busy="busy"
        @click="$emit('enter', picked)"
      >
        {{ texts.enter }}
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('close')">{{ texts.close }}</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
