<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { formatDayMonth, formatMinuteDateTime, formatNumber, pluralize } from '~/utils/format';
import type { LoadState } from '~/types/loadState';
import type { DemoDriverSummary, DemoDriverTrip } from '#shared/types/demo';

/**
 * Демо-водители (issue #252): водители зрителей и сгенерированные. У каждого — «Добавить
 * поездки» формой в строке, у сгенерированного ещё «Спрятать».
 *
 * Спрятанные — по переключателю «Только спрятанные»: спрятанный
 * продолжает жить и невидимым быть не должен. Переключатель — фильтр, а не добавка: среди
 * тридцати водителей спрятанного иначе не найти. Строка спрятанного — с пометкой «спрятан»
 * и «Вернуть», без формы поездок.
 *
 * «Поездки» раскрывают последние завершённые поездки с итогом по журналу. Приходят они
 * страницей по событию: данные в компоненты не ходят. В раскрытом списке — «×» у поездки
 * и «Очистить все» (issue #422): удаление вместе с баллами и приветственным бонусом, чтобы
 * путь бонуса прогонялся на демо-водителе заново.
 *
 * Поля формы у каждой строки свои и живут здесь: это ввод, а не данные, и страница о них
 * узнаёт только из события отправки.
 */
const props = defineProps<{
  drivers: DemoDriverSummary[];
  /** Водитель, над которым идёт действие: его кнопки гаснут на время запроса. */
  busyPersonId: string | null;
  /** Итог последнего добавления поездок — строкой у своего водителя. */
  tripsResult: { personId: string; text: string } | null;
  error: string | null;
  /** Раскрытые поездки — у одного водителя за раз. `null` — не раскрыты ни у кого. */
  openTrips: { personId: string; state: LoadState; trips: DemoDriverTrip[] } | null;
}>();

const emit = defineEmits<{
  addTrips: [personId: string, count: number, endedAt: string];
  hide: [personId: string];
  unhide: [personId: string];
  toggleTrips: [personId: string];
  deleteTrip: [personId: string, orderId: string];
  clearTrips: [personId: string];
}>();

const onlyHidden = ref(false);

const hiddenCount = computed(() => props.drivers.filter((driver) => driver.hiddenAt !== null).length);

// Спрятанных не осталось — переключатель выключается сам и пропадает: вернул последнего —
// снова обычный список.
watch(hiddenCount, (count) => {
  if (count === 0) {
    onlyHidden.value = false;
  }
});

const shown = computed(() =>
  props.drivers.filter((driver) => (driver.hiddenAt !== null) === onlyHidden.value),
);

const tripsOpenFor = (personId: string): boolean => props.openTrips?.personId === personId;

/**
 * «Очистить все» — через подтверждение: уходят все поездки и бонус разом. Одна поездка —
 * без него: путь назад — «Добавить поездки».
 */
const clearAskedFor = ref<string | null>(null);

const confirmClear = (): void => {
  if (clearAskedFor.value !== null) {
    emit('clearTrips', clearAskedFor.value);
  }

  clearAskedFor.value = null;
};

const pointsText = (trip: DemoDriverTrip): string =>
  trip.points === null ? 'не начислено' : `+${formatNumber(trip.points)}`;

/**
 * Части строки после имени — одной строкой через « · »: разделитель, собранный разметкой
 * из соседних элементов, терял пробел на переносе строки шаблона.
 */
const detailsOf = (driver: DemoDriverSummary): string =>
  [
    driver.callsign,
    `${formatNumber(driver.balance)} ${pluralize(driver.balance, 'балл', 'балла', 'баллов')}`,
    driver.programMember ? 'участник' : 'не участник',
    `последняя поездка ${formatMinuteDateTime(driver.lastTripAt)}`,
    `поездок: ${formatNumber(driver.tripsCount)}`,
    driver.viewerLabel ?? 'сгенерирован',
    ...(driver.hiddenAt === null ? [] : [`спрятан ${formatDayMonth(driver.hiddenAt)}`]),
  ].join(' · ');

/**
 * Узбекистан живёт по UTC+5 круглый год, без перевода часов: время поля — ташкентское,
 * в какой бы зоне ни стоял браузер.
 */
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1_000;

const nowInput = (): string => new Date(Date.now() + TASHKENT_OFFSET_MS).toISOString().slice(0, 16);

const toIso = (value: string): string =>
  new Date(new Date(`${value}:00Z`).getTime() - TASHKENT_OFFSET_MS).toISOString();

type TripsForm = { count: string; endedAt: string };

const forms = reactive<Record<string, TripsForm>>({});

const formOf = (personId: string): TripsForm => {
  forms[personId] ??= { count: '5', endedAt: nowInput() };

  return forms[personId];
};

/**
 * Границы количества и «не в будущем» проверяет ручка и отвечает текстом: второй копии
 * потолка здесь нет. Пустое время — не отправляется, спрашивать сервер не о чем.
 */
const submit = (personId: string): void => {
  const form = formOf(personId);

  if (form.endedAt === '') {
    return;
  }

  emit('addTrips', personId, Number(form.count), toIso(form.endedAt));
};
</script>

