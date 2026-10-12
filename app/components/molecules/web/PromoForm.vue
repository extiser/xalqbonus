<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import {
  PROMO_ENTRIES,
  PROMO_ENTRY_CHOICE_LABELS,
  PROMO_MEDIUM_LABELS,
  PROMO_MEDIUMS,
  type PromoEntry,
  type PromoField,
  type PromoMedium,
} from '#shared/promo';
import type { LandingOption } from '#shared/types/landings';

/**
 * Форма промо-метки (issue #380) — окно «Новая метка» по `_reference/design/web/promo/02-new.html`
 * и `02-new-ad-entry.html`, и «Изменить» в карточке метки. Ставится в `MoleculesWebDialog`.
 *
 * Заведение (`create`): название, носитель пилюлями — ничего не выбрано заранее, — у рекламы
 * в Telegram вход (issue #467), место размещения и ссылка с кодом, который выдал сервер.
 * Правка (`edit`): название и место — код, носитель и вход не меняются.
 *
 * У рекламы со входом «Приложение» — поле «Лендинг» (issue #478, `02-new-landing.html`): экран
 * заявки по умолчанию или загруженный лендинг. В правке после первого перехода по метке
 * (`landingLocked`) поле показано выбранным значением без выбора.
 *
 * Формы по кодексу (`codex.md`, «Формы — решено»): `novalidate`
 * и своей проверки нет — ошибки присылает сервер, по полю (`fieldErrors`), и они встают под
 * поле алым; первое поле с ошибкой получает фокус; правка поля снимает его ошибку (`edit`).
 * Ошибка не про поле — сеть, сервер — плашкой над полями, данные формы не теряются.
 * Кнопка сохранения не гаснет ни заранее, ни во время запроса — пока идёт запрос, у неё
 * другая подпись, а повторное нажатие отсекает тот, кто отправляет.
 *
 * Запросов форма не делает: значения уходят событием `submit`, другой код — `refreshCode`.
 */
export type PromoFormValues = {
  name: string;
  medium: PromoMedium | null;
  /** Уходит всегда; сервер читает его только у рекламы в Telegram. */
  entry: PromoEntry;
  /** Лендинг; `null` — экран заявки по умолчанию, и он же у меток, где поля нет. */
  landingId: string | null;
  placement: string;
};

type PromoFormMode = 'create' | 'edit';

const props = withDefaults(
  defineProps<{
    mode: PromoFormMode;
    initialName?: string;
    initialPlacement?: string;
    /** Носитель и вход метки в правке: по ним решается, есть ли поле «Лендинг». */
    initialMedium?: PromoMedium | null;
    initialEntry?: PromoEntry;
    /** Лендинг метки в правке; `null` — экран по умолчанию. */
    initialLanding?: LandingOption | null;
    /** По метке уже переходили — лендинг не меняется. */
    landingLocked?: boolean;
    /** Лендинги, которые можно выбрать. */
    landingOptions?: readonly LandingOption[];
    /** Ссылка с выданным кодом в чат бота — у заведения. */
    link?: string | null;
    /** Та же ссылка в Mini App — её показывает реклама в Telegram со входом в приложение. */
    appLink?: string | null;
    code?: string | null;
    fieldErrors: Partial<Record<PromoField, string>>;
    formError: string | null;
    submitting: boolean;
  }>(),
  {
    initialName: '',
    initialPlacement: '',
    initialMedium: null,
    initialEntry: 'miniapp',
    initialLanding: null,
    landingOptions: () => [],
    link: null,
    appLink: null,
    code: null,
  },
);

const emit = defineEmits<{
  submit: [values: PromoFormValues];
  cancel: [];
  refreshCode: [];
  edit: [field: PromoField];
}>();

const name = ref(props.initialName);
const medium = ref<PromoMedium | null>(null);

/**
 * Вход — только у рекламы в Telegram (issue #467). Заранее выбрано «Приложение»: так метки рекламы
 * работали до выбора входа. Смена носителя выбор не сбрасывает.
 */
const entry = ref<PromoEntry>('miniapp');
const showEntry = computed(() => medium.value === 'telegram_ad');

/**
 * Ссылка в поле «Ссылка» — по входу: реклама в Telegram со входом в приложение ведёт в Mini App,
 * всё остальное — в чат бота. Код один, обе ссылки пришли с ним, и смена носителя или входа
 * кода не перезапрашивает.
 */
const shownLink = computed(() => (showEntry.value && entry.value === 'miniapp' ? props.appLink : props.link));
const placement = ref(props.initialPlacement);

