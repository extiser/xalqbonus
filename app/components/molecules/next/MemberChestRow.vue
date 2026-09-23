<script setup lang="ts">
import { computed } from 'vue';
import type { MemberChestRowView } from '~/types/memberView';

/**
 * Строка сундука на экране участника — `product/design/comeback/03-member-chests-states.html`.
 *
 * Здесь сундуки показывают состояние, а не условия: что уже ваше, чего ещё нет. Строка
 * со стрелкой, а не кнопка — кнопка на экране одна, в дневной цели, и двух золотых кнопок
 * разом быть не должно.
 *
 * Есть что открыть — золотом прямо на строке, счётчик собранного справа тогда убран:
 * два числа в одной строке читаются как одно. Ваш — гранатовой рамкой, а не галочкой:
 * галочка в ряду из трёх читается как «готово». Уже не набрать — строка гаснет, но остаётся:
 * пропавшая награда выглядит как обман. Главный приз недели — имя золотом.
 */
const props = defineProps<{ chest: MemberChestRowView }>();

defineEmits<{ open: [] }>();

const IMAGE_SUFFIX: Record<MemberChestRowView['image'], string> = {
  closed: '',
  ajar: '-ajar',
  open: '-open',
};

const STATE_CLASSES: Record<MemberChestRowView['state'], string> = {
  idle: 'bg-xb-card',
  hot: 'bg-[linear-gradient(135deg,rgba(247,188,62,0.13)_0%,rgba(247,188,62,0.04)_70%,rgba(247,188,62,0)_100%)] shadow-[inset_0_0_0_1px_rgba(247,188,62,0.38)]',
  mine: 'bg-[rgba(232,54,93,0.08)] shadow-[inset_0_0_0_1px_rgba(232,54,93,0.35)]',
  cold: 'bg-xb-card opacity-45',
};

const image = computed(() => `/design/chest-${props.chest.kind}${IMAGE_SUFFIX[props.chest.image]}.png`);
const nameClass = computed(() => (props.chest.prize && props.chest.state !== 'cold' ? 'text-xb-gold' : 'text-xb-text'));
</script>

<template>
  <button
    type="button"
    class="relative flex w-full cursor-pointer items-center gap-3 rounded-[18px] border-0 px-4 py-3.5 text-left font-manrope"
    :class="STATE_CLASSES[chest.state]"
    @click="$emit('open')"
  >
    <img
      :src="image"
      alt=""
      class="-my-1 size-[52px] shrink-0 object-contain"
      :class="chest.state === 'cold' ? 'grayscale-[0.7]' : ''"
    >
    <span class="min-w-0 grow">
      <span class="block text-[15px] font-semibold" :class="nameClass">{{ chest.name }}</span>
      <span
        class="mt-[3px] block text-[11px]"
        :class="chest.state === 'hot' ? 'font-semibold text-xb-gold' : 'font-normal text-xb-grey'"
      >
        {{ chest.condition }}
      </span>
    </span>
    <span v-if="chest.count && chest.state !== 'hot'" class="mr-1.5 shrink-0 text-[13px] font-normal text-xb-secondary">{{ chest.count }}</span>
    <AtomsNextMemberChevron :tone="chest.state === 'hot' ? 'amber' : 'muted'" :size="18" />
  </button>
</template>
