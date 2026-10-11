<script setup lang="ts">
import { PhPaperPlaneRight } from '@phosphor-icons/vue';
import { CANDIDATE_REPLY_MAX_LENGTH } from '#shared/candidateApplications';

/**
 * Ответ из админки под окном переписки (issue #471, #475): поле и кнопка отправки, отказ —
 * плашкой над полем, под ними — кому и как уйдёт сообщение. Ctrl или Cmd с Enter — отправка,
 * Enter без них — новая строка.
 *
 * Отправка уходит наверх событием: ручку зовёт страница. Текст при отказе не теряется — поле
 * очищает страница, когда ответ ушёл.
 */
const props = defineProps<{
  /** Подпись поля и подсказка в пустом поле: «Сообщение кандидату». */
  label: string;
  /** Серым под полем: кому и как уйдёт сообщение. */
  note: string;
  sending: boolean;
  sendError: string | null;
}>();

const emit = defineEmits<{ send: [text: string] }>();

const draft = defineModel<string>({ required: true });

const send = (): void => {
  if (props.sending) return;

  emit('send', draft.value);
};

const sendOnShortcut = (event: KeyboardEvent): void => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    send();
  }
};
</script>

<template>
  <div class="flex flex-col">
    <div v-if="sendError !== null" class="mb-4">
      <AtomsWebFormAlert :text="sendError" />
    </div>
    <form class="flex items-end gap-2.5" novalidate @submit.prevent="send">
      <textarea
        v-model="draft"
        rows="1"
        :maxlength="CANDIDATE_REPLY_MAX_LENGTH"
        :placeholder="label"
        :aria-label="label"
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
    <p class="m-0 mt-2.5 font-manrope text-[12px] leading-[1.45] text-web-axis">{{ note }}</p>
  </div>
</template>