/**
 * Лендинг — только у рекламы в Telegram со входом «Приложение»: он и есть экран, который откроет
 * ссылка. Смена носителя или входа поле прячет, выбор не сбрасывает; уходит он только с полем.
 */
const landingId = ref<string | null>(props.initialLanding?.id ?? null);
const showLanding = computed(() =>
  props.mode === 'create'
    ? medium.value === 'telegram_ad' && entry.value === 'miniapp'
    : props.initialMedium === 'telegram_ad' && props.initialEntry === 'miniapp',
);

/**
 * В правке стоящий лендинг виден в выборе, даже если его уже нельзя выбрать заново — в архиве
 * или без прошедшей версии: иначе поле показало бы чужое значение.
 */
const landingChoices = computed((): readonly LandingOption[] => {
  const current = props.initialLanding;

  return current && !props.landingOptions.some((option) => option.id === current.id)
    ? [...props.landingOptions, current]
    : props.landingOptions;
});

const mediumErrorId = useId();
const entryErrorId = useId();
const landingErrorId = useId();
const codeErrorId = useId();

const nameField = ref<{ focus: () => void } | null>(null);
const placementField = ref<{ focus: () => void } | null>(null);
const landingField = ref<{ focus: () => void } | null>(null);
const mediumGroup = ref<HTMLElement | null>(null);
const entryGroup = ref<HTMLElement | null>(null);
const codeGroup = ref<HTMLElement | null>(null);

watch(name, () => emit('edit', 'name'));
watch(placement, () => emit('edit', 'placement'));
watch(landingId, () => emit('edit', 'landing'));

const chooseMedium = (value: PromoMedium): void => {
  medium.value = value;
  emit('edit', 'medium');
};

const chooseEntry = (value: PromoEntry): void => {
  entry.value = value;
  emit('edit', 'entry');
};

/** Порядок полей на форме — в нём ищется первое поле с ошибкой. */
const FIELD_ORDER: readonly PromoField[] = ['name', 'medium', 'entry', 'landing', 'placement', 'code'];

const PILL_GROUPS = { medium: mediumGroup, entry: entryGroup, code: codeGroup } as const;

const focusField = (field: PromoField): void => {
  if (field === 'name') nameField.value?.focus();
  else if (field === 'placement') placementField.value?.focus();
  else if (field === 'landing') landingField.value?.focus();
  else PILL_GROUPS[field].value?.querySelector('button')?.focus();
};

watch(
  () => props.fieldErrors,
  async (errors) => {
    const first = FIELD_ORDER.find((field) => errors[field] !== undefined);

    if (first === undefined) return;

    await nextTick();
    focusField(first);
  },
);

const submit = (): void => {
  emit('submit', {
    name: name.value,
    medium: medium.value,
    entry: entry.value,
    landingId: showLanding.value ? landingId.value : null,
    placement: placement.value,
  });
};

const PILL_CLASSES =
  'inline-flex h-9 cursor-pointer items-center rounded-full border-0 px-3.5 font-manrope text-[14px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';
</script>

