<script setup lang="ts">
/**
 * Вариант выбора в шторке — строка с кружком-отметкой справа.
 *
 * Выбранный — рамкой и отметкой, без заливки цветом: гранат в шторке занят кнопкой
 * «Сохранить», и второй гранатовый блок спорил бы с ней.
 *
 * Два вида по содержимому. Язык — одно название 16/600, у невыбранного тише. Офис
 * в каталоге (`_reference/design/catalog/catalog-office-sheet.html`, `.opt`) — имя по роли
 * «Офис в каталоге»: «Офис · » 16/400 серым, имя 16/700 белым, и адрес второй строкой;
 * строка выше, 64 вместо 56. Цвет текста офиса от выбора не меняется — выбор держат
 * рамка и отметка.
 *
 * Офис в шторке «Где заберёте?» (`catalog-pick-office.html`, `.opt .stock`) — ещё и остаток
 * нажатого товара пилюлей справа от адреса, перед отметкой (issue #234).
 */
defineProps<{
  label: string;
  selected: boolean;
  /** Подпись перед именем: «Офис». Есть — имя пишется моделью «Офис · **имя**». */
  prefix?: string;
  /** Вторая строка под именем: адрес офиса. */
  caption?: string;
  /** Пилюля справа, перед отметкой: остаток товара в офисе, «5 шт». */
  stock?: string;
}>();

defineEmits<{ select: [] }>();
</script>

<template>
  <button
    type="button"
    role="radio"
    :aria-checked="selected"
    class="box-border flex w-full cursor-pointer items-center gap-3 rounded-[16px] border px-[18px] text-left font-manrope text-[16px] transition-colors duration-150"
    :class="[selected ? 'border-white/30 bg-white/6' : 'border-white/9 bg-white/3', caption ? 'min-h-16 py-2.5' : 'min-h-14']"
    @click="$emit('select')"
  >
    <span v-if="prefix || caption" class="min-w-0 grow">
      <span v-if="prefix" class="font-normal text-xb-light">{{ prefix }} · <b class="font-bold text-xb-text">{{ label }}</b></span>
      <span v-else class="font-semibold text-xb-text">{{ label }}</span>
      <span v-if="caption" class="mt-0.5 block text-[13px] font-light text-xb-grey">{{ caption }}</span>
    </span>
    <span v-else class="grow font-semibold" :class="selected ? 'text-xb-text' : 'text-xb-secondary'">{{ label }}</span>
    <span
      v-if="stock"
      class="h-6 shrink-0 whitespace-nowrap rounded-full bg-white/8 px-[9px] text-[12px] font-semibold leading-6 text-[#E4E8EE]"
    >
      {{ stock }}
    </span>
    <span
      class="box-border flex size-[22px] shrink-0 items-center justify-center rounded-full"
      :class="selected ? 'bg-xb-text' : 'border-[1.5px] border-white/22'"
      aria-hidden="true"
    >
      <svg v-if="selected" viewBox="0 0 24 24" width="14" height="14" fill="none">
        <path d="M5 12.5l4.5 4.5L19 7.5" stroke="#0B0D11" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </span>
  </button>
</template>
