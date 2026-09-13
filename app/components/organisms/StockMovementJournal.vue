<script setup lang="ts">
import type { StockMovementsResponse } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';

/**
 * Журнал движений офиса страницей, новыми вперёд.
 *
 * Это истина по остатку, а таблица выше — её кэш: расхождение между ними ловит
 * `make invariants` (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
 * по офисам»). Поэтому журнал стоит под таблицей, а не в отдельном разделе: вопрос «почему
 * остаток такой» задают, глядя на остаток.
 */
defineProps<{
  state: LoadState;
  data: StockMovementsResponse | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();
</script>

<template>
  <MoleculesSectionPanel
    title="Журнал движений"
    note="Каждая строка отвечает на вопрос «почему остаток такой»: приход, правка руками, резерв под заказ, выдача, снятие резерва."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем журнал…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Журнал не прочитался. Это отказ запроса, а не отсутствие движений."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.movements.length === 0"
      state="empty"
      message="Движений по этому офису ещё не было."
    />
    <div v-else>
      <MoleculesStockMovementItem
        v-for="movement in data.movements"
        :key="movement.movementId"
        :movement="movement"
      />
      <div class="border-t border-slate-200 pt-3">
        <MoleculesPagerBar
          :total="data.total"
          :limit="data.limit"
          :offset="data.offset"
          @change="emit('page', $event)"
        />
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
