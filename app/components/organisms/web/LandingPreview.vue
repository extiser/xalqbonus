<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatDayMonth } from '~/utils/format';
import { landingLabelCount } from '~/utils/landings';
import type { DefaultLandingScreen, LandingCard, LandingLabel } from '#shared/types/landings';

/**
 * Плитка предпросмотра 8 × 6 вкладки «Лендинги» (issue #478) — `.pv-*` в
 * `_reference/design/web/promo/04-landings.html`.
 *
 * Шапка — название, даты и число меток; справа действия по состоянию лендинга: у экрана
 * по умолчанию их нет, без меток — «Заменить» и «Удалить», с метками — «Заменить» и «В архив»,
 * в архиве — «Вернуть из архива». Действия уходят событиями — запросы делает страница.
 *
 * Рамка телефона 360 × 640 со скруглением 14 и полосой приложения; внутри — действующая версия
 * лендинга (`OrganismsLandingView`), а если ни одна не прошла проверку — последняя. Экран
 * по умолчанию рисует `OrganismsNextMemberApplicationForm` с русскими текстами Mini App;
 * отправка в предпросмотре ничего не делает. Справа от рамки — метки на лендинге и проверка
 * последней версии.
 */
type PreviewSubject = { kind: 'default'; screen: DefaultLandingScreen } | { kind: 'landing'; card: LandingCard };

const props = defineProps<{
  subject: PreviewSubject;
  /** Действие в пути: кнопки не нажимаются повторно. */
  busy: boolean;
}>();

const emit = defineEmits<{
  replace: [];
  archive: [];
  unarchive: [];
  delete: [];
}>();

const card = computed(() => (props.subject.kind === 'landing' ? props.subject.card : null));

const title = computed(() => card.value?.name ?? 'Экран заявки');

const labels = computed((): LandingLabel[] =>
  props.subject.kind === 'landing' ? props.subject.card.labels : props.subject.screen.labels,
);

const labelCount = computed(() =>
  props.subject.kind === 'landing' ? props.subject.card.labelCount : props.subject.screen.labelCount,
);

const metaParts = computed((): string[] => {
  const landing = card.value;

  if (landing === null) return ['встроен в приложение'];

  return [
    `загружен ${formatDayMonth(landing.createdAt)}`,
    landing.updatedAt === null ? null : `обновлён ${formatDayMonth(landing.updatedAt)}`,
    landing.archivedAt === null ? null : `в архиве с ${formatDayMonth(landing.archivedAt)}`,
  ].filter((part): part is string => part !== null);
});

/** В рамке — действующая версия, а без неё — последняя: увидеть, что не так, можно и до замены. */
const shown = computed(() => (card.value ? (card.value.liveVersion ?? card.value.lastVersion) : null));

/** Последняя не прошла, а метки показывают прежнюю — сказать, какую. */
const liveNote = computed(() => {
  const landing = card.value;

  if (!landing || landing.lastVersion.passed || landing.liveVersion === null) return null;

  return `Метки показывают версию от ${formatDayMonth(landing.liveVersion.createdAt)}. Новая версия не прошла проверку.`;
});

// Поля экрана по умолчанию — свои, в предпросмотре: введённое никуда не уходит.
const defaultName = ref('');
const defaultPhone = ref('');
</script>

<template>
  <MoleculesWebTile :cols="8" :rows="6" grow :medium="12">
    <template #head>
      <h2 class="m-0 font-unbounded text-[20px] leading-[1.2] font-bold break-words text-web-text">{{ title }}</h2>
      <p class="m-0 mt-1.5 font-manrope text-[13px] leading-[1.5] text-web-title">
        {{ metaParts.join(' · ') }} · <b class="font-semibold text-web-text">{{ landingLabelCount(labelCount) }}</b>
      </p>
    </template>
    <template #aside>
      <div v-if="card" class="flex items-center gap-2">
        <AtomsWebActionButton
          v-if="card.archived"
          label="Вернуть из архива"
          size="page"
          :disabled="busy"
          @click="emit('unarchive')"
        />
        <template v-else>
          <AtomsWebActionButton label="Заменить" size="page" :disabled="busy" @click="emit('replace')" />
          <AtomsWebActionButton
            v-if="card.labelCount === 0"
            label="Удалить"
            size="page"
            variant="quiet"
            :disabled="busy"
            @click="emit('delete')"
          />
          <AtomsWebActionButton v-else label="В архив" size="page" variant="quiet" :disabled="busy" @click="emit('archive')" />
        </template>
      </div>
    </template>

    <div class="mt-[22px] grid grid-cols-[auto_1fr] items-start gap-7 max-web:grid-cols-1 max-web:justify-items-center">
      <div
        class="m-2 flex h-[640px] w-[360px] flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_var(--color-web-line),0_0_0_8px_var(--color-web-raised)] max-web:h-[600px] max-web:w-[calc(100%-16px)] max-web:max-w-[360px]"
        aria-label="Предпросмотр на телефоне"
        role="figure"
      >
        <div
          class="flex h-11 shrink-0 items-center justify-center border-b border-[#E2E6E8] bg-[#F1F3F4] font-manrope text-[13px] font-semibold text-[#1C2427]"
        >
          Xalq Taxi Bonus
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <OrganismsLandingView v-if="shown" :html="shown.html" :image-base="shown.imageBase" />
          <OrganismsNextMemberApplicationForm
            v-else-if="subject.kind === 'default'"
            v-model:name="defaultName"
            v-model:phone="defaultPhone"
            :texts="subject.screen.texts"
            language="ru"
            :old="false"
            :declined="false"
            :busy="false"
          />
        </div>
      </div>

      <div class="flex min-w-0 flex-col gap-[18px] max-web:justify-self-stretch">
        <div v-if="labels.length > 0" class="flex flex-col">
          <p class="m-0 font-manrope text-[12px] font-medium text-web-axis">Стоит у меток</p>
          <ul class="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0">
            <li v-for="label in labels" :key="label.code">
              <NuxtLink
                :to="`/promo/${encodeURIComponent(label.code)}`"
                class="font-manrope text-[14px] font-medium break-words text-web-cyan no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
              >
                {{ label.name }}<span class="ml-1.5 text-[12px] text-web-grey">{{ label.code }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>

        <div v-if="card" class="flex flex-col">
          <p class="m-0 font-manrope text-[12px] font-medium text-web-axis">Проверка при загрузке</p>
          <p v-if="liveNote" class="m-0 mt-1 font-manrope text-[13px] leading-[1.45] text-web-grey">{{ liveNote }}</p>
          <div class="mt-1.5">
            <MoleculesWebLandingChecks :checks="card.lastVersion.checks" />
          </div>
        </div>
      </div>
    </div>
  </MoleculesWebTile>
</template>
