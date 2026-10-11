<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue';
import { formatClock } from '~/utils/format';
import type { ChatFeedItem } from '~/utils/chatFeed';

/**
 * Окно переписки карточек раздела «Заявки» (issue #471, #475) — утопленное, со своей прокруткой,
 * открывается на последнем: по дням, человек слева, сотрудники и бот справа, события — серым
 * текстом по центру, ожидание ответа — циан. Ленту собирает карточка (`~/utils/chatFeed`).
 */
const props = defineProps<{
  items: readonly ChatFeedItem[];
}>();

const windowElement = ref<HTMLElement | null>(null);

const scrollToLast = async (): Promise<void> => {
  await nextTick();

  if (windowElement.value) windowElement.value.scrollTop = windowElement.value.scrollHeight;
};

onMounted(scrollToLast);
watch(() => props.items.length, scrollToLast);
</script>

<template>
  <div
    ref="windowElement"
    class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[14px] bg-web-well px-[18px] pt-4 pb-[18px] inset-ring inset-ring-web-line max-web:max-h-[520px] max-web:min-h-[420px]"
  >
    <template v-for="item in items" :key="item.key">
      <div v-if="item.kind === 'day'" class="self-center pt-1.5 pb-0.5 font-manrope text-[12px] font-semibold text-web-axis">
        {{ item.text }}
      </div>
      <div
        v-else-if="item.kind === 'event'"
        class="self-center py-0.5 text-center font-manrope text-[12px]"
        :class="item.tone === 'waiting' ? 'font-semibold text-web-cyan' : 'font-medium text-web-axis'"
      >
        {{ item.text }}
      </div>
      <div
        v-else
        class="flex max-w-[72%] flex-col gap-[5px] max-web:max-w-[88%]"
        :class="item.message.tone === 'person' ? 'self-start items-start' : 'self-end items-end'"
      >
        <div
          class="rounded-[12px] px-3.5 py-2.5 font-manrope text-[14px] leading-[1.5] break-words whitespace-pre-line"
          :class="{
            'bg-web-raised text-web-text': item.message.tone === 'person',
            'bg-web-cyan/8 text-web-text': item.message.tone === 'employee',
            'text-web-title inset-ring inset-ring-web-line': item.message.tone === 'bot',
          }"
        >
          <span v-if="item.message.kindWord !== null" class="block text-web-grey">{{ item.message.kindWord }}</span>{{ item.message.text }}
        </div>
        <span class="flex items-baseline gap-2 font-manrope text-[12px] font-semibold text-web-grey">
          {{ item.message.author }}<span class="text-[11px] font-medium text-web-axis">{{ formatClock(item.message.createdAt) }}</span>
        </span>
        <span v-if="item.message.failure !== null" class="font-manrope text-[12px] text-web-grey">
          {{ item.message.failure }}
        </span>
      </div>
    </template>
  </div>
</template>
