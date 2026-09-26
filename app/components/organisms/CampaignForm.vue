<script setup lang="ts">
import type { AutosaveState } from '~/composables/useDraftAutosave';
import { DISPLAY_TIME_ZONE_LABEL, formatDateTime, formatNumber, pluralize } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { SelectOption } from '~/types/selectOption';

/**
 * Форма черновика акции: название, короткое имя, сегмент, окно половины А, деление 50 на 50,
 * офис выдачи наград и их срок.
 *
 * **Черновик сохраняет себя сам** (issue #148): кнопки нет, рядом отметка «сохраняем…»
 * или «сохранено». Обязательных полей нет — черновик заводится первым действием, а чего
 * не хватает для запуска, страница называет у кнопки.
 *
 * Число водителей в сегменте показывается здесь же, с пометкой «на сегодня»: сегмент хранит
 * условия, а не людей, и до запуска это число ползёт каждый день. Считает страница —
 * компонент данных не запрашивает (docs/frontend.md → «Данные в компоненты не ходят»).
 *
 * `readonly` — демо-акция у того, кто её не правит (issue #212): поля видны, но закрыты.
 */
defineProps<{
  segmentOptions: SelectOption[];
  /** Рабочие офисы — где лежат и выдаются призы акции. */
  officeOptions: SelectOption[];
  /** Выбранный сегмент в архиве: он сохранился, но запуск по нему не пройдёт. */
  segmentArchived: boolean;
  segmentCountState: LoadState;
  /** Число водителей в выбранном сегменте на сейчас. `null` — сегмент не выбран. */
  segmentCount: { total: number; calculatedAt: string } | null;
  autosaveState: AutosaveState;
  autosaveError: string | null;
  readonly?: boolean;
}>();

const emit = defineEmits<{ retry: [] }>();

const title = defineModel<string>('title', { required: true });
const slug = defineModel<string>('slug', { required: true });
const segmentId = defineModel<string>('segmentId', { required: true });
const startsOn = defineModel<string>('startsOn', { required: true });
const endsOn = defineModel<string>('endsOn', { required: true });
const splitEnabled = defineModel<boolean>('splitEnabled', { required: true });
const officeId = defineModel<string>('officeId', { required: true });
const rewardLifetimeDays = defineModel<string>('rewardLifetimeDays', { required: true });

const driversLabel = (total: number): string =>
  `${formatNumber(total)} ${pluralize(total, 'водитель', 'водителя', 'водителей')}`;
</script>

<template>
  <MoleculesSectionPanel title="Черновик">
    <fieldset :disabled="readonly" class="min-w-0 space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <MoleculesFormField
            v-model="title"
            label="Название"
            type="text"
            hint="Для людей: его видят сотрудники и водители на экране акции."
          />
          <MoleculesFormField
            v-model="slug"
            label="Короткое имя"
            type="text"
            placeholder="comeback-wave-1"
            hint="Строчная латиница, цифры и дефисы. От него строятся ключи начислений акции — после запуска не меняется."
          />
        </div>

        <div class="space-y-2">
          <label class="block">
            <span class="mb-1 block text-sm font-medium text-slate-700">Сегмент</span>
            <AtomsSelectInput v-model="segmentId" :options="segmentOptions">
              <option value="">Выберите сегмент</option>
            </AtomsSelectInput>
          </label>
          <div class="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <p v-if="segmentId === ''" class="text-slate-500">
              Состав акции снимается из сегмента при запуске. В списке — только рабочие сегменты.
            </p>
            <p v-else-if="segmentArchived" class="text-red-700">
              Сегмент в архиве. По нему акция не запустится — выберите рабочий.
            </p>
            <p v-else-if="segmentCountState === 'loading'" class="text-slate-500">Считаем состав…</p>
            <p v-else-if="segmentCountState === 'error' || !segmentCount" class="text-red-700">
              Состав посчитать не вышло. Это отказ запроса, а не пустой сегмент.
            </p>
            <template v-else>
              <p class="text-slate-700">
                На сегодня в сегменте
                <span class="font-semibold text-slate-900">{{ driversLabel(segmentCount.total) }}</span>.
              </p>
              <p class="mt-0.5 text-xs text-slate-500">
                Посчитано {{ formatDateTime(segmentCount.calculatedAt) }} в зоне {{ DISPLAY_TIME_ZONE_LABEL }}.
                Завтра число будет другим: сегмент хранит условия, а не людей. Состав замрёт
                в момент запуска.
              </p>
            </template>
          </div>
        </div>

        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold text-slate-900">Окно половины А</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <MoleculesFormField v-model="startsOn" label="Первый день" type="date" />
            <MoleculesFormField v-model="endsOn" label="Последний день" type="date" />
          </div>
          <p class="text-sm text-slate-500">
            Сутки акции идут с 05:00 до 05:00 по Ташкенту: окно открывается в 05:00 первого дня,
            а последний день кончается в 05:00 следующего утра.
          </p>
        </fieldset>

        <div class="space-y-2">
          <label class="flex items-center gap-3">
            <input
              v-model="splitEnabled"
              type="checkbox"
              class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
            />
            <span class="text-sm font-medium text-slate-900">Разделить состав 50 на 50</span>
          </label>
          <p class="text-sm text-slate-500">
            Состав делится случайно на две равные половины. Половина А получает приглашение сейчас.
            Половина Б — контроль: в эти дни ей ничего не уходит, её приглашают позже своим окном.
            Эффект акции меряется сравнением половин за одни и те же дни.
          </p>
        </div>

        <fieldset class="space-y-3">
          <legend class="text-sm font-semibold text-slate-900">Награды</legend>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="block">
              <span class="mb-1 block text-sm font-medium text-slate-700">Офис выдачи</span>
              <AtomsSelectInput v-model="officeId" :options="officeOptions">
                <option value="">Выберите офис</option>
              </AtomsSelectInput>
            </label>
            <MoleculesNumberField
              v-model="rewardLifetimeDays"
              label="Срок, дней"
              :min="1"
              hint="Через столько дней неполученная награда сгорает."
            />
          </div>
          <p class="text-sm text-slate-500">
            Призы акции лежат и выдаются в одном офисе: водитель получает их там по коду из раздела
            «Мои награды». Сгоревший приз возвращается в остатки свободным.
          </p>
        </fieldset>

        <MoleculesAutosaveStatus
          v-if="!readonly"
          :state="autosaveState"
          :error="autosaveError"
          @retry="emit('retry')"
        />
    </fieldset>
  </MoleculesSectionPanel>
</template>
