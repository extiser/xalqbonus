<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDate, formatDateTime } from '~/utils/format';
import type { DemoInviteResponse, DemoInviteSummary, DemoViewerSummary } from '#shared/types/demo';

/**
 * Зрители демо (issue #252): приглашение ссылкой, живые приглашения и список зрителей.
 *
 * Ссылка показывается, пока её не закрыли, и больше не восстанавливается ниоткуда — как
 * у приглашения сотрудника (`EmployeeInviteForm.vue`): в базе лежит только хеш токена.
 */
const props = defineProps<{
  invites: DemoInviteSummary[];
  viewers: DemoViewerSummary[];
  issuing: boolean;
  issueError: string | null;
  /** Только что выпущенное приглашение. `null` — показывать нечего. */
  issued: DemoInviteResponse | null;
  /** Приглашение или зритель, над которым идёт действие. */
  busyKey: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  issue: [label: string];
  dismiss: [];
  revoke: [inviteId: string];
  disable: [telegramUserId: string];
  enable: [telegramUserId: string];
}>();

const label = ref('');

const submit = (): void => {
  if (label.value.trim() !== '') {
    emit('issue', label.value);
  }
};

/** Буфер обмена браузер даёт не везде — ссылка стоит на экране текстом и выделяется руками. */
const copyState = ref<'idle' | 'copied' | 'failed'>('idle');

// Подпись очищается, когда ссылка выпущена: следующее приглашение — другому человеку.
watch(
  () => props.issued?.invite.inviteId,
  (inviteId) => {
    copyState.value = 'idle';

    if (inviteId) {
      label.value = '';
    }
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

const ROLE_LABELS: Record<DemoViewerSummary['role'], string> = {
  driver: 'водитель',
  manager: 'менеджер',
};
</script>

<template>
  <MoleculesSectionPanel
    title="Зрители"
    note="Зритель открывает ссылку в Telegram и сразу получает своего демо-водителя. Ссылка одноразовая, живёт сутки и показывается один раз."
  >
    <div class="space-y-6">
      <div class="space-y-4">
        <div v-if="issued" class="space-y-3 rounded-md border border-amber-200 bg-amber-50 p-3">
          <p class="text-sm text-slate-900">
            Ссылка для «{{ issued.invite.label }}», действует до
            {{ formatDate(issued.invite.expiresAt) }}. Больше её не покажет никто — отправьте сейчас.
          </p>
          <p class="font-mono text-xs break-all text-slate-700 select-all">{{ issued.link }}</p>
          <div class="flex flex-wrap gap-3">
            <AtomsActionButton :label="COPY_LABELS[copyState]" tone="primary" @click="copy" />
            <AtomsActionButton label="Закрыть" @click="emit('dismiss')" />
          </div>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <label class="block min-w-56 flex-1">
            <span class="mb-1 block text-sm font-medium text-slate-700">Кто это</span>
            <AtomsTextInput v-model="label" type="text" placeholder="Например: Kapital Taxi, директор" />
          </label>
          <AtomsActionButton
            :label="issuing ? 'Выпускаем…' : 'Пригласить в демо'"
            tone="primary"
            :disabled="issuing || label.trim() === ''"
            @click="submit"
          />
        </div>

        <p v-if="issueError" class="text-sm text-red-700">{{ issueError }}</p>
      </div>

      <div v-if="invites.length > 0" class="border-t border-slate-200 pt-4">
        <h3 class="mb-2 text-sm font-medium text-slate-700">Ждут открытия</h3>
        <ul>
          <li
            v-for="invite in invites"
            :key="invite.inviteId"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-2 first:border-t-0"
          >
            <span class="text-sm text-slate-900">
              {{ invite.label }}
              <span class="text-slate-500">· до {{ formatDateTime(invite.expiresAt) }}</span>
            </span>
            <AtomsActionButton
              label="Отозвать"
              tone="danger"
              :disabled="busyKey === invite.inviteId"
              @click="emit('revoke', invite.inviteId)"
            />
          </li>
        </ul>
      </div>

      <div class="border-t border-slate-200 pt-4">
        <MoleculesStateNotice v-if="viewers.length === 0" state="empty" message="Зрителей пока нет." />
        <ul v-else>
          <li
            v-for="viewer in viewers"
            :key="viewer.telegramUserId"
            class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-200 py-2 first:border-t-0"
          >
            <span class="text-sm text-slate-900">
              {{ viewer.label }}
              <span class="text-slate-500">
                · {{ ROLE_LABELS[viewer.role] }} · с {{ formatDate(viewer.since) }}
              </span>
              <AtomsStatusBadge v-if="viewer.disabled" class="ml-2" tone="muted" label="выключен" />
            </span>
            <AtomsActionButton
              v-if="viewer.disabled"
              label="Включить"
              tone="primary"
              :disabled="busyKey === viewer.telegramUserId"
              @click="emit('enable', viewer.telegramUserId)"
            />
            <AtomsActionButton
              v-else
              label="Выключить"
              tone="danger"
              :disabled="busyKey === viewer.telegramUserId"
              @click="emit('disable', viewer.telegramUserId)"
            />
          </li>
        </ul>
      </div>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
