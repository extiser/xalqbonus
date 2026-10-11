<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { PhArrowUpRight, PhPaperPlaneRight } from '@phosphor-icons/vue';
import { formatCalendarDayWord, formatClock, formatDayKey, formatWaitDuration, pluralize } from '~/utils/format';
import { CANDIDATE_REPLY_MAX_LENGTH } from '#shared/candidateApplications';
import type {
  ApplicationCard,
  ApplicationCardMessage,
  CandidateMessageFailure,
  CandidateMessageKind,
} from '#shared/types/applications';

/**
 * Плитка «Переписка» карточки заявки (issue #471) — `02-card.html`, 8 × 6.
 *
 * В шапке — число сообщений и круглая кнопка «Открыть тему в Telegram» (нет темы — нет кнопки).
 * Переписка — утопленным окном со своей прокруткой, открывается на последнем: по дням,
 * кандидат слева, сотрудники и бот справа, события — серым текстом по центру. Медиа не
 * показывается — вид словом и подпись. Недоставленное подписано под пузырём.
 *
 * Под окном — ответ из админки, если он открыт смотрящему и бот может писать кандидату; если
 * открыт, а писать нельзя, — просьба позвонить. Отправка уходит наверх событием: ручку зовёт
 * страница. Текст при отказе не теряется — поле очищает страница, когда ответ ушёл.
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

const KIND_WORDS: Record<Exclude<CandidateMessageKind, 'text'>, string> = {
  photo: 'Фото',
  video: 'Видео',
  animation: 'Гифка',
  voice: 'Голосовое',
  audio: 'Аудио',
  document: 'Файл',
  sticker: 'Стикер',
  video_note: 'Кружок',
  contact: 'Контакт',
  location: 'Место',
  other: 'Другое',
};

const FAILURE_TEXTS: Record<CandidateMessageFailure, string> = {
  no_topic: 'не попало в тему',
  cannot_write: 'бот не может писать кандидату',
  telegram_error: 'Telegram не принял',
};

const EVENT_TEXTS = {
  hired: 'Оформлен',
  rejected: 'Отказ',
  reopened: 'Снова в работе',
} as const;

type ChatItem =
  | { kind: 'day'; key: string; text: string }
  | { kind: 'event'; key: string; text: string; tone: 'quiet' | 'waiting' }
  | { kind: 'message'; key: string; message: ApplicationCardMessage };

type TimedItem = { at: number; item: Exclude<ChatItem, { kind: 'day' }> };

const failureText = (message: ApplicationCardMessage): string | null => {
  if (message.delivery === 'refused') return 'не отправлено: кандидат не разрешил писать';
  if (message.delivery === 'failed' && message.failure !== null) return FAILURE_TEXTS[message.failure];

  return null;
};

const authorLine = (message: ApplicationCardMessage): string => {
  if (message.author === 'bot') return 'Бот, автоматически';
  if (message.author === 'candidate') return props.card.application.name;

  return message.authorName ?? 'Сотрудник';
};

const items = computed((): ChatItem[] => {
  const { application, source, messages, events, firstReply } = props.card;
  const timed: TimedItem[] = [
    {
      at: new Date(application.createdAt).getTime(),
      item: {
        kind: 'event',
        key: 'submitted',
        text: `Заявка подана · ${source.promoName ?? source.promoCode}`,
        tone: 'quiet',
      },
    },
    ...messages.map((message) => ({
      at: new Date(message.createdAt).getTime(),
      item: { kind: 'message' as const, key: message.id, message },
    })),
    ...events.map((event, index) => ({
      at: new Date(event.createdAt).getTime(),
      item: {
        kind: 'event' as const,
        key: `event-${index}`,
        text: `${EVENT_TEXTS[event.kind]} · ${event.employeeName}`,
        tone: 'quiet' as const,
      },
    })),
  ];

  // Первый ответ отметкой своей строкой уже назван — «Оформлен · Малика»: второй строки про
  // «заявку в работе» у него нет, иначе отказ читался бы взятым в работу.
  if (firstReply !== null && !events.some((event) => event.createdAt === firstReply.at)) {
    timed.push({
      at: new Date(firstReply.at).getTime(),
      item: {
        kind: 'event',
        key: 'first-reply',
        text: `Первый ответ — ${firstReply.employeeName} · заявка в работе`,
        tone: 'quiet',
      },
    });
  }

  // Порядок при равном времени — как пришли: событие подачи раньше приветствия бота.
  timed.sort((left, right) => left.at - right.at);

  const result: ChatItem[] = [];
  let lastDay = '';

  for (const { at, item } of timed) {
    const day = formatDayKey(new Date(at));

    if (day !== lastDay) {
      result.push({ kind: 'day', key: `day-${day}`, text: formatCalendarDayWord(day) });
      lastDay = day;
    }

    result.push(item);
  }

  if (application.waitingSince !== null) {
    result.push({
      kind: 'event',
      key: 'waiting',
      text: `Ждёт ответа ${formatWaitDuration(props.now - new Date(application.waitingSince).getTime())}`,
      tone: 'waiting',
    });
  }

  return result;
});

const countText = computed(() => {
  const count = props.card.messages.length;

  return `${count} ${pluralize(count, 'сообщение', 'сообщения', 'сообщений')}`;
});

const windowElement = ref<HTMLElement | null>(null);

const scrollToLast = async (): Promise<void> => {
  await nextTick();

  if (windowElement.value) windowElement.value.scrollTop = windowElement.value.scrollHeight;
};

onMounted(scrollToLast);
watch(() => props.card.messages.length, scrollToLast);

const send = (): void => {
  if (props.sending) return;

  emit('send', draft.value);
};

/** Ctrl или Cmd с Enter — отправка; Enter без них — новая строка. */
const sendOnShortcut = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    send();
  }
};
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

    <div
      ref="windowElement"
      class="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-[14px] bg-web-well px-[18px] pt-4 pb-[18px] inset-ring inset-ring-web-line max-web:max-h-[520px] max-web:min-h-[420px]"
    >
      <template v-for="item in items" :key="item.key">
        <div v-if="item.kind === 'day'" class="self-center pt-1.5 pb-0.5 font-manrope text-[12px] font-semibold text-web-axis">
          {{ item.text }}
        </div>
        <div
          v-else-if="item.kind === 'event'"
          class="self-center py-0.5 text-center font-manrope text-[12px]"
          :class="item.tone === 'waiting' ? 'font-semibold text-web-cyan' : 'font-medium text-web-axis'"
        >
          {{ item.text }}
        </div>
        <div
          v-else
          class="flex max-w-[72%] flex-col gap-[5px] max-web:max-w-[88%]"
          :class="item.message.author === 'candidate' ? 'self-start items-start' : 'self-end items-end'"
        >
          <div
            class="rounded-[12px] px-3.5 py-2.5 font-manrope text-[14px] leading-[1.5] break-words whitespace-pre-line"
            :class="{
              'bg-web-raised text-web-text': item.message.author === 'candidate',
              'bg-web-cyan/8 text-web-text': item.message.author === 'employee',
              'text-web-title inset-ring inset-ring-web-line': item.message.author === 'bot',
            }"
          >
            <span v-if="item.message.kind !== 'text'" class="block text-web-grey">{{ KIND_WORDS[item.message.kind] }}</span>{{ item.message.text }}
          </div>
          <span class="flex items-baseline gap-2 font-manrope text-[12px] font-semibold text-web-grey">
            {{ authorLine(item.message) }}<span class="text-[11px] font-medium text-web-axis">{{ formatClock(item.message.createdAt) }}</span>
          </span>
          <span v-if="failureText(item.message) !== null" class="font-manrope text-[12px] text-web-grey">
            {{ failureText(item.message) }}
          </span>
        </div>
      </template>
    </div>

    <template v-if="card.canReply && card.application.writeAllowed">
      <div v-if="sendError !== null" class="mt-4">
        <AtomsWebFormAlert :text="sendError" />
      </div>
      <form class="mt-4 flex items-end gap-2.5" novalidate @submit.prevent="send">
        <textarea
          v-model="draft"
          rows="1"
          :maxlength="CANDIDATE_REPLY_MAX_LENGTH"
          placeholder="Сообщение кандидату"
          aria-label="Сообщение кандидату"
          class="max-h-[120px] min-h-12 flex-1 resize-none rounded-[14px] border-0 bg-web-raised px-4 py-3 font-manrope text-[14px] leading-[1.45] text-web-text inset-ring inset-ring-web-line outline-none [field-sizing:content] placeholder:text-web-axis focus:inset-ring-[1.5px] focus:inset-ring-web-cyan"
          @keydown="sendOnShortcut"
        />
        <MoleculesWebTooltip text="Отправить">
          <button
            type="submit"
            aria-label="Отправить"
            :aria-disabled="sending ? 'true' : undefined"
            class="grid size-12 shrink-0 place-items-center rounded-[14px] border-0 bg-web-cyan/12 text-web-cyan inset-ring inset-ring-web-cyan/45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
            :class="sending ? 'cursor-default opacity-40' : 'cursor-pointer'"
          >
            <PhPaperPlaneRight weight="duotone" aria-hidden="true" class="size-5" />
          </button>
        </MoleculesWebTooltip>
      </form>
      <p class="m-0 mt-2.5 font-manrope text-[12px] leading-[1.45] text-web-axis">
        Сообщение уйдёт кандидату от имени парка и появится в теме группы кандидатов. Менеджеры отвечают из темы.
      </p>
    </template>
    <p v-else-if="card.canReply" class="m-0 mt-4 font-manrope text-[13px] leading-[1.45] text-web-grey">
      Бот не может писать кандидату. Позвоните ему: {{ card.application.phone }}
    </p>
  </MoleculesWebTile>
</template>
