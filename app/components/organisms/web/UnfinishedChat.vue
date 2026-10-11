<script setup lang="ts">
import { computed } from 'vue';
import { pluralize } from '~/utils/format';
import { buildChatFeed, draftFeedEntries } from '~/utils/chatFeed';
import type { UnfinishedCard } from '#shared/types/applications';

/**
 * Плитка «Переписка» карточки человека из «Не закончили» (issue #475) — `04-unfinished-card.html`,
 * 8 × 6, по образцу переписки заявки: то же окно и тот же ответ. Отличия: в шапке только число
 * сообщений, без событий; кнопки «Открыть тему в Telegram» нет — темы нет. События — «Нажал
 * /start · метка» и «Прислал номер · бот спросил имя»; ответы бота на шаги заявки не хранятся
 * и не показываются.
 *
 * Поле ответа — у владельца и админа (`canReply`); у остальных — ничего.
 */
const props = defineProps<{
  card: UnfinishedCard;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
  sending: boolean;
  sendError: string | null;
}>();

const emit = defineEmits<{ send: [text: string] }>();

const draft = defineModel<string>('draft', { required: true });

const items = computed(() => {
  const { draft: person, messages } = props.card;

  return buildChatFeed(
    draftFeedEntries(messages, {
      startedAt: person.startedAt,
      promoName: person.promoName ?? person.promoCode,
      phone: person.phone,
      personName: person.telegramName,
    }),
    person.waitingSince === null ? null : { since: person.waitingSince, now: props.now },
  );
});

const countText = computed(() => {
  const count = props.card.messages.length;

  return `${count} ${pluralize(count, 'сообщение', 'сообщения', 'сообщений')}`;
});
</script>

<template>
  <MoleculesWebTile :cols="8" :rows="6" :medium="12" pinned title="Переписка">
    <template #aside>
      <span class="font-manrope text-[13px] font-medium whitespace-nowrap text-web-grey">{{ countText }}</span>
    </template>

    <div class="mt-4 flex min-h-0 flex-1 flex-col">
      <MoleculesWebChatWindow :items="items" />
    </div>

    <div v-if="card.canReply" class="mt-4">
      <MoleculesWebChatReplyForm
        v-model="draft"
        label="Сообщение человеку"
        note="Сообщение уйдёт человеку от имени парка. Темы в группе у него нет: заявку он не подал."
        :sending="sending"
        :send-error="sendError"
        @send="emit('send', $event)"
      />
    </div>
  </MoleculesWebTile>
</template>
