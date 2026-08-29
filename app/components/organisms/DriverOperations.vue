<script setup lang="ts">
import type { DriverHistoryResponse } from '#shared/types/driver';
import type { LoadState } from '~/types/loadState';

/**
 * История операций по счёту водителя.
 *
 * После неё на вопрос «откуда у водителя столько баллов» отвечают глазами, а не запросом
 * в psql: у каждой строки есть время, причина, ключ идемпотентности, вторая сторона
 * перевода и заказ, если операция за поездку.
 */
defineProps<{
  state: LoadState;
  data: DriverHistoryResponse | null;
  /** Состоит ли человек в программе: пустая история у не участника подписывается иначе. */
  isMember: boolean;
}>();

const emit = defineEmits<{ page: [offset: number] }>();
</script>

<template>
  <MoleculesSectionPanel
    title="История операций"
    note="Каждая операция — перевод между двумя счетами. Направление, вторая сторона и ключ идемпотентности показаны у каждой строки."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем журнал…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Журнал не прочитался. Это отказ запроса, а не пустая история."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.operations.length === 0"
      state="empty"
      :message="
        isMember
          ? 'Операций по счёту нет: журнал по этому человеку пуст.'
          : 'Операций нет — счёта нет, в программе не состоит.'
      "
    />
    <div v-else class="space-y-0">
      <MoleculesPointOperationItem
        v-for="operation in data.operations"
        :key="operation.transferId"
        :operation="operation"
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
