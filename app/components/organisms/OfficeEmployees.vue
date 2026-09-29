<script setup lang="ts">
import { computed, ref } from 'vue';
import { employeeRoleLabel } from '~/utils/labels';
import type { OfficeEmployee, OfficeEmployeeCandidate } from '#shared/types/catalog';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';

/**
 * Кто закреплён за офисом.
 *
 * Наверх уходит **весь набор**, а не «добавили такого-то»: ручка заменяет состав целиком,
 * и два вида события — «привязать» и «снять» — означали бы две ручки, из которых вторую
 * однажды забудут позвать.
 *
 * Экраном учёток это не является: здесь ни телефона, ни признаков входа, ни приглашений
 * (issue #120 → «Не делать»). Закрытую учётку закрепить нельзя (issue #257): в выборе её нет,
 * и сервер такую откажет. Уже закреплённая закрытая остаётся в списке с пометкой — её снимают.
 *
 * Кандидаты приходят с сервера уже отобранными — с открытым доступом, своей стороны офиса
 * и строго ниже смотрящего (issue #291); здесь от них отсекаются только уже закреплённые.
 * «Снять» — у тех, кого сервер пометил `removable`: равного и старшего ручка не снимет.
 */
const props = defineProps<{
  employees: OfficeEmployee[];
  /** Учётки, из которых выбирают. `null` — список не приехал. */
  candidates: OfficeEmployeeCandidate[] | null;
  candidatesState: LoadState;
  saving: boolean;
  error: string | null;
  /** Состав только на чтение: ДЕМО ОФИС у того, кто его не правит (issue #212). */
  readonly?: boolean;
  /** Демо-офис: подсказка пустого выбора ведёт в раздел «Демо» (issue #252). */
  officeIsDemo: boolean;
}>();

const emit = defineEmits<{ save: [employeeIds: string[]] }>();

/** Кого выбрали в списке добавления. Пусто — кнопка добавления недоступна. */
const chosen = ref('');

const attachedIds = computed(() => new Set(props.employees.map((employee) => employee.employeeId)));

/**
 * В выборе только незакреплённые: закреплённый второй раз не добавляется. Сторону демо
 * (issue #252) и открытый доступ (issue #257) уже отобрал сервер.
 */
const freeCandidates = computed(() =>
  (props.candidates ?? []).filter((candidate) => !attachedIds.value.has(candidate.employeeId)),
);

const candidateOptions = computed<SelectOption[]>(() =>
  freeCandidates.value.map((account) => ({
    value: account.employeeId,
    label: `${account.fullName} · ${employeeRoleLabel(account.role)}`,
  })),
);

const add = (): void => {
  if (chosen.value === '') {
    return;
  }

  emit('save', [...attachedIds.value, chosen.value]);
  chosen.value = '';
};

const remove = (employeeId: string): void => {
  emit('save', [...attachedIds.value].filter((id) => id !== employeeId));
};
</script>

<template>
  <MoleculesSectionPanel
    title="Сотрудники офиса"
    note="Закрепление за офисом — не доступ в систему: доступ решает роль, а это то, где человек стоит."
  >
    <div class="space-y-4">
      <MoleculesStateNotice
        v-if="employees.length === 0"
        state="empty"
        message="За офисом ещё никого не закрепили."
      />
      <ul v-else>
        <li
          v-for="employee in employees"
          :key="employee.employeeId"
          class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-2 first:border-t-0"
        >
          <span class="text-sm text-slate-900">
            {{ employee.fullName }}
            <span class="text-slate-500">· {{ employeeRoleLabel(employee.role) }}</span>
            <span v-if="employee.disabled" class="text-slate-500">
              · доступ закрыт
            </span>
          </span>
          <AtomsActionButton
            v-if="!readonly && employee.removable"
            label="Снять"
            tone="danger"
            :disabled="saving"
            @click="remove(employee.employeeId)"
          />
        </li>
      </ul>

      <div v-if="!readonly" class="border-t border-slate-200 pt-4">
        <MoleculesStateNotice
          v-if="candidatesState === 'loading'"
          state="loading"
          message="Читаем список учёток…"
        />
        <MoleculesStateNotice
          v-else-if="candidatesState === 'error'"
          state="error"
          message="Список учёток не прочитался. Это отказ запроса, а не отсутствие сотрудников."
        />
        <MoleculesStateNotice
          v-else-if="freeCandidates.length === 0"
          state="empty"
          :message="
            officeIsDemo
              ? 'Свободных демо-сотрудников нет: демо-менеджер заводится в разделе «Демо».'
              : 'Свободных учёток нет: все сотрудники ниже вашей роли с открытым доступом уже закреплены.'
          "
        />
        <div v-else class="flex flex-wrap items-end gap-3">
          <label class="block min-w-56 flex-1">
            <span class="mb-1 block text-sm font-medium text-slate-700">Добавить сотрудника</span>
            <AtomsSelectInput v-model="chosen" :options="candidateOptions">
              <option value="">Выберите учётную запись</option>
            </AtomsSelectInput>
          </label>
          <AtomsActionButton
            label="Закрепить"
            tone="primary"
            :disabled="saving || chosen === ''"
            @click="add"
          />
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
