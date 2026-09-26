<script setup lang="ts">
import { computed } from 'vue';
import type { LoadState } from '~/types/loadState';
import type { StaffOfficeView } from '~/types/staffView';

/**
 * Шторка «Сменить» у стойки — `_reference/design/staff/02-desk-office-sheet.html` (issue #250),
 * копия шторки офиса каталога: офисы строками с отметкой и «Ждут выдачи: N», «Выбрать» гранатом
 * и «Отменить» серой. Предупреждения нет: при смене офиса у сотрудника нечего терять — набранный
 * код сбрасывается.
 *
 * Офисы читаются заново при каждом открытии — родитель: число ждущих успевает смениться,
 * а менеджера могли отвязать от офиса, и такого в шторке быть не должно. Пока список читается,
 * строк нет; не прочитался — текст из словаря отказов (`errorText`) и «Повторить».
 *
 * Отметку держит родитель (`selected`): при открытии она на текущем офисе. «Выбрать» гаснет,
 * пока отмечен текущий или не отмечено ничего — менять нечего.
 */
const props = defineProps<{
  open: boolean;
  state: LoadState;
  offices: StaffOfficeView[];
  /** Офис стойки. */
  current: string | null;
  selected: string | null;
  /** Список не прочитался — текст отказа из словаря. */
  errorText: string;
}>();

defineEmits<{ select: [officeId: string]; save: [officeId: string]; cancel: []; retry: [] }>();

const unchanged = computed(() => props.selected === null || props.selected === props.current);
</script>

<template>
  <MoleculesNextMemberSheet
    :open="open"
    title="Выберите офис"
    subtitle="Стойка покажет заказы и награды этого офиса."
    @close="$emit('cancel')"
  >
    <div v-if="state === 'ready'" role="radiogroup" aria-label="Выберите офис" class="flex flex-col gap-2.5">
      <MoleculesNextMemberChoiceRow
        v-for="office in offices"
        :key="office.id"
        :label="office.name"
        :caption="office.address"
        :note="office.awaiting"
        :selected="selected === office.id"
        @select="$emit('select', office.id)"
      />
    </div>
    <MoleculesNextMemberNotice
      v-else-if="state === 'error'"
      state="error"
      :message="errorText"
      retry-label="Повторить"
      @retry="$emit('retry')"
    />

    <template #buttons>
      <AtomsNextMemberButton size="l" tone="garnet" :disabled="unchanged" @click="selected && $emit('save', selected)">
        Выбрать
      </AtomsNextMemberButton>
      <AtomsNextMemberButton size="l" tone="grey" @click="$emit('cancel')">Отменить</AtomsNextMemberButton>
    </template>
  </MoleculesNextMemberSheet>
</template>
