<script setup lang="ts">
import type { MemberOfficeView } from '~/types/memberView';

/**
 * Карточка офиса: всё, что нужно, чтобы доехать, — адрес, часы, телефон и карта. Серым блоком:
 * раньше офис стоял двумя строками на фоне и читался как начало состава.
 *
 * Имя — модель каталога: «Офис · » тихо, имя жирным и белым. Водитель ищет глазом, куда ехать,
 * и офис выглядит так же, как там, где он его выбирал. Склонять «на Чиланзаре» не будем — имя
 * приходит из базы как есть.
 *
 * Подпись группы внутри карточки — на экране заказа («Где забрать»); в списках офисов
 * при регистрации подпись стоит над списком, и у карточки её нет. Часы, телефон и карта
 * выводятся, только если они есть у офиса.
 */
defineProps<{
  office: MemberOfficeView;
  texts: {
    title?: string;
    map: string;
  };
}>();

defineEmits<{ map: [] }>();
</script>

<template>
  <div class="rounded-[20px] border border-white/9 bg-xb-card px-4 py-3.5">
    <div v-if="texts.title" class="pb-2.5">
      <AtomsNextMemberGroupLabel :label="texts.title" />
    </div>
    <div class="text-[15px] font-normal text-xb-light">
      {{ office.label }} · <b class="font-bold text-xb-text">{{ office.name }}</b>
    </div>
    <div class="mt-0.5 text-[13px] font-light text-xb-grey">{{ office.address }}</div>

    <div v-if="office.hours || office.phone" class="mt-2.5 flex flex-col gap-[7px] text-[14px] font-normal text-xb-secondary">
      <div v-if="office.hours" class="flex items-center gap-[9px]">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true" class="shrink-0">
          <circle cx="12" cy="12" r="8.5" stroke="#8A93A2" stroke-width="1.7" />
          <path d="M12 7.5V12l3 1.8" stroke="#8A93A2" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ office.hours }}
      </div>
      <div v-if="office.phone" class="flex items-center gap-[9px]">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true" class="shrink-0">
          <path
            d="M6.2 4.5h3l1.4 3.4-2 1.4a11 11 0 0 0 5.1 5.1l1.4-2 3.4 1.4v3c0 .8-.7 1.5-1.5 1.4C10.5 17.7 6.3 13.5 4.8 6c-.1-.8.6-1.5 1.4-1.5Z"
            stroke="#8A93A2"
            stroke-width="1.7"
            stroke-linejoin="round"
          />
        </svg>
        {{ office.phone }}
      </div>
    </div>

    <button
      v-if="office.mapUrl"
      type="button"
      class="mt-3.5 flex w-full cursor-pointer border-0 bg-transparent p-0 font-manrope"
      @click="$emit('map')"
    >
      <AtomsNextMemberCardAction :label="texts.map" tone="blue" />
    </button>
  </div>
</template>
