<script setup lang="ts">
import { ref, watch } from 'vue';
import { formatDate, formatDateTime } from '~/utils/format';
import type { DemoInviteSummary, DemoViewerSummary } from '#shared/types/demo';

/**
 * Зрители демо (issue #252): приглашение ссылкой, живые приглашения и список зрителей.
 *
 * Ссылка стоит в строке живого приглашения, пока оно живо, — скопировать её можно в течение
 * суток, а не только в момент выпуска (решение Руслана 27-09-2026). Принятое, отозванное
 * и истёкшее из списка уходят вместе со ссылкой.
 */
const props = defineProps<{
  invites: DemoInviteSummary[];
  viewers: DemoViewerSummary[];
  issuing: boolean;
  issueError: string | null;
  /** Только что выпущенное приглашение — его строка выделена. `null` — выпуска не было. */
  issuedInviteId: string | null;
  /** Приглашение или зритель, над которым идёт действие. */
  busyKey: string | null;
  error: string | null;
}>();

const emit = defineEmits<{
  issue: [label: string];
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

// Подпись очищается, когда ссылка выпущена: следующее приглашение — другому человеку.
watch(
  () => props.issuedInviteId,
  (inviteId) => {
    if (inviteId) {
      label.value = '';
    }
  },
);

type CopyState = 'copied' | 'failed';

/**
 * Скопировано ли — у каждой строки своё. Буфер обмена браузер даёт не везде — на странице
 * без https его нет вовсе, — поэтому ссылка стоит текстом и выделяется руками.
 */
const copyStates = ref<Record<string, CopyState>>({});

const copy = async (invite: DemoInviteSummary): Promise<void> => {
  if (invite.link === null) {
    return;
  }

  try {
    await navigator.clipboard.writeText(invite.link);
    copyStates.value = { ...copyStates.value, [invite.inviteId]: 'copied' };
  } catch {
    copyStates.value = { ...copyStates.value, [invite.inviteId]: 'failed' };
  }
};

const COPY_LABELS: Record<CopyState | 'idle', string> = {
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
    note="Зритель открывает ссылку в Telegram и сразу получает своего демо-водителя. Ссылка одноразовая и живёт сутки; пока приглашение живо, её можно скопировать в его строке."
  >
    <div class="space-y-6">
      <div class="space-y-4">
        <div class="flex flex-wrap items-end gap-3">
          <label class="block min-w-56 flex-1">
            <span class="mb-1 block text-sm font-medium text-slate-700">Кто это</span>
            <AtomsTextInput v-model="label" type="text" placeholder="Например: Xalq Taxi, директор" />
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
            class="space-y-2 border-t border-slate-200 py-3 first:border-t-0"
            :class="{ 'rounded-md border border-amber-200 bg-amber-50 px-3': invite.inviteId === issuedInviteId }"
          >
            <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <span class="text-sm text-slate-900">
                {{ invite.label }}
                <span class="text-slate-500">· до {{ formatDateTime(invite.expiresAt) }}</span>
              </span>
              <div class="flex flex-wrap gap-3">
                <AtomsActionButton
                  v-if="invite.link !== null"
                  :label="COPY_LABELS[copyStates[invite.inviteId] ?? 'idle']"
                  tone="primary"
                  @click="copy(invite)"
                />
                <AtomsActionButton
                  label="Отозвать"
                  tone="danger"
                  :disabled="busyKey === invite.inviteId"
                  @click="emit('revoke', invite.inviteId)"
                />
              </div>
            </div>
            <p v-if="invite.link !== null" class="font-mono text-xs break-all text-slate-700 select-all">
              {{ invite.link }}
            </p>
            <p v-else class="text-xs text-slate-500">
              Ссылки нет: приглашение выпущено до того, как ссылки стали хранить, или бот не ответил.
            </p>
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
