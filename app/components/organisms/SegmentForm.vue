<script setup lang="ts">
import { computed } from 'vue';
import type { SelectOption } from '~/types/selectOption';
import {
  fromConditionsDraft,
  PROGRAM_MEMBER_OPTIONS,
  SURVEY_STATE_OPTIONS,
  TELEGRAM_LINKED_OPTIONS,
  type SegmentConditionsDraft,
  type SegmentFlagChoice,
} from '~/utils/segmentConditions';
import { isSegmentBounded, SEGMENT_EMPTY_CONDITIONS_TEXT } from '#shared/segment';
import type { SegmentSurveyState } from '#shared/types/segment';

/**
 * Форма сегмента — одна на заведение и правку: имя, описание и условия отбора.
 *
 * Поля живут у страницы (`v-model`), а не внутри формы: по условиям, пока их крутят,
 * страница считает предпросмотр, и держать второе состояние тех же полей значило бы
 * однажды показать число не по тем условиям, что на экране.
 *
 * Без единого условия кнопка закрыта и причина названа рядом с ней (docs/frontend.md →
 * «Обязательное поле — свойство поля»): браузер этого правила не знает, а сегмент без условий —
 * весь реестр парка.
 *
 * `readonly` — демо-сегмент у того, кто его не правит (issue #212): условия видны, но закрыты.
 * Поле «Демо» нового сегмента ставит страница слотом. Демо-сегменту условия необязательны:
 * без них он берёт всех демо-водителей, и кнопка не закрывается.
 *
 * Опросы для условия (issue #324) собирает страница (`segmentSurveyOptions`): список — запрос,
 * а в компоненты данные не ходят (docs/frontend.md → «Данные в компоненты не ходят»).
 */
const props = defineProps<{
  title: string;
  /** Сегмент демо — свой признак или галочка формы заведения. */
  demo: boolean;
  submitLabel: string;
  saving: boolean;
  /** Что ответил сервер на последнюю попытку. `null` — ответа ждать нечего. */
  error: string | null;
  readonly?: boolean;
  /** Опросы, годные в условие: замороженные того же мира и уже выбранный. */
  surveyOptions: SelectOption[];
}>();

const emit = defineEmits<{ submit: [] }>();

const name = defineModel<string>('name', { required: true });
const description = defineModel<string>('description', { required: true });
const conditions = defineModel<SegmentConditionsDraft>('conditions', { required: true });

/**
 * Поле условия — отдельной вычисляемой парой: правка одного поля отдаёт наверх новый набор
 * целиком, а не правит объект свойства на месте.
 */
const boundField = (
  key: 'daysSinceTripMin' | 'daysSinceTripMax' | 'balanceMin' | 'balanceMax',
) =>
  computed({
    get: () => conditions.value[key],
    set: (value: string) => {
      conditions.value = { ...conditions.value, [key]: value };
    },
  });

const flagField = (key: 'programMember' | 'telegramLinked') =>
  computed({
    get: (): string => conditions.value[key],
    set: (value: string) => {
      conditions.value = { ...conditions.value, [key]: value as SegmentFlagChoice };
    },
  });

const surveyId = computed({
  get: () => conditions.value.surveyId,
  set: (value: string) => {
    conditions.value = { ...conditions.value, surveyId: value };
  },
});

const surveyState = computed({
  get: (): string => conditions.value.surveyState,
  set: (value: string) => {
    conditions.value = { ...conditions.value, surveyState: value as SegmentSurveyState };
  },
});

const daysSinceTripMin = boundField('daysSinceTripMin');
const daysSinceTripMax = boundField('daysSinceTripMax');
const balanceMin = boundField('balanceMin');
const balanceMax = boundField('balanceMax');
const programMember = flagField('programMember');
const telegramLinked = flagField('telegramLinked');

const hasConditions = computed(() =>
  isSegmentBounded(fromConditionsDraft(conditions.value), props.demo),
);
</script>

<template>
  <MoleculesSectionPanel
    :title="title"
    note="Условия склеиваются через «и». Пустое поле — условие не задано и в отбор не входит."
  >
    <form @submit.prevent="emit('submit')">
      <fieldset :disabled="readonly" class="min-w-0 space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <MoleculesFormField v-model="name" label="Имя" type="text" required />
          <MoleculesTextAreaField
            v-model="description"
            label="Описание"
            :rows="2"
            hint="Для сотрудников: зачем срез и кого он должен брать."
          />
        </div>

        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold text-slate-900">Последняя завершённая поездка</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <MoleculesNumberField
              v-model="daysSinceTripMin"
              label="Не меньше, дней назад"
              :min="0"
            />
            <MoleculesNumberField
              v-model="daysSinceTripMax"
              label="Не больше, дней назад"
              :min="0"
            />
          </div>
          <p class="text-sm text-slate-500">
            Сутки парка — с 05:00 по Ташкенту. Кто не ездил ни разу, под это условие не подходит:
            «не ездил» — не «давно ездил».
          </p>
        </fieldset>

        <div class="grid gap-4 sm:grid-cols-2">
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-slate-700">Участие в программе</span>
            <AtomsSelectInput v-model="programMember" :options="PROGRAM_MEMBER_OPTIONS" />
          </label>
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-slate-700">Привязка Telegram</span>
            <AtomsSelectInput v-model="telegramLinked" :options="TELEGRAM_LINKED_OPTIONS" />
          </label>
        </div>

        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold text-slate-900">Баланс</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <MoleculesNumberField v-model="balanceMin" label="От, баллов" :min="null" />
            <MoleculesNumberField v-model="balanceMax" label="До, баллов" :min="null" />
          </div>
          <p class="text-sm text-slate-500">
            Считается по водительскому счёту. Без счёта человек под это условие не подходит.
          </p>
        </fieldset>

        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold text-slate-900">Опрос</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-slate-700">Опрос</span>
              <AtomsSelectInput v-model="surveyId" :options="surveyOptions">
                <option value="">Не важно</option>
              </AtomsSelectInput>
            </label>
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-slate-700">Кто из получивших</span>
              <AtomsSelectInput
                v-model="surveyState"
                :options="SURVEY_STATE_OPTIONS"
                :disabled="surveyId === ''"
              />
            </label>
          </div>
          <p class="text-sm text-slate-500">
            Получил — рассылка с этим опросом ушла человеку. Выключившие уведомления
            и те, до кого сообщение не дошло, опроса не получали. Прошедший опрос выпадает
            из сегмента сам; отказавшийся в «не прошёл» не входит. В списке — опросы, уже
            уходившие рассылкой.
          </p>
        </fieldset>

        <slot />

        <p v-if="error" class="text-sm text-red-700">{{ error }}</p>

        <div v-if="!readonly" class="flex flex-wrap items-center gap-3">
          <AtomsSubmitButton :label="submitLabel" :disabled="saving || !hasConditions" />
          <p v-if="!hasConditions" class="text-sm text-slate-500">
            {{ SEGMENT_EMPTY_CONDITIONS_TEXT }}
          </p>
        </div>
      </fieldset>
    </form>
  </MoleculesSectionPanel>
</template>
