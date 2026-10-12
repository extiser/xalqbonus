<script setup lang="ts">
/**
 * Подтверждение действия, которое нельзя отменить, — в виде веба (docs/frontend.md →
 * «Подтверждения — свой диалог, браузерных окон нет»). Окно — `MoleculesWebDialog`: Escape, крестик
 * и щелчок мимо окна — отказ. Фокус при открытии — на отказе; действие — алым, если после него
 * что-то пропадает (`danger`).
 *
 * Открытием управляет вызывающий свойством `open`; ответ — событием.
 */
withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    /** Подтверждение что-то теряет. */
    danger?: boolean;
    /** Запрос в пути: подпись действия меняется, повторное нажатие отсекает вызывающий. */
    busy?: boolean;
  }>(),
  { cancelLabel: 'Отмена' },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <MoleculesWebDialog :open="open" :title="title" @close="emit('cancel')">
    <p class="m-0 mt-4 font-manrope text-[15px] leading-[1.5] text-web-title">{{ message }}</p>
    <div class="mt-7 flex items-center justify-end gap-3">
      <AtomsWebActionButton :label="cancelLabel" size="page" variant="quiet" autofocus @click="emit('cancel')" />
      <AtomsWebActionButton
        :label="busy ? 'Подождите…' : confirmLabel"
        size="page"
        :variant="danger ? 'danger' : 'action'"
        @click="emit('confirm')"
      />
    </div>
  </MoleculesWebDialog>
</template>
