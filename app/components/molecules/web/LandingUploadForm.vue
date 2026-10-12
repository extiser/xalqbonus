<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue';
import { PhDownloadSimple, PhFileZip } from '@phosphor-icons/vue';
import { WEB_LANGUAGE } from '#shared/denials';
import { LANDING_MAX_ARCHIVE_BYTES } from '#shared/landings';
import { landingDenialText, type LandingField } from '#shared/promo';
import type { LandingCheckResult } from '#shared/types/landings';

/**
 * Окно «Загрузить лендинг» и «Заменить лендинг» (issue #478) — `_reference/design/web/promo/05-landing-upload.html`.
 * Ставится в `MoleculesWebDialog`.
 *
 * Название и архив `.zip`. Пока файл не выбран — область «Выберите архив .zip» с кнопкой выбора;
 * выбран — имя, размер и «Другой файл». Выбор файла уходит событием `pick`: страница сразу
 * зовёт проверку и приносит её итог (`check`). Архив больше 5 МБ отбивается при выборе, до
 * запроса, — текстом из словаря отказов под полем: сервер отказал бы тем же.
 *
 * Не прошедший проверку архив загрузить можно: лендинг сохранится, но выбрать его у метки будет
 * нельзя. «Загрузить» доступна, когда есть название и файл.
 *
 * Замена (`replace`) — то же окно: название показано без правки, кнопка «Заменить».
 *
 * Ошибки по полям присылает сервер (`fieldErrors`) — встают под поле алым, первое поле с ошибкой
 * получает фокус, правка поля снимает его ошибку (`edit`). Не про поле — плашкой над полями.
 * Запросов форма не делает.
 */
export type LandingUploadValues = {
  name: string;
  file: File;
};

const props = withDefaults(
  defineProps<{
    mode: 'upload' | 'replace';
    /** Название лендинга при замене — показано без правки. */
    fixedName?: string;
    /** Итог проверки выбранного архива; `null` — файла нет или проверка ещё не пришла. */
    check: LandingCheckResult | null;
    checking: boolean;
    /** Проверка не дошла — сеть, сервер. */
    checkError: string | null;
    fieldErrors: Partial<Record<LandingField, string>>;
    formError: string | null;
    submitting: boolean;
  }>(),
  { fixedName: '' },
);

const emit = defineEmits<{
  pick: [file: File];
  submit: [values: LandingUploadValues];
  cancel: [];
  edit: [field: LandingField];
}>();

const name = ref('');
const file = ref<File | null>(null);
/** Архив больше потолка — отбит при выборе, на сервер не уходил. */
const sizeError = ref<string | null>(null);

const nameField = ref<{ focus: () => void } | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const pickButton = ref<HTMLElement | null>(null);

const fileErrorId = useId();
const fileHintId = useId();

const fileError = computed(() => sizeError.value ?? props.fieldErrors.file ?? null);

watch(name, () => emit('edit', 'name'));

const ready = computed(
  () => (props.mode === 'replace' || name.value.trim() !== '') && file.value !== null && sizeError.value === null,
);

const choose = (): void => {
  fileInput.value?.click();
};

const onFileChange = (event: Event): void => {
  const input = event.target as HTMLInputElement;
  const picked = input.files?.[0];

  // Тот же файл второй раз браузер не прислал бы: значение поля сбрасывается сразу.
  input.value = '';

  if (!picked) return;

  file.value = picked;
  emit('edit', 'file');

  if (picked.size > LANDING_MAX_ARCHIVE_BYTES) {
    sizeError.value = landingDenialText('landing_archive_too_large', WEB_LANGUAGE);

    return;
  }

  sizeError.value = null;
  emit('pick', picked);
};