<template>
  <form novalidate class="mt-1" @submit.prevent="submit">
    <div v-if="formError" class="mt-5">
      <AtomsWebFormAlert :text="formError" />
    </div>

    <div class="mt-5">
      <MoleculesWebTextField
        ref="nameField"
        v-model="name"
        label="Название"
        required
        autofocus
        hint="Как метка будет называться в списке. Видно только сотрудникам."
        :error="fieldErrors.name ?? null"
      />
    </div>

    <div v-if="mode === 'create'" class="mt-5">
      <p :id="`${mediumErrorId}-label`" class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">
        Носитель<span class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
      </p>
      <div
        ref="mediumGroup"
        role="radiogroup"
        :aria-labelledby="`${mediumErrorId}-label`"
        aria-required="true"
        :aria-invalid="fieldErrors.medium ? 'true' : undefined"
        :aria-describedby="fieldErrors.medium ? mediumErrorId : undefined"
        class="flex flex-wrap gap-2"
      >
        <button
          v-for="value in PROMO_MEDIUMS"
          :key="value"
          type="button"
          role="radio"
          :aria-checked="medium === value"
          :class="[
            PILL_CLASSES,
            medium === value
              ? 'bg-web-cyan/12 text-web-cyan inset-ring inset-ring-web-cyan/45'
              : fieldErrors.medium
                ? 'bg-web-raised text-web-title inset-ring inset-ring-web-scarlet'
                : 'bg-web-raised text-web-title',
          ]"
          @click="chooseMedium(value)"
        >
          {{ PROMO_MEDIUM_LABELS[value] }}
        </button>
      </div>
      <AtomsWebFieldError v-if="fieldErrors.medium" :id="mediumErrorId" :text="fieldErrors.medium" />
    </div>

    <div v-if="mode === 'create' && showEntry" class="mt-5">
      <p :id="`${entryErrorId}-label`" class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">
        Вход<span class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
      </p>
      <div
        ref="entryGroup"
        role="radiogroup"
        :aria-labelledby="`${entryErrorId}-label`"
        aria-required="true"
        :aria-invalid="fieldErrors.entry ? 'true' : undefined"
        :aria-describedby="fieldErrors.entry ? entryErrorId : undefined"
        class="flex flex-wrap gap-2"
      >
        <button
          v-for="value in PROMO_ENTRIES"
          :key="value"
          type="button"
          role="radio"
          :aria-checked="entry === value"
          :class="[
            PILL_CLASSES,
            entry === value
              ? 'bg-web-cyan/12 text-web-cyan inset-ring inset-ring-web-cyan/45'
              : fieldErrors.entry
                ? 'bg-web-raised text-web-title inset-ring inset-ring-web-scarlet'
                : 'bg-web-raised text-web-title',
          ]"
          @click="chooseEntry(value)"
        >
          {{ PROMO_ENTRY_CHOICE_LABELS[value] }}
        </button>
      </div>
      <AtomsWebFieldError v-if="fieldErrors.entry" :id="entryErrorId" :text="fieldErrors.entry" />
      <p v-else class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">
        Куда ведёт ссылка из объявления. В приложении человек заполняет форму заявки. В чате бот спрашивает
        номер и имя. После создания вход изменить нельзя.
      </p>
    </div>

    <div v-if="showLanding" class="mt-5">
      <p :id="`${landingErrorId}-label`" class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">
        Лендинг<span v-if="!landingLocked" class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
      </p>
      <template v-if="landingLocked">
        <p
          class="m-0 flex h-12 items-center overflow-hidden rounded-[14px] bg-web-cyan/4 px-4 font-manrope text-[15px] font-medium text-ellipsis whitespace-nowrap text-web-title"
        >
          {{ initialLanding?.name ?? 'Экран заявки' }}
        </p>
        <p class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">
          Лендинг меняется до первого перехода по метке
        </p>
      </template>
      <template v-else>
        <MoleculesWebLandingSelect
          ref="landingField"
          v-model="landingId"
          :options="landingChoices"
          :labelled-by="`${landingErrorId}-label`"
          :error="fieldErrors.landing ?? null"
          :described-by="fieldErrors.landing ? landingErrorId : undefined"
        />
        <AtomsWebFieldError v-if="fieldErrors.landing" :id="landingErrorId" :text="fieldErrors.landing" />
        <p v-else class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">
          Что увидит человек, открывший приложение по метке. Сменить лендинг можно до первого перехода по метке.
        </p>
      </template>
    </div>

    <div class="mt-5">
      <MoleculesWebTextField
        ref="placementField"
        v-model="placement"
        label="Место размещения"
        hint="Офис и место, канал, кому раздавали — чтобы через месяц было понятно, где висит."
        :error="fieldErrors.placement ?? null"
      />
    </div>

    <div v-if="mode === 'create'" ref="codeGroup" class="mt-5">
      <p class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">Ссылка</p>
      <MoleculesWebLinkField
        size="form"
        :link="shownLink"
        :code="code"
        refreshable
        :error="fieldErrors.code ?? null"
        :described-by="fieldErrors.code ? codeErrorId : undefined"
        @refresh="emit('refreshCode')"
      />
      <AtomsWebFieldError v-if="fieldErrors.code" :id="codeErrorId" :text="fieldErrors.code" />
      <p v-else class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">
        Код в конце ссылки подбирается автоматически — это и есть метка. После создания ссылку изменить
        нельзя: её напечатают на носителе. QR появится в карточке метки сразу после создания.
      </p>
    </div>

    <div class="mt-7 flex items-center justify-end gap-3">
      <AtomsWebActionButton label="Отмена" size="page" variant="quiet" @click="emit('cancel')" />
      <AtomsWebActionButton :label="submitting ? 'Сохраняем…' : mode === 'create' ? 'Создать метку' : 'Сохранить'" size="page" submit />
    </div>
  </form>
</template>
