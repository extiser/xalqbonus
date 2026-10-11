<script setup lang="ts">
import { computed } from 'vue';
import { PhArrowUpRight } from '@phosphor-icons/vue';
import { pluralize } from '~/utils/format';
import {
  applicationDraftFeedEntries,
  buildChatFeed,
  deliveryFailureText,
  KIND_WORDS,
  type ChatFeedEntry,
} from '~/utils/chatFeed';
import type { ApplicationCard, ApplicationCardMessage } from '#shared/types/applications';

/**
 * Плитка «Переписка» карточки заявки (issue #471) — `02-card.html`, 8 × 6.
 *
 * В шапке — число сообщений и круглая кнопка «Открыть тему в Telegram» (нет темы — нет кнопки).
 * Переписка — окном `MoleculesWebChatWindow`: кандидат слева, сотрудники и бот справа, события —
 * серым по центру. Первыми — сообщения черновика заявки в чате до подачи (issue #475), с событием
 * «Нажал /start» в начале черновика; в числе сообщений они тоже.
 *
 * Под окном — ответ из админки, если он открыт смотрящему и бот может писать кандидату; если
 * открыт, а писать нельзя, — просьба позвонить.
 */
const props = defineProps<{
  card: ApplicationCard;
  /** Момент, от которого считается «ждёт ответа», мс. */
  now: number;
  sending: boolean;
  sendError: string | null;
}>();

const emit = defineEmits<{ send: [text: string] }>();

const draft = defineModel<string>('draft', { required: true });

const EVENT_TEXTS = {
  hired: 'Оформлен',
  rejected: 'Отказ',
  reopened: 'Снова в работе',
} as const;

const authorLine = (message: ApplicationCardMessage): string => {
  if (message.author === 'bot') return 'Бот, автоматически';
  if (message.author === 'candidate') return props.card.application.name;

  return message.authorName ?? 'Сотрудник';
};

const items = computed(() => {
  const { application, source, messages, draftMessages, events, firstReply } = props.card;
  const entries: ChatFeedEntry[] = [
    ...applicationDraftFeedEntries(draftMessages, application.telegramName),
    {
      at: new Date(application.createdAt).getTime(),
      item: {
        kind: 'event',
        key: 'submitted',
        text: `Заявка подана · ${source.promoName ?? source.promoCode}`,
        tone: 'quiet',
      },
    },
    ...messages.map(
      (message): ChatFeedEntry => ({
        at: new Date(message.createdAt).getTime(),
        item: {
          kind: 'message',
          key: message.id,
          message: {
            tone: message.author === 'candidate' ? 'person' : message.author,
            kindWord: message.kind === 'text' ? null : KIND_WORDS[message.kind],
            text: message.text,
            author: authorLine(message),
            createdAt: message.createdAt,
            failure: deliveryFailureText(message.delivery, message.failure),
          },
        },
      }),
    ),
    ...events.map(
      (event, index): ChatFeedEntry => ({
        at: new Date(event.createdAt).getTime(),
        item: {
          kind: 'event',
          key: `event-${index}`,
          text: `${EVENT_TEXTS[event.kind]} · ${event.employeeName}`,
          tone: 'quiet',
        },
      }),
    ),
  ];

  // Первый ответ отметкой своей строкой уже назван — «Оформлен · Малика»: второй строки про
  // «заявку в работе» у него нет, иначе отказ читался бы взятым в работу.
  if (firstReply !== null && !events.some((event) => event.createdAt === firstReply.at)) {
    entries.push({
      at: new Date(firstReply.at).getTime(),
      item: {
        kind: 'event',
        key: 'first-reply',
        text: `Первый ответ — ${firstReply.employeeName} · заявка в работе`,
        tone: 'quiet',
      },
    });
  }

  return buildChatFeed(
    entries,
    application.waitingSince === null ? null : { since: application.waitingSince, now: props.now },
  );
});

const countText = computed(() => {
  const count = props.card.messages.length + props.card.draftMessages.length;

  return `${count} ${pluralize(count, 'сообщение', 'сообщения', 'сообщений')}`;
});
</script>

<template>
  <MoleculesWebTile :cols="8" :rows="6" :medium="12" pinned title="Переписка">
    <template #aside>
      <span class="flex items-center gap-3.5">
        <span class="font-manrope text-[13px] font-medium whitespace-nowrap text-web-grey">{{ countText }}</span>
        <MoleculesWebTooltip v-if="card.topicUrl !== null" text="Открыть тему в Telegram">
          <a
            :href="card.topicUrl"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть тему в Telegram"
            class="grid size-10 shrink-0 place-items-center rounded-full bg-web-raised text-web-text hover:bg-web-cyan/12 hover:text-web-cyan focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
          >
            <PhArrowUpRight weight="bold" aria-hidden="true" class="size-4" />
          </a>
        </MoleculesWebTooltip>
      </span>
    </template>

    <div class="mt-4 flex min-h-0 flex-1 flex-col">
      <MoleculesWebChatWindow :items="items" />
    </div>

    <div v-if="card.canReply && card.application.writeAllowed" class="mt-4">
      <MoleculesWebChatReplyForm
        v-model="draft"
        label="Сообщение кандидату"
        note="Сообщение уйдёт кандидату от имени парка и появится в теме группы кандидатов. Менеджеры отвечают из темы."
        :sending="sending"
        :send-error="sendError"
        @send="emit('send', $event)"
      />
    </div>
    <p v-else-if="card.canReply" class="m-0 mt-4 font-manrope text-[13px] leading-[1.45] text-web-grey">
      Бот не может писать кандидату. Позвоните ему: {{ card.application.phone }}
    </p>
  </MoleculesWebTile>
</template>
