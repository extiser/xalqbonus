<script setup lang="ts">
/**
 * Круглая кнопка со значком: аватар и обновление в шапке главной, «назад» в шапке раздела,
 * глазик у номера ВУ.
 *
 * Круг с подложкой, а не голый значок: на списке, уходящем под шапку, голая стрелка
 * теряется среди строк. Размер по месту: 44 — шапка главной, 40 — шапка раздела
 * (палец попадает, и кнопка не спорит по весу с заголовком), 32 — внутри строки.
 *
 * Значок приходит слотом, подпись для экранного чтеца — свойством: на экране слов нет.
 *
 * `done` — действие только что сработало: подложка зеленеет. Кнопка копирования
 * в «Покажите менеджеру» горит так полторы секунды после нажатия, значок в ней на это время
 * сменяется галочкой — слов «скопировано» на экране нет.
 */
type IconButtonSize = 'l' | 'm' | 's';

defineProps<{
  label: string;
  size: IconButtonSize;
  done?: boolean;
}>();

defineEmits<{ click: [] }>();

const SIZE_CLASSES: Record<IconButtonSize, string> = {
  l: 'size-11',
  m: 'size-10',
  s: 'size-8',
};
</script>

<template>
  <button
    type="button"
    :aria-label="label"
    class="relative flex shrink-0 cursor-pointer items-center justify-center rounded-full border-0 p-0 text-[#B4BCC8]"
    :class="[SIZE_CLASSES[size], done ? 'bg-[rgba(95,208,138,0.16)]' : 'bg-white/7']"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>
