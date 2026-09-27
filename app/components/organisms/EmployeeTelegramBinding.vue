<script setup lang="ts">
import { formatDateTime } from '~/utils/format';
import type { EmployeeLiveLink } from '#shared/types/employee';
import type { LoadState } from '~/types/loadState';

/**
 * Привязка Telegram — блок страницы `/password` (issue #267).
 *
 * Telegram нужен сотруднику, чтобы его приложение открывалось в боте. Привязывается он потом
 * и по желанию — ссылкой на бота, которую вошедший выпускает себе сам: бот возьмёт
 * идентификатор из подписанного апдейта, руками он не вводится нигде. Живая ссылка
 * показывается и при повторном открытии страницы.
 */
defineProps<{
  state: LoadState;
  bound: boolean;
  link: EmployeeLiveLink | null;
  issuing: boolean;
  error: string | null;
}>();

const emit = defineEmits<{ issue: [] }>();
</script>

<template>
  <MoleculesSectionPanel title="Telegram">
    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем привязку…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Привязка не прочиталась. Это отказ запроса, а не отсутствие Telegram."
    />
    <p v-else-if="bound" class="text-sm text-slate-900">
      Telegram привязан: приложение сотрудника открывается в боте.
    </p>
    <div v-else class="space-y-4">
      <p class="text-sm text-slate-900">Telegram не привязан.</p>

      <div v-if="link" class="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
        <p class="text-sm text-slate-900">
          Откройте ссылку в Telegram, к которому хотите привязать учётную запись. Действует до
          {{ formatDateTime(link.expiresAt) }}.
        </p>
        <MoleculesCopyableLink :link="link.link">
          <template #actions>
            <a
              :href="link.link"
              target="_blank"
              rel="noopener"
              class="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium whitespace-nowrap text-slate-700 transition-colors hover:border-slate-400 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            >
              Открыть в Telegram
            </a>
          </template>
        </MoleculesCopyableLink>
      </div>

      <AtomsActionButton
        :label="issuing ? 'Выпускаем…' : link ? 'Выпустить новую ссылку' : 'Привязать Telegram'"
        :tone="link ? 'secondary' : 'primary'"
        :disabled="issuing"
        @click="emit('issue')"
      />

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>
  </MoleculesSectionPanel>
</template>