<template>
  <MoleculesSectionPanel
    title="Демо-водители"
    note="Поездки руками идут тем же путём, что из синхронизации: балл за поездку, пятая после вступления приносит приветственные 300."
  >
    <div class="space-y-4">
      <label v-if="hiddenCount > 0" class="flex items-center gap-3">
        <input
          v-model="onlyHidden"
          type="checkbox"
          class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        />
        <span class="text-sm text-slate-900">Только спрятанные ({{ hiddenCount }})</span>
      </label>

      <MoleculesStateNotice v-if="drivers.length === 0" state="empty" message="Демо-водителей пока нет." />
      <MoleculesStateNotice
        v-else-if="shown.length === 0"
        state="empty"
        :message="onlyHidden ? 'Спрятанных нет.' : 'Все демо-водители спрятаны.'"
      />
      <ul v-else>
        <li
          v-for="driver in shown"
          :key="driver.personId"
          class="space-y-2 border-t border-slate-200 py-3 first:border-t-0"
        >
          <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <span class="text-sm text-slate-900">
              <NuxtLink
                :to="`/drivers/${driver.personId}`"
                class="font-medium underline underline-offset-2 hover:text-slate-700"
              >{{ driver.name }}</NuxtLink><span class="text-slate-500">{{ ` · ${detailsOf(driver)}` }}</span>
            </span>
            <div class="flex flex-wrap gap-3">
              <AtomsActionButton
                :label="tripsOpenFor(driver.personId) ? 'Скрыть поездки' : 'Поездки'"
                :disabled="driver.tripsCount === 0 && !tripsOpenFor(driver.personId)"
                @click="emit('toggleTrips', driver.personId)"
              />
              <AtomsActionButton
                v-if="driver.hiddenAt !== null"
                label="Вернуть"
                tone="primary"
                :disabled="busyPersonId === driver.personId"
                @click="emit('unhide', driver.personId)"
              />
              <AtomsActionButton
                v-else-if="driver.viewerLabel === null"
                label="Спрятать"
                tone="danger"
                :disabled="busyPersonId === driver.personId"
                @click="emit('hide', driver.personId)"
              />
            </div>
          </div>

          <div v-if="openTrips && tripsOpenFor(driver.personId)" class="rounded-md bg-slate-50 p-3">
            <MoleculesStateNotice v-if="openTrips.state === 'loading'" state="loading" message="Читаем поездки…" />
            <MoleculesStateNotice
              v-else-if="openTrips.state === 'error'"
              state="error"
              message="Поездки не прочитались. Это отказ запроса, а не пустой список."
            />
            <MoleculesStateNotice
              v-else-if="openTrips.trips.length === 0"
              state="empty"
              message="Завершённых поездок нет."
            />
            <template v-else>
              <div class="mb-2 flex items-start justify-between gap-4">
                <p class="text-xs text-slate-500">
                  Последние {{ openTrips.trips.length }}, свежие первыми. Приветственные 300 — в истории
                  операций карточки.
                </p>
                <AtomsActionButton
                  label="Очистить все"
                  tone="danger"
                  :disabled="busyPersonId === driver.personId"
                  @click="clearAskedFor = driver.personId"
                />
              </div>
              <ul class="space-y-1">
                <li
                  v-for="trip in openTrips.trips"
                  :key="trip.orderId"
                  class="flex justify-between gap-4 text-sm"
                >
                  <span class="text-slate-900">{{ formatMinuteDateTime(trip.endedAt) }}</span>
                  <span class="flex items-center gap-2">
                    <span :class="trip.points === null ? 'text-slate-500' : 'text-emerald-700'">
                      {{ pointsText(trip) }}
                    </span>
                    <button
                      type="button"
                      aria-label="Удалить поездку"
                      class="rounded px-1 leading-none text-slate-400 transition-colors hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400 disabled:cursor-not-allowed disabled:text-slate-300"
                      :disabled="busyPersonId === driver.personId"
                      @click="emit('deleteTrip', driver.personId, trip.orderId)"
                    >
                      ×
                    </button>
                  </span>
                </li>
              </ul>
            </template>
          </div>

          <div v-if="driver.hiddenAt === null" class="flex flex-wrap items-end gap-3">
            <label class="block w-28">
              <span class="mb-1 block text-sm font-medium text-slate-700">Сколько</span>
              <AtomsNumberInput v-model="formOf(driver.personId).count" :min="1" />
            </label>
            <label class="block min-w-56">
              <span class="mb-1 block text-sm font-medium text-slate-700">Завершена</span>
              <AtomsTextInput v-model="formOf(driver.personId).endedAt" type="datetime-local" />
            </label>
            <AtomsActionButton
              :label="busyPersonId === driver.personId ? 'Добавляем…' : 'Добавить поездки'"
              tone="primary"
              :disabled="busyPersonId === driver.personId"
              @click="submit(driver.personId)"
            />
          </div>

          <p v-if="tripsResult?.personId === driver.personId" class="text-sm text-emerald-700">
            {{ tripsResult.text }}
          </p>
        </li>
      </ul>

      <p v-if="error" class="text-sm text-red-700">{{ error }}</p>
    </div>

    <MoleculesConfirmDialog
      :open="clearAskedFor !== null"
      title="Удалить все поездки демо-водителя?"
      message="Удалятся все его поездки, баллы за них и приветственный бонус. Остальные операции счёта останутся."
      confirm-label="Удалить все"
      cancel-label="Отмена"
      tone="danger"
      @confirm="confirmClear"
      @cancel="clearAskedFor = null"
    />
  </MoleculesSectionPanel>
</template>
