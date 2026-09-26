<script setup lang="ts">
/**
 * Пустое место или отказ загрузки — вместо списка блока или раздела.
 *
 * Состояния разные и выглядят по-разному: отказ запроса, показанный как пустота, читается
 * как пропавшие баллы или подарок. У отказа есть чем повторить — вторичной кнопкой S,
 * у пустоты повторять нечего.
 *
 * Два размера. `block` — в блоках главной: поля сверху и снизу 30, как в блоках заказов и наград
 * (`_reference/design/home/orders-block.html`, `rewards-block.html`); в истории было 34, сведено
 * к 30 решением Руслана 24-09-2026. `screen` — вместо всего содержимого раздела, под шапкой:
 * поля 72 сверху и 96 снизу (`_reference/design/orders/orders-screen-empty.html`,
 * `rewards-screen-empty.html`), один вид на все экраны — разделы и витрину каталога
 * (Руслан, 24-09-2026). `desk` — под заголовком «Ждут выдачи» у стойки сотрудника: поля 48 сверху
 * и 72 снизу (`_reference/design/staff/02-desk-empty.html`, issue #250).
 */
type NoticeState = 'empty' | 'error';
type NoticeSize = 'block' | 'screen' | 'desk';

const props = withDefaults(
  defineProps<{
    state: NoticeState;
    message: string;
    /** Подпись «Повторить». Нужна только отказу. */
    retryLabel?: string;
    size?: NoticeSize;
  }>(),
  { size: 'block' },
);

defineEmits<{ retry: [] }>();

const SIZE_CLASSES: Record<NoticeSize, string> = {
  block: 'px-5 py-[30px]',
  screen: 'px-7 pb-24 pt-[72px]',
  desk: 'px-7 pb-[72px] pt-12',
};
</script>

<template>
  <div
    class="flex flex-col items-center gap-3 text-center text-[15px] font-light leading-[1.4] text-xb-grey"
    :class="SIZE_CLASSES[props.size]"
  >
    <p class="m-0">{{ message }}</p>
    <AtomsNextMemberButton v-if="state === 'error' && retryLabel" size="s" tone="outline" @click="$emit('retry')">
      {{ retryLabel }}
    </AtomsNextMemberButton>
  </div>
</template>
