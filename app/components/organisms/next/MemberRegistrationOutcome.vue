<script setup lang="ts">
import type { MemberLanguage, MemberManagerIdsView, MemberOfficeView } from '~/types/memberView';

/**
 * Исход регистрации — один экран на три вида (`kind`):
 *
 * - `office` — отказ «в офис», `registration/registration-refused.html`: исходы, которые решает
 *   оператор. Текст исхода, «Покажите менеджеру» и офисы карточками. Кнопок нет: повтор дал бы
 *   тот же ответ;
 * - `retry` — повтор, `registration-retry.html`: проверка не прошла или прислан чужой контакт.
 *   То же, что у отказа, и низ как у шага 2 — сбой алым под кнопкой, на месте строки
 *   «Проверяем…». Пока идёт проверка (`busy`), гаснут кнопка и язык, а сбой сменяется «Проверяем…»;
 * - `employee` — отказ сотруднику, `registration-employee.html`, и тот же вид у сотрудника
 *   с выключенной учёткой, `state-employee-denied.html`. Нейтральный: без офисов и кнопок,
 *   не говорит, что аккаунт принадлежит сотруднику, — скриншот могут переслать водителю.
 *
 * «Покажите менеджеру» есть на каждом исходе: номер и Telegram ID — единственное, по чему
 * в базе можно что-то решить. Абзацы текста исхода — отдельными строками, перенос внутри
 * абзаца сохраняется.
 */
type OutcomeKind = 'office' | 'retry' | 'employee';

const props = withDefaults(
  defineProps<{
    kind: OutcomeKind;
    language: MemberLanguage;
    title: string;
    paragraphs: string[];
    ids: MemberManagerIdsView;
    /** `office` и `retry`: подпись над офисами и сами офисы. */
    officesTitle?: string;
    offices?: MemberOfficeView[];
    /** Строка карты в карточке офиса: «Открыть в Яндекс Картах». */
    mapLabel?: string;
    /** `retry`: низ как у шага 2. */
    ask?: string;
    send?: string;
    failed?: string;
    checking?: string;
    busy?: boolean;
  }>(),
  {
    officesTitle: '',
    offices: () => [],
    mapLabel: '',
    ask: '',
    send: '',
    failed: '',
    checking: '',
    busy: false,
  },
);

defineEmits<{ 'update:language': [language: MemberLanguage]; map: [office: MemberOfficeView]; send: [] }>();

const status = computed(() =>
  props.busy ? { tone: 'checking' as const, text: props.checking } : { tone: 'failed' as const, text: props.failed },
);
</script>

<template>
  <div
    class="relative flex min-h-dvh flex-col overflow-hidden bg-xb-screen font-manrope leading-[normal] text-xb-text"
    :class="kind === 'retry' ? '' : 'pb-[calc(32px+env(safe-area-inset-bottom))]'"
  >
    <div class="pointer-events-none absolute inset-x-0 top-0 h-[470px] overflow-hidden">
      <AtomsNextMemberLiveBackdrop variant="registration" />
    </div>

    <MoleculesNextMemberRegistrationHeader>
      <AtomsNextMemberLanguageSwitch
        :model-value="language"
        :disabled="kind === 'retry' && busy"
        @update:model-value="(next) => $emit('update:language', next)"
      />
    </MoleculesNextMemberRegistrationHeader>

    <div class="relative z-[1] px-5 pt-7">
      <AtomsNextMemberScreenTitle :text="title" tone="primary" />
      <p
        v-for="(paragraph, index) in paragraphs"
        :key="index"
        class="m-0 mt-3 whitespace-pre-line text-[15px] font-normal leading-[1.5] text-xb-secondary"
      >{{ paragraph }}</p>
    </div>

    <div class="relative z-[1] flex flex-col gap-2.5 px-5 pt-[26px]" :class="kind === 'retry' ? 'grow' : ''">
      <MoleculesNextMemberManagerIds :texts="ids.texts" :phone="ids.phone" :telegram-id="ids.telegramId" />

      <template v-if="kind !== 'employee'">
        <div class="px-0.5 pb-0.5 pt-4">
          <AtomsNextMemberGroupLabel :label="officesTitle" />
        </div>
        <MoleculesNextMemberOfficeCard
          v-for="office in offices"
          :key="office.name"
          :office="office"
          :texts="{ map: mapLabel }"
          @map="$emit('map', office)"
        />
      </template>
    </div>

    <div v-if="kind === 'retry'" class="sticky bottom-0 z-[2]">
      <MoleculesNextMemberPhoneSend :ask="ask" :send="send" :busy="busy" :status="status" @send="$emit('send')" />
    </div>
  </div>
</template>
