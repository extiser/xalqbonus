<script setup lang="ts">
import { formatDateTime } from '~/utils/format';
import { participantStateLabel } from '~/utils/labels';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';
import type { CampaignParticipantsResponse } from '#shared/types/campaign';

/**
 * Участники акции: имя, позывной, половина, состояние и когда оно сменилось.
 *
 * Фильтры — по половине (когда состав делили) и по состоянию. Листание — `PagerBar`,
 * по 25 строк: за данными ходит страница, компонент отдаёт наверх новое смещение и фильтры.
 */
defineProps<{
  state: LoadState;
  data: CampaignParticipantsResponse | null;
  /** Делили ли состав. Без деления фильтр половины ничего не отсекает и не показывается. */
  splitEnabled: boolean;
}>();

const emit = defineEmits<{ page: [offset: number] }>();

const half = defineModel<string>('half', { required: true });
const participantState = defineModel<string>('participantState', { required: true });

const HALF_OPTIONS: SelectOption[] = [
  { value: 'a', label: 'Половина А' },
  { value: 'b', label: 'Половина Б — контроль' },
];

const STATE_OPTIONS: SelectOption[] = (['invited', 'opened', 'joined', 'declined'] as const).map(
  (value) => ({ value, label: participantStateLabel(value) }),
);

const fullName = (row: CampaignParticipantsResponse['rows'][number]): string =>
  [row.lastName, row.firstName, row.middleName].filter(Boolean).join(' ') || 'Без имени';
</script>

<template>
  <MoleculesSectionPanel title="Участники">
    <div class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-2">
        <label v-if="splitEnabled" class="block">
          <span class="mb-1 block text-sm font-medium text-slate-700">Половина</span>
          <AtomsSelectInput v-model="half" :options="HALF_OPTIONS">
            <option value="">Обе половины</option>
          </AtomsSelectInput>
        </label>
        <label class="block">
          <span class="mb-1 block text-sm font-medium text-slate-700">Состояние</span>
          <AtomsSelectInput v-model="participantState" :options="STATE_OPTIONS">
            <option value="">Все состояния</option>
          </AtomsSelectInput>
        </label>
      </div>

      <MoleculesStateNotice
        v-if="state === 'loading' && !data"
        state="loading"
        message="Читаем участников…"
      />
      <MoleculesStateNotice
        v-else-if="state === 'error'"
        state="error"
        message="Участники не прочитались. Это отказ запроса, а не пустой список."
      />
      <MoleculesStateNotice
        v-else-if="!data || data.total === 0"
        state="empty"
        message="Под этот фильтр участников нет."
      />
      <template v-else>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-sm">
            <thead class="text-xs text-slate-500">
              <tr>
                <th class="py-2 pr-4 font-medium">Водитель</th>
                <th class="py-2 pr-4 font-medium">Позывной</th>
                <th v-if="splitEnabled" class="py-2 pr-4 font-medium">Половина</th>
                <th class="py-2 pr-4 font-medium">Состояние</th>
                <th class="py-2 font-medium">Когда сменилось</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in data.rows" :key="row.personId" class="border-t border-slate-200">
                <td class="py-2 pr-4">
                  <NuxtLink
                    :to="`/drivers/${row.personId}`"
                    class="text-slate-900 underline underline-offset-2 hover:text-slate-600"
                  >
                    {{ fullName(row) }}
                  </NuxtLink>
                </td>
                <td class="py-2 pr-4 text-slate-600">{{ row.callsigns.join(', ') || '—' }}</td>
                <td v-if="splitEnabled" class="py-2 pr-4 text-slate-600">
                  {{ row.half === 'a' ? 'А' : 'Б' }}
                </td>
                <td class="py-2 pr-4 text-slate-900">{{ participantStateLabel(row.state) }}</td>
                <td class="py-2 whitespace-nowrap text-slate-600">
                  {{ formatDateTime(row.changedAt) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <MoleculesPagerBar
          :total="data.total"
          :limit="data.limit"
          :offset="data.offset"
          @change="emit('page', $event)"
        />
      </template>
    </div>
  </MoleculesSectionPanel>
</template>
