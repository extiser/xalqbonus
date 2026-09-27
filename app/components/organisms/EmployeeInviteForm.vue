<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatDateTime } from '~/utils/format';
import { employeeRoleLabel } from '~/utils/labels';
import { EMPLOYEE_NAME_MAX_LENGTH } from '#shared/employee';
import type { InviteIssueField } from '#shared/employeeLinks';
import { formatPhone } from '#shared/phone';
import type { EmployeeInviteRequestBody, EmployeeInviteResponse } from '#shared/types/employee';
import type { SelectOption } from '~/types/selectOption';

/**
 * Выпуск приглашения (issue #267): имя, телефон и роль — из тех, что строго ниже своей, —
 * и ссылка на страницу веба, где приглашённый задаст пароль.
 *
 * Выпущенная ссылка показывается сразу и остаётся видна в списке живых приглашений, пока
 * приглашение живо: её можно скопировать и позже.
 *
 * Какие роли предложить, решает сервер (`invitableRoles`), а не этот компонент: правило
 * «строго ниже» живёт в одном месте. Годятся ли имя и телефон — тоже: отказ приходит с полем,
 * к которому он относится.
 */
const props = defineProps<{
  roles: EmployeeInviteResponse['role'][];
  issuing: boolean;
  /** Отказ, отнесённый к полю формы. */
  fieldError: { field: InviteIssueField; message: string } | null;
  /** Отказ не про поле. */
  error: string | null;
  /** Только что выпущенное приглашение. `null` — показывать нечего. */
  issued: EmployeeInviteResponse | null;
}>();

const emit = defineEmits<{
  issue: [request: EmployeeInviteRequestBody];
  dismiss: [];
}>();

const fullName = ref('');
const phone = ref('');
const chosen = ref('');

const roleOptions = computed<SelectOption[]>(() =>
  props.roles.map((role) => ({ value: role, label: employeeRoleLabel(role) })),
);

const NAME_HINT = `Так сотрудник будет виден в списке и в журнале. До ${EMPLOYEE_NAME_MAX_LENGTH} знаков.`;
const PHONE_HINT = 'Логин для входа. Любой номер: СМС не отправляем.';

const errorFor = (field: InviteIssueField): string | null =>
  props.fieldError?.field === field ? props.fieldError.message : null;

const submit = (): void => {
  const role = props.roles.find((entry) => entry === chosen.value);

  if (role) {
    emit('issue', { role, fullName: fullName.value, phone: phone.value });
  }
};

// Форма очищается, когда ссылка выпущена: следующее приглашение — другому человеку.
watch(
  () => props.issued?.inviteId,
  (inviteId) => {
    if (inviteId) {
      fullName.value = '';
      phone.value = '';
      chosen.value = '';
    }
  },
);
</script>

<template>
  <MoleculesSectionPanel
    title="Пригласить сотрудника"
    note="Приглашать можно роль ниже своей. Ссылка одноразовая и живёт 48 часов; пока жива, её можно скопировать в списке ниже."
  >
    <div class="space-y-4">
      <div v-if="issued" class="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm text-slate-900">
          Ссылка для «{{ issued.fullName }}», {{ formatPhone(issued.phoneE164).display }}, роль
          «{{ employeeRoleLabel(issued.role) }}». Действует до {{ formatDateTime(issued.expiresAt) }}.
        </p>
        <MoleculesCopyableLink :link="issued.link">
          <template #actions>
            <AtomsActionButton label="Закрыть" @click="emit('dismiss')" />
          </template>
        </MoleculesCopyableLink>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="grid gap-4 sm:grid-cols-2">
          <MoleculesFormField
            v-model="fullName"
            label="Имя"
            type="text"
            autocomplete="off"
            :hint="NAME_HINT"
            :error="errorFor('fullName')"
            required
          />
          <MoleculesFormField
            v-model="phone"
            label="Телефон"
            type="tel"
            autocomplete="off"
            placeholder="+998 90 123 45 67"
            :hint="PHONE_HINT"
            :error="errorFor('phone')"
            required
          />
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <label class="block min-w-56 flex-1">
            <span class="mb-1 block text-sm font-medium text-slate-700">Роль</span>
            <AtomsSelectInput v-model="chosen" :options="roleOptions" required>
              <option value="">Выберите роль</option>
            </AtomsSelectInput>
          </label>
          <AtomsSubmitButton :label="issuing ? 'Выпускаем…' : 'Пригласить'" :disabled="issuing" />
        </div>
      </form>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
