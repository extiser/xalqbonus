<script setup lang="ts">
import { computed } from 'vue';

/**
 * Подсказка под строкой офиса — `_reference/design/catalog/catalog-office-picked.html`, `.tip`
 * (issue #234).
 *
 * Показывается один раз за заход в каталог, сразу после первого выбора офиса: что на витрине
 * и почему — один заказ, один офис. Цвет — приглушённый гранат из набора: подложка `#2D1B25`
 * (гранат 12 % поверх `#14171D`), рамка гранат 45 %, текст `#E4E8EE`, офис белым жирным,
 * крестик `#FF7089` на гранате 16 %. Золото — цвет наград, в каталоге выбивалось (Руслан,
 * 25-09-2026).
 *
 * Уголок сверху стоит там же, где в макете, — под именем офиса в строке над подсказкой.
 * Где лежит сама подсказка — поверх витрины, не сдвигая её, — решает контейнер.
 *
 * Гаснет плавно (`shown`): прозрачность и подъём на 4 px за 0.2 с. Погашенная не нажимается
 * и выключена из чтения. Когда гаснуть, решает страница — крестик отдаёт `close`.
 */
const props = defineProps<{
  shown: boolean;
  /** Текст словаря с `{office}` на месте имени офиса. */
  text: string;
  /** Имя офиса — белым жирным на месте `{office}`. */
  office: string;
  /** Подпись крестика для экранного чтеца. */
  closeLabel: string;
}>();

defineEmits<{ close: [] }>();

/** Текст до имени офиса и после него. Имени в шаблоне нет — весь текст первой частью. */
const parts = computed(() => {
  const [before = '', ...rest] = props.text.split('{office}');

  return { before, after: rest.join(props.office), hasOffice: rest.length > 0 };
});
</script>

<template>
  <div
    role="note"
    :inert="!shown"
    :aria-hidden="!shown"
    class="member-office-hint relative flex items-start gap-2.5 rounded-[14px] border border-[rgba(232,54,93,0.45)] bg-[#2D1B25] py-3 pl-3.5 pr-3 font-manrope leading-[normal] shadow-[0_14px_34px_-10px_rgba(0,0,0,0.85)]"
    :class="shown ? '' : 'member-office-hint-gone'"
  >
    <span
      class="absolute left-[92px] top-[-7px] size-3 rotate-45 border-l border-t border-[rgba(232,54,93,0.45)] bg-[#2D1B25]"
      aria-hidden="true"
    />
    <span class="grow text-[13px] font-normal leading-[1.45] text-[#E4E8EE]">
      {{ parts.before }}<b v-if="parts.hasOffice" class="font-bold text-white">{{ office }}</b>{{ parts.after }}
    </span>
    <button
      type="button"
      :aria-label="closeLabel"
      class="-mr-0.5 -mt-0.5 flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-[rgba(232,54,93,0.16)] p-0 text-xb-scarlet-soft"
      @click="$emit('close')"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.member-office-hint {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.member-office-hint-gone {
  opacity: 0;
  transform: translateY(-4px);
  pointer-events: none;
}

@media (prefers-reduced-motion: reduce) {
  .member-office-hint {
    transition: none;
  }
}
</style>