/** «412 КБ», «1,4 МБ». */
const formatSize = (bytes: number): string => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;

  return `${(bytes / (1024 * 1024)).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
};

watch(
  () => props.fieldErrors,
  async (errors) => {
    await nextTick();

    if (errors.name !== undefined) nameField.value?.focus();
    else if (errors.file !== undefined) pickButton.value?.focus();
  },
);

const submit = (): void => {
  if (!ready.value || file.value === null) return;

  emit('submit', { name: props.mode === 'replace' ? props.fixedName : name.value, file: file.value });
};

const SECONDARY_BUTTON =
  'inline-flex h-12 shrink-0 cursor-pointer items-center rounded-[14px] border-0 bg-web-raised px-4 font-manrope text-[14px] font-semibold whitespace-nowrap text-web-title inset-ring inset-ring-web-line hover:text-web-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan';
</script>

<template>
  <form novalidate class="mt-1" @submit.prevent="submit">
    <div v-if="formError" class="mt-5">
      <AtomsWebFormAlert :text="formError" />
    </div>

    <div class="mt-5">
      <MoleculesWebTextField
        v-if="mode === 'upload'"
        ref="nameField"
        v-model="name"
        label="Название"
        required
        autofocus
        hint="Так лендинг называется в списке и в выборе у метки. Видно только сотрудникам."
        :error="fieldErrors.name ?? null"
      />
      <template v-else>
        <p class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">Название</p>
        <p
          class="m-0 flex h-12 items-center overflow-hidden rounded-[14px] bg-web-cyan/4 px-4 font-manrope text-[15px] font-medium text-ellipsis whitespace-nowrap text-web-title"
        >
          {{ fixedName }}
        </p>
      </template>
    </div>

    <div class="mt-5">
      <p class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">
        Архив<span class="ml-0.5 text-web-scarlet" aria-hidden="true">*</span>
      </p>
      <input ref="fileInput" type="file" accept=".zip" class="sr-only" tabindex="-1" aria-hidden="true" @change="onFileChange" />
      <div class="flex items-center gap-2">
        <div
          class="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-[14px] bg-web-raised px-4 font-manrope text-[15px] font-medium"
          :class="fileError ? 'inset-ring-[1.5px] inset-ring-web-scarlet' : 'inset-ring inset-ring-web-line'"
        >
          <PhFileZip weight="duotone" aria-hidden="true" class="size-[22px] shrink-0 text-web-cyan" />
          <template v-if="file">
            <span class="min-w-0 overflow-hidden font-semibold text-ellipsis whitespace-nowrap text-web-text">{{ file.name }}</span>
            <span class="shrink-0 text-[13px] whitespace-nowrap text-web-grey">{{ formatSize(file.size) }}</span>
          </template>
          <span v-else class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-web-axis">Выберите архив .zip</span>
        </div>
        <button
          ref="pickButton"
          type="button"
          :class="SECONDARY_BUTTON"
          :aria-invalid="fileError ? 'true' : undefined"
          :aria-describedby="fileError ? fileErrorId : fileHintId"
          @click="choose"
        >
          {{ file ? 'Другой файл' : 'Выбрать файл' }}
        </button>
      </div>
      <AtomsWebFieldError v-if="fileError" :id="fileErrorId" :text="fileError" />
      <p v-else :id="fileHintId" class="m-0 mt-1.5 font-manrope text-[12px] leading-[1.45] text-web-grey">
        Файл .zip. В корне лежит index.html, картинки рядом.
      </p>
      <a
        href="/landing-template.zip"
        download
        class="mt-2.5 inline-flex items-center gap-1.5 font-manrope text-[13px] font-semibold text-web-cyan no-underline hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan"
      >
        <PhDownloadSimple weight="duotone" aria-hidden="true" class="size-4" />Скачать шаблон
      </a>
    </div>

    <div v-if="file && !sizeError && !fieldErrors.file" class="mt-5" aria-live="polite">
      <p class="m-0 mb-2 font-manrope text-[13px] font-semibold text-web-title">Проверка</p>
      <AtomsWebHint v-if="checking" text="Проверяем архив…" />
      <AtomsWebFormAlert v-else-if="checkError" :text="checkError" />
      <template v-else-if="check">
        <MoleculesWebLandingChecks :checks="check.checks" boxed />
        <p v-if="!check.passed" class="m-0 mt-3 font-manrope text-[13px] leading-[1.45] text-web-title">
          Лендинг сохранится, но выбрать его у метки будет нельзя. Исправьте архив и замените лендинг.
        </p>
      </template>
    </div>

    <div class="mt-7 flex items-center justify-end gap-3">
      <AtomsWebActionButton label="Отмена" size="page" variant="quiet" @click="emit('cancel')" />
      <AtomsWebActionButton
        :label="submitting ? 'Загружаем…' : mode === 'upload' ? 'Загрузить' : 'Заменить'"
        size="page"
        submit
        :disabled="!ready"
      />
    </div>
  </form>
</template>
