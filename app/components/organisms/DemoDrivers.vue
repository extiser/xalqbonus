<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { formatDayMonth, formatMinuteDateTime, formatNumber, pluralize } from '~/utils/format';
import type { DemoDriverSummary } from '#shared/types/demo';

/**
 * Демо-водители (issue #252): водители зрителей и сгенерированные. У каждого — «Добавить
 * поездки» формой в строке, у сгенерированного ещё «Спрятать».
 *
 * Спрятанные — по переключателю (решение Руслана 27-09-2026): спрятанный продолжает жить,
 * и невидимым быть не должен. Его строка — с пометкой «спрятан» и «Вернуть», без поездок.
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
}>();

const emit = defineEmits<{
  addTrips: [personId: string, count: number, endedAt: string];
  hide: [personId: string];
  unhide: [personId: string];
}>();

const showHidden = ref(false);

const hiddenCount = computed(() => props.drivers.filter((driver) => driver.hiddenAt !== null).length);

const shown = computed(() =>
  showHidden.value ? props.drivers : props.drivers.filter((driver) => driver.hiddenAt === null),
);

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
          v-model="showHidden"
          type="checkbox"
          class="size-4 rounded border-slate-300 text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-400"
        />
        <span class="text-sm text-slate-900">Показать спрятанных ({{ hiddenCount }})</span>
      </label>

      <MoleculesStateNotice v-if="drivers.length === 0" state="empty" message="Демо-водителей пока нет." />
      <MoleculesStateNotice
        v-else-if="shown.length === 0"
        state="empty"
        message="Все демо-водители спрятаны."
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
  </MoleculesSectionPanel>
</template>
