<script setup lang="ts">
import { computed } from 'vue';

/**
 * Поверхность карточки Mini App: рамка, радиус и фон. Полей нет — их ставит содержимое:
 * у строки списка, шапки заказа и офиса они разные.
 *
 * Тон — подсветка: `plain` спокойная, `green` «иди забирай» у заказа, `gold` — всё про награды:
 * подарок на главной, ждущая награда в разделе и на своём экране.
 * Вид влияет только на отсвет подсвеченных тонов: `compact` — карточка в списке (отсвет
 * 7–8 % → 62 %), `full` — шапка экрана заказа и награды, где отсвет глубже (8 % → 68 %). Это два
 * вида по решению, а не расхождение копий: сводить их в один нельзя.
 *
 * `clickable` — карточка целиком кнопка: строка заказа и награды открывает свой экран.
 * `divided` — строки внутри через черту; черту рисует карточка, а не строки: строка не знает,
 * первая она или нет. `dimmed` — погашенная карточка, как сгоревшая награда.
 *
 * Содержимое обрезается по скруглению только у `divided`: строкам списка есть чем вылезти
 * за угол. Остальным обрезка не нужна и не безвредна — под ней Chrome иначе сглаживает
 * SVG-иконки внутри, и шевроны с иконками офиса меняют цвет на пару уровней.
 *
 * Кнопка — `block w-full`: строчный `<button>` сужается по содержимому и добирает
 * снизу отступ строки.
 */
type CardTone = 'plain' | 'green' | 'gold';
type CardVariant = 'compact' | 'full';

const props = withDefaults(
  defineProps<{
    tone: CardTone;
    variant?: CardVariant;
    clickable?: boolean;
    divided?: boolean;
    dimmed?: boolean;
  }>(),
  { variant: 'compact' },
);

defineEmits<{ click: [] }>();

const PLAIN_SURFACE = 'border-white/9 bg-xb-card';

const SURFACES: Record<CardTone, Partial<Record<CardVariant, string>>> = {
  plain: { compact: PLAIN_SURFACE, full: PLAIN_SURFACE },
  green: {
    compact: 'border-[rgba(95,208,138,0.55)] bg-[linear-gradient(180deg,rgba(95,208,138,0.07)_0%,rgba(20,23,29,1)_62%)]',
    full: 'border-[rgba(95,208,138,0.55)] bg-[linear-gradient(180deg,rgba(95,208,138,0.08)_0%,rgba(20,23,29,1)_68%)]',
  },
  gold: {
    compact: 'border-[rgba(255,220,140,0.40)] bg-[linear-gradient(180deg,rgba(255,214,120,0.08)_0%,rgba(20,23,29,1)_62%)]',
    full: 'border-[rgba(255,220,140,0.40)] bg-[linear-gradient(180deg,rgba(255,214,120,0.08)_0%,rgba(20,23,29,1)_68%)]',
  },
};

/**
 * Незаведённое сочетание тона и вида — ошибка, а не карточка без фона: значение для него
 * не подбирается, это вопрос к макету.
 */
const surface = computed(() => {
  const classes = SURFACES[props.tone][props.variant];
  if (!classes) throw new Error(`MemberCard: у тона ${props.tone} нет вида ${props.variant} — вопрос к макету`);
  return classes;
});

const surfaceClasses = computed(() => [
  surface.value,
  props.divided ? 'divide-y divide-white/6 overflow-hidden' : '',
  props.dimmed ? 'opacity-55' : '',
]);
</script>

<template>
  <button
    v-if="clickable"
    type="button"
    class="block w-full cursor-pointer rounded-[20px] border text-left font-manrope text-xb-text"
    :class="surfaceClasses"
    @click="$emit('click')"
  >
    <slot />
  </button>
  <div v-else class="rounded-[20px] border font-manrope text-xb-text" :class="surfaceClasses">
    <slot />
  </div>
</template>
