<script setup lang="ts">
import type { OfficeFeedEntry, OfficeFeedResponse } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';

/**
 * Лента офиса страницей, новыми вперёд: движения остатков и события произвольных наград
 * вперемешку по времени (issue #175).
 *
 * Движения — истина по остатку, а таблица выше — её кэш: расхождение между ними ловит
 * `make invariants` (docs/decisions.md → «Каталог: заказ — это касса, остаток живёт
 * по офисам»). Поэтому лента стоит под таблицей, а не в отдельном разделе: вопрос «почему
 * остаток такой» задают, глядя на остаток. События произвольных наград встают рядом:
 * движения у них нет, и иначе выданную награду офис не видел бы нигде.
 */
defineProps<{
  state: LoadState;
  data: OfficeFeedResponse | null;
}>();

const emit = defineEmits<{ page: [offset: number] }>();

const entryKey = (entry: OfficeFeedEntry): string =>
  entry.type === 'movement'
    ? `movement:${entry.movement.movementId}`
    : `reward:${entry.reward.rewardId}:${entry.reward.event}`;
</script>

<template>
  <MoleculesSectionPanel
    title="Лента офиса"
    note="Движения остатка — приход, правка руками, резерв и выдача по заказу и награде, снятие резерва — и события наград без товара со склада: вручена, выдана, сгорела."
  >
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем ленту…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Лента не прочиталась. Это отказ запроса, а не отсутствие событий."
    />
    <MoleculesStateNotice
      v-else-if="!data || data.entries.length === 0"
      state="empty"
      message="В этом офисе ещё ничего не происходило."
    />
    <div v-else>
      <template v-for="entry in data.entries" :key="entryKey(entry)">
        <MoleculesStockMovementItem v-if="entry.type === 'movement'" :movement="entry.movement" />
        <MoleculesOfficeRewardEventItem v-else :reward="entry.reward" />
      </template>
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
