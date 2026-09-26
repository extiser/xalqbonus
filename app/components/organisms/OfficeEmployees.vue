<script setup lang="ts">
import { computed, ref } from 'vue';
import { employeeRoleLabel } from '~/utils/labels';
import type { OfficeEmployee } from '#shared/types/catalog';
import type { EmployeeAccount } from '#shared/types/employee';
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
 * (issue #120 → «Не делать»). Выключенная учётка помечена словом — закрепить её можно,
 * но видно, что человек в систему не войдёт.
 */
const props = defineProps<{
  employees: OfficeEmployee[];
  /** Учётки, из которых выбирают. `null` — список не приехал. */
  accounts: EmployeeAccount[] | null;
  accountsState: LoadState;
  saving: boolean;
  error: string | null;
  /** Состав только на чтение: ДЕМО ОФИС у того, кто его не правит (issue #212). */
  readonly?: boolean;
}>();

const emit = defineEmits<{ save: [employeeIds: string[]] }>();

/** Кого выбрали в списке добавления. Пусто — кнопка добавления недоступна. */
const chosen = ref('');

const attachedIds = computed(() => new Set(props.employees.map((employee) => employee.employeeId)));

/** В выборе только незакреплённые: закреплённый второй раз не добавляется. */
const candidates = computed(() =>
  (props.accounts ?? []).filter((account) => !attachedIds.value.has(account.employeeId)),
);

/**
 * Подписи вариантов собирает экран, а не поле: «доступ закрыт» рядом с именем — то, что
 * должен знать закрепляющий, и поле про это ничего не знает.
 */
const candidateOptions = computed<SelectOption[]>(() =>
  candidates.value.map((account) => ({
    value: account.employeeId,
    label: `${account.fullName} · ${employeeRoleLabel(account.role)}${
      account.disabled ? ' · доступ закрыт' : ''
    }`,
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
          </span>
          <AtomsActionButton
            v-if="!readonly"
            label="Снять"
            tone="danger"
            :disabled="saving"
            @click="remove(employee.employeeId)"
          />
        </li>
      </ul>

      <div v-if="!readonly" class="border-t border-slate-200 pt-4">
        <MoleculesStateNotice
          v-if="accountsState === 'loading'"
          state="loading"
          message="Читаем список учёток…"
        />
        <MoleculesStateNotice
          v-else-if="accountsState === 'error'"
          state="error"
          message="Список учёток не прочитался. Это отказ запроса, а не отсутствие сотрудников."
        />
        <MoleculesStateNotice
          v-else-if="candidates.length === 0"
          state="empty"
          message="Свободных учёток нет: все заведённые сотрудники уже закреплены."
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
