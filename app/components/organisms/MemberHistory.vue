<script setup lang="ts">
import { computed } from 'vue';
import type { MemberOperation, MemberScreenTexts } from '#shared/types/miniapp';
import type { LoadState } from '~/types/loadState';

/**
 * История операций водителя, сгруппированная по дням.
 *
 * У активного водителя за день десять-двадцать записей, и без разделителя это сплошная
 * лента, в которой не найти нужный день. Сегодняшний и вчерашний подписаны словами —
 * водитель ищет вчерашнюю поездку, а не поездку от одиннадцатого числа (issue #101).
 *
 * Подписи дней приходят с сервера готовыми: день считается в зоне парка, а телефон бывает
 * в чужой, и разделитель, поставленный по часам телефона, разрезал бы сутки не там.
 */
const props = defineProps<{
  /** Состояние первой страницы: загрузка, отказ, готово. */
  state: LoadState;
  operations: MemberOperation[];
  /** Есть ли следующая страница. Ложь — кнопки нет вовсе. */
  hasMore: boolean;
  /** Догрузка в пути: кнопка гаснет, чтобы второе нажатие не привело ту же страницу дважды. */
  loadingMore: boolean;
  /** Догрузка не удалась. Показанные строки при этом остаются на месте. */
  moreFailed: boolean;
  texts: MemberScreenTexts;
}>();

defineEmits<{ more: [] }>();

/**
 * Строки, разложенные по дням.
 *
 * Идут подряд, поэтому группируются соседством, а не поиском по дате: список отсортирован
 * по времени операции, и второй раз тот же день в нём не встречается.
 */
const groups = computed(() => {
  const result: { day: string; label: string; operations: MemberOperation[] }[] = [];

  for (const operation of props.operations) {
    const current = result.at(-1);

    if (current && current.day === operation.day) {
      current.operations.push(operation);

      continue;
    }

    result.push({ day: operation.day, label: operation.dayLabel, operations: [operation] });
  }

  return result;
});
</script>

<template>
  <section class="flex flex-col">
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="…" />

    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      :message="texts.historyFailed"
    />

    <!-- Пустая история подписывается: у нового участника операций нет ни одной, и голый
         пустой список читается как поломка приложения. -->
    <MoleculesStateNotice
      v-else-if="operations.length === 0"
      state="empty"
      :message="texts.historyEmpty"
    />

    <template v-else>
      <div v-for="group in groups" :key="group.day" class="flex flex-col">
        <h2 class="pt-4 pb-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">
          {{ group.label }}
        </h2>
        <MoleculesMemberOperationItem
          v-for="operation in group.operations"
          :key="operation.id"
          :operation="operation"
        />
      </div>

      <MoleculesStateNotice v-if="moreFailed" state="error" :message="texts.historyFailed" />

      <!-- Кнопкой, а не бесконечной прокруткой: на телефоне она мешает добраться до низа
           экрана, а туда со временем приедут другие разделы приложения. -->
      <div v-if="hasMore" class="pt-4">
        <AtomsMiniAppButton
          variant="secondary"
          :label="texts.showMore"
          :disabled="loadingMore"
          @click="$emit('more')"
        />
      </div>
    </template>
  </section>
</template>
