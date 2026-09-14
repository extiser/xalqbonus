<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatDate } from '~/utils/format';
import { employeeRoleLabel } from '~/utils/labels';
import type { EmployeeInviteResponse } from '#shared/types/employee';
import type { SelectOption } from '~/types/selectOption';

/**
 * Выпуск приглашения: роль — из тех, что строго ниже своей, — и ссылка один раз.
 *
 * Ссылка показывается, пока её не закрыли, и больше не восстанавливается ниоткуда: в базе
 * лежит только хеш токена. Потерял — выпускается новая, старая отзывается в списке.
 *
 * Какие роли предложить, решает сервер (`invitableRoles`), а не этот компонент: правило
 * «строго ниже» живёт в одном месте.
 */
const props = defineProps<{
  roles: EmployeeInviteResponse['role'][];
  issuing: boolean;
  error: string | null;
  /** Только что выпущенное приглашение. `null` — показывать нечего. */
  issued: EmployeeInviteResponse | null;
}>();

const emit = defineEmits<{
  issue: [role: EmployeeInviteResponse['role']];
  dismiss: [];
}>();

const chosen = ref('');

const roleOptions = computed<SelectOption[]>(() =>
  props.roles.map((role) => ({ value: role, label: employeeRoleLabel(role) })),
);

const submit = (): void => {
  const role = props.roles.find((entry) => entry === chosen.value);

  if (role) {
    emit('issue', role);
  }
};

/**
 * Скопировано ли. Буфер обмена браузер даёт не везде — на странице без https его нет вовсе,
 * — поэтому ссылка стоит на экране текстом и выделяется руками, а кнопка лишь экономит жест.
 */
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');

watch(
  () => props.issued?.inviteId,
  () => {
    copyState.value = 'idle';
  },
);

const copy = async (): Promise<void> => {
  if (!props.issued) {
    return;
  }

  try {
    await navigator.clipboard.writeText(props.issued.link);
    copyState.value = 'copied';
  } catch {
    copyState.value = 'failed';
  }
};

const COPY_LABELS: Record<typeof copyState.value, string> = {
  idle: 'Скопировать',
  copied: 'Скопировано',
  failed: 'Не скопировалось — выделите ссылку',
};
</script>

<template>
  <MoleculesSectionPanel
    title="Пригласить сотрудника"
    note="Приглашать можно роль ниже своей. Ссылка одноразовая, живёт 48 часов и показывается один раз."
  >
    <div class="space-y-4">
      <div v-if="issued" class="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm text-slate-900">
          Ссылка для роли «{{ employeeRoleLabel(issued.role) }}», действует до
          {{ formatDate(issued.expiresAt) }}. Больше её не покажет никто — отправьте сейчас.
        </p>
        <p class="font-mono text-xs break-all text-slate-700 select-all">{{ issued.link }}</p>
        <div class="flex flex-wrap gap-3">
          <AtomsActionButton :label="COPY_LABELS[copyState]" tone="primary" @click="copy" />
          <AtomsActionButton label="Закрыть" @click="emit('dismiss')" />
        </div>
      </div>

      <div class="flex flex-wrap items-end gap-3">
        <label class="block min-w-56 flex-1">
          <span class="mb-1 block text-sm font-medium text-slate-700">Роль</span>
          <AtomsSelectInput v-model="chosen" :options="roleOptions">
            <option value="">Выберите роль</option>
          </AtomsSelectInput>
        </label>
        <AtomsActionButton
          :label="issuing ? 'Выпускаем…' : 'Пригласить'"
          tone="primary"
          :disabled="issuing || chosen === ''"
          @click="submit"
        />
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
