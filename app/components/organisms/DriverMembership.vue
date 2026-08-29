<script setup lang="ts">
import type { DriverCardResponse } from '#shared/types/driver';
import { formatDateTime } from '~/utils/format';
import { languageLabel, sourceLabel } from '~/utils/labels';

/**
 * Участие в программе и канал связи.
 *
 * Граница «известен парку / состоит в программе» проходит по строке настроек участника,
 * а не по договорённости: реестр парка содержит всех, кого знает парк, включая уволенных
 * и никогда не открывавших бота (docs/drivers.md).
 *
 * У не участника раздел пуст, и пустота подписана причиной, а не показана нулями:
 * «не состоит» — содержательный ответ, а не отсутствие данных.
 */
defineProps<{
  card: DriverCardResponse;
}>();
</script>

<template>
  <MoleculesSectionPanel
    title="Участие в программе"
    note="Участие начинается с привязки Telegram. Реестр парка шире программы: в нём есть и уволенные, и те, кто бота не открывал."
  >
    <MoleculesStateNotice
      v-if="!card.membership"
      state="empty"
      message="В программе не состоит: настроек участника нет, счёта нет, баллов нет. Это ответ, а не отсутствие данных."
    />
    <dl v-else class="divide-y divide-slate-100">
      <MoleculesFactRow label="Вступил" :value="formatDateTime(card.membership.joinedAt)" mono />
      <MoleculesFactRow
        label="Откуда участие"
        :value="sourceLabel(card.membership.joinedSource)"
      />
      <MoleculesFactRow label="Язык" :value="languageLabel(card.membership.language)" />
      <MoleculesFactRow
        label="Уведомления"
        :value="card.membership.notificationsEnabled ? 'включены' : 'выключены'"
      />
    </dl>

    <div class="mt-4 border-t border-slate-200 pt-3">
      <h3 class="text-sm font-semibold text-slate-900">Telegram</h3>
      <p class="mt-0.5 text-xs text-slate-400">
        Действующая привязка одна. Закрытые не удаляются: перепривязка — новая строка рядом,
        а не правка на месте.
      </p>
      <MoleculesStateNotice
        v-if="card.telegramLinks.length === 0"
        state="empty"
        :message="
          card.membership
            ? 'Привязки Telegram нет, хотя человек в программе, — такую строку надо разбирать.'
            : 'Привязки Telegram нет: человек в программе не состоит.'
        "
      />
      <div v-else class="mt-2">
        <MoleculesTelegramLinkItem
          v-for="link in card.telegramLinks"
          :key="`${link.telegramChatId}:${link.linkedAt}`"
          :link="link"
        />
      </div>
    </div>
  </MoleculesSectionPanel>
</template>
