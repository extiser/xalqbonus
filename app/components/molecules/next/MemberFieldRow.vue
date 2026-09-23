<script setup lang="ts">
/**
 * Поле профиля: подпись слева, значение справа — «Телефон · +998 90 123-45-67».
 *
 * Значение табличными цифрами и чуть в разрядку: менеджер сверяет его знак за знаком с тем,
 * что называет водитель. Значения нет — серым и обычным весом, не алым: это не ошибка.
 *
 * Маска — скрытая часть значения точками (номер ВУ до глазика), рядом — слот `aside`
 * под кнопку, раскрывающую его.
 */
defineProps<{
  label: string;
  value: string;
  /** Значения нет — пишется подпись отсутствия серым. */
  missing?: boolean;
  /** Скрытая часть перед значением: «•••••». */
  mask?: string;
}>();
</script>

<template>
  <div class="flex min-h-[52px] items-center gap-3 px-4">
    <span class="grow text-[15px] font-normal text-xb-grey">{{ label }}</span>
    <!-- Значение и кнопка рядом с ним — одной группой, ближе, чем подпись к значению. -->
    <span class="flex items-center gap-2">
      <span
        class="text-right text-[15px] tabular-nums"
        :class="missing ? 'font-normal text-xb-grey' : 'font-semibold tracking-[0.3px] text-xb-text'"
      >
        <span v-if="mask" class="mr-0.5 tracking-[2px] text-xb-grey">{{ mask }}</span>{{ value }}
      </span>
      <slot name="aside" />
    </span>
  </div>
</template>
