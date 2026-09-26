<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute } from 'vue-router';
import { useDemoEditor } from '~/composables/useDemoEditor';
import { useDraftAutosave } from '~/composables/useDraftAutosave';
import { failureText } from '~/utils/requestError';
import { toLoadState } from '~/utils/loadState';
import { productPublishProblems, productPublishProblemText } from '#shared/product';
import type {
  Product,
  ProductCreateRequestBody,
  ProductRequestBody,
  ProductResponse,
} from '#shared/types/catalog';

/**
 * Экран товара: новый, черновик и опубликованный — одна страница (issue #148).
 *
 * **Новый** — `/products/new`. Записи нет, пока человек ничего не сделал: открыл и ушёл —
 * в каталоге пусто. Первый набранный символ или выбранное фото заводит черновик, и адрес
 * меняется на адрес записи — без перехода: страница та же (`key` ниже), и курсор остаётся
 * в поле. Перезагрузка после этого поднимает черновик целиком, с текстом и фото.
 *
 * **Черновик** сохраняет себя сам, публикуется отдельным действием — только полным,
 * и причины называются все сразу — и удаляется целиком, вместе с фото.
 *
 * **Опубликованный** живёт как раньше: правка кнопкой «Сохранить», архив вместо удаления.
 *
 * Фото уезжает своим запросом — `multipart/form-data` с одним файлом, — а не полем правки:
 * собрать в одном запросе текстовые поля и файл можно, но тогда каждая правка цены
 * отправляла бы картинку заново.
 *
 * **Демо** (issue #212): поле «Демо» у нового товара видит только владелец, и уходит оно
 * одним заведением — в поля автосохранения не входит, потому что после заведения
 * не меняется. Демо-товар у остальных открывается на чтение: без автосохранения и кнопок.
 */

definePageMeta({
  middleware: 'catalog-access',
  // Один экземпляр страницы на `/products/new` и адрес заведённого из него черновика: смена
  // адреса после заведения не пересоздаёт форму, и набранное в ней не теряется.
  key: 'product-editor',
});

/** Адрес нового товара. Идентификатором не является — ручкам он не уходит. */
const NEW_PRODUCT = 'new';

/**
 * Поля формы — строками все, включая признаки: автосохранение сравнивает снимки полей,
 * а строка — единственное, что у него сравнивается без оговорок. Так же у акции.
 */
type ProductFormFields = Omit<ProductRequestBody, 'promo' | 'hiddenInCatalog'> & {
  promo: 'yes' | '';
  hiddenInCatalog: 'yes' | '';
};

const route = useRoute();
const routeId = computed(() => String(route.params.productId));

// За товаром ходим один раз — при открытии адреса записи. Смена адреса запрос не повторяет
// сама (`watch: false`): после заведения черновика запись уже на руках, а переход к другой
// записи разбирает `watch` ниже.
const { data, status, refresh } = await useFetch<ProductResponse>(
  () => `/api/products/${routeId.value}`,
  { immediate: routeId.value !== NEW_PRODUCT, watch: false },
);

const product = computed<Product | null>(() => data.value?.product ?? null);

const setProduct = (next: Product): void => {
  data.value = { product: next };
};

const toFields = (source: Product | null): ProductFormFields => ({
  name: source?.name ?? '',
  description: source?.description ?? '',
  pricePoints: source?.pricePoints == null ? '' : String(source.pricePoints),
  priceRetail: source?.priceRetail == null ? '' : String(source.priceRetail),
  priceCost: source?.priceCost == null ? '' : String(source.priceCost),
  promo: source?.promo ? 'yes' : '',
  hiddenInCatalog: source?.hiddenInCatalog ? 'yes' : '',
});

const toRequestBody = (snapshot: ProductFormFields): ProductRequestBody => ({
  ...snapshot,
  promo: snapshot.promo === 'yes',
  hiddenInCatalog: snapshot.hiddenInCatalog === 'yes',
});

/** То, что на экране. Ответ сервера его не перезаписывает. */
const fields = ref<ProductFormFields>(toFields(product.value));

const promo = computed({
  get: () => fields.value.promo === 'yes',
  set: (value: boolean) => {
    fields.value = { ...fields.value, promo: value ? 'yes' : '' };
  },
});

const hiddenInCatalog = computed({
  get: () => fields.value.hiddenInCatalog === 'yes',
  set: (value: boolean) => {
    fields.value = { ...fields.value, hiddenInCatalog: value ? 'yes' : '' };
  },
});

const { ownsDemo, canEdit } = useDemoEditor();

/** Поле «Демо» нового товара. Уходит только заведением. */
const demo = ref(false);

/** Правит ли вошедший этот товар: демо — только владелец. */
const editable = computed(() => canEdit(product.value?.isDemo ?? false));

const isDraft = computed(() => product.value === null || product.value.publishedAt === null);
const archived = computed(() => product.value?.archivedAt != null);

/**
 * Три состояния экрана. Новый товар читать неоткуда — он готов сразу, и заведённый из него
 * черновик тоже: запрос за ним не шёл, запись пришла ответом заведения.
 */
const state = computed(() =>
  product.value !== null || routeId.value === NEW_PRODUCT ? 'ready' : toLoadState(status.value),
);

useHead({
  title: () => `${fields.value.name.trim() || (product.value ? 'Черновик товара' : 'Новый товар')} — XalqBonus`,
});

/**
 * Сохранение черновика: первое заводит запись и переводит адрес на неё, остальные правят.
 *
 * Адрес меняется заменой, а не переходом: «назад» из черновика ведёт в каталог, а не на пустую
 * форму, которая завела бы второй черновик.
 */
const saveDraft = async (snapshot: ProductFormFields): Promise<void> => {
  const current = product.value;

  if (current === null) {
    const created = await $fetch<ProductResponse>('/api/products', {
      method: 'POST',
      body: { ...toRequestBody(snapshot), isDemo: demo.value } satisfies ProductCreateRequestBody,
    });

    setProduct(created.product);
    await navigateTo(`/products/${created.product.productId}`, { replace: true });

    return;
  }

  const updated = await $fetch<ProductResponse>(`/api/products/${current.productId}`, {
    method: 'PATCH',
    body: toRequestBody(snapshot),
  });

  setProduct(updated.product);
};

const autosave = useDraftAutosave({
  fields,
  save: saveDraft,
  enabled: () => isDraft.value && editable.value,
});

/**
 * Поля в том виде, в каком их хранит сервер: края текста обрезаны, число без лишних нулей.
 * Без этого « Тряпка» на экране и «Тряпка» в базе считались бы несохранённой правкой.
 */
const normalizeFields = (source: ProductFormFields): ProductFormFields => {
  const number = (value: string): string => (value.trim() === '' ? '' : String(Number(value)));

  return {
    name: source.name.trim(),
    description: source.description.trim(),
    pricePoints: number(source.pricePoints),
    priceRetail: number(source.priceRetail),
    priceCost: number(source.priceCost),
    promo: source.promo,
    hiddenInCatalog: source.hiddenInCatalog,
  };
};

/**
 * Есть ли у опубликованного товара правки, не отправленные кнопкой «Сохранить».
 *
 * Сравниваются поля экрана с загруженным товаром. Фото сюда не входит: оно уходит на сервер
 * сразу при выборе и несохранённым не бывает. У черновика несохранённого ждать некому —
 * он сохраняет себя сам, и перехвата ухода у него нет.
 */
const hasUnsavedEdits = computed(
  () =>
    !isDraft.value &&
    product.value !== null &&
    JSON.stringify(normalizeFields(fields.value)) !==
      JSON.stringify(normalizeFields(toFields(product.value))),
);

/**
 * Уход с изменённой формы опубликованного товара спрашивает подтверждение (PR #149).
 *
 * До черновиков кнопка «Сохранить» стояла во всех формах; теперь соседняя форма сохраняется
 * сама, и привычка «оно само» появится именно здесь. Поэтому переход не отменяется молча,
 * а ждёт ответа диалога: страница держит его обещание, пока человек не нажал кнопку.
 */
const leaveDialogOpen = ref(false);
let answerLeave: ((leave: boolean) => void) | null = null;

onBeforeRouteLeave(() => {
  if (!hasUnsavedEdits.value) {
    return true;
  }

  leaveDialogOpen.value = true;

  return new Promise<boolean>((resolve) => {
    answerLeave = resolve;
  });
});

const resolveLeave = (leave: boolean): void => {
  leaveDialogOpen.value = false;
  answerLeave?.(leave);
  answerLeave = null;
};

// Закрытие вкладки и перезагрузку дождаться нельзя: там диалог браузера, и другого не бывает.
const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
  if (hasUnsavedEdits.value) {
    event.preventDefault();
  }
};

onMounted(() => window.addEventListener('beforeunload', warnBeforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', warnBeforeUnload));

// Переход к другой записи на той же странице — копией, историей браузера: поля подменяются
// прочитанной записью. Свой же только что заведённый черновик сюда не попадает — он уже на руках.
watch(routeId, async (id) => {
  if (id === NEW_PRODUCT) {
    data.value = undefined;
    demo.value = false;
    autosave.replace(toFields(null));

    return;
  }

  if (id === product.value?.productId) {
    return;
  }

  data.value = undefined;
  await refresh();
  autosave.replace(toFields(product.value));
});

/** Причины, по которым черновик не публикуется, — по тому, что на экране. */
const publishProblems = computed(() =>
  productPublishProblems({
    name: fields.value.name.trim() || null,
    pricePoints: fields.value.pricePoints.trim() === '' ? null : Number(fields.value.pricePoints),
    priceRetail: fields.value.priceRetail.trim() === '' ? null : Number(fields.value.priceRetail),
    priceCost: fields.value.priceCost.trim() === '' ? null : Number(fields.value.priceCost),
    promo: promo.value,
  }).map(productPublishProblemText),
);

const saving = ref(false);
const saveError = ref<string | null>(null);

/** Правка опубликованного — кнопкой, как раньше. */
const savePublished = async (): Promise<void> => {
  const current = product.value;

  if (!current) {
    return;
  }

  saving.value = true;
  saveError.value = null;

  try {
    const updated = await $fetch<ProductResponse>(`/api/products/${current.productId}`, {
      method: 'PATCH',
      body: toRequestBody(fields.value),
    });

    setProduct(updated.product);
  } catch (error) {
    saveError.value = failureText(error);
  } finally {
    saving.value = false;
  }
};

const acting = ref(false);
const actionError = ref<string | null>(null);

const runAction = async (request: () => Promise<void>): Promise<void> => {
  acting.value = true;
  actionError.value = null;

  try {
    await request();
  } catch (error) {
    actionError.value = failureText(error);
  } finally {
    acting.value = false;
  }
};

/**
 * Публикация судит по тому, что на экране: несохранённое досохраняется перед ней. Не вышло —
 * причина уже стоит у отметки сохранения, и публиковать прежнее состояние нельзя.
 */
const publish = (): Promise<void> =>
  runAction(async () => {
    if (!(await autosave.flush()) || !product.value) {
      return;
    }

    const published = await $fetch<ProductResponse>(
      `/api/products/${product.value.productId}/publish`,
      { method: 'POST' },
    );

    setProduct(published.product);
  });

/** Удаление черновика вместе с фото. Правка, не успевшая уехать, бросается — удаляем же. */
const removeDraft = (): Promise<void> =>
  runAction(async () => {
    if (!window.confirm('Удалить черновик вместе с фото? Вернуть его будет нельзя.')) {
      return;
    }

    await autosave.discard();

    const current = product.value;

    if (current) {
      await $fetch(`/api/products/${current.productId}`, { method: 'DELETE' });
    }

    await navigateTo('/products');
  });

const toggleArchive = (): Promise<void> =>
  runAction(async () => {
    const current = product.value;

    if (!current) {
      return;
    }

    const updated = await $fetch<ProductResponse>(
      `/api/products/${current.productId}/${archived.value ? 'unarchive' : 'archive'}`,
      { method: 'POST' },
    );

    setProduct(updated.product);
  });

const uploading = ref(false);
const photoError = ref<string | null>(null);

/**
 * Фото — в один шаг. Черновика ещё нет — заводим его этим же выбором и кладём файл к нему.
 *
 * Тело собирается `FormData`: заголовок `multipart/form-data` с границей ставит браузер сам,
 * и задавать его руками нельзя — граница в нём не совпадёт с телом. Ответ несёт новый
 * `updated_at` — версию адреса картинки, без неё браузер показывал бы прежнюю.
 */
const upload = async (file: File): Promise<void> => {
  uploading.value = true;
  photoError.value = null;

  try {
    if (product.value === null && !(await autosave.saveNow())) {
      photoError.value = autosave.error.value;

      return;
    }

    const current = product.value;

    if (!current) {
      return;
    }

    const body = new FormData();

    body.append('photo', file);

    const updated = await $fetch<ProductResponse>(`/api/products/${current.productId}/photo`, {
      method: 'POST',
      body,
    });

    setProduct(updated.product);
  } catch (error) {
    photoError.value = failureText(error);
  } finally {
    uploading.value = false;
  }
};
</script>

<template>
  <div class="space-y-6">
    <MoleculesConfirmDialog
      :open="leaveDialogOpen"
      title="Уйти без сохранения?"
      message="Правки товара не сохранены и пропадут. Фото это не касается — оно уже загружено."
      confirm-label="Уйти без сохранения"
      cancel-label="Остаться"
      @confirm="resolveLeave(true)"
      @cancel="resolveLeave(false)"
    />
    <MoleculesConfirmDialog
      :open="autosave.leaveFailureOpen.value"
      title="Уйти без сохранения?"
      :message="`Последняя правка черновика не сохранилась: ${autosave.error.value ?? ''} Если уйти, она пропадёт.`"
      confirm-label="Уйти без сохранения"
      cancel-label="Остаться"
      @confirm="autosave.resolveLeave(true)"
      @cancel="autosave.resolveLeave(false)"
    />

    <div>
      <NuxtLink to="/products" class="text-sm text-slate-500 underline underline-offset-2">
        ← Весь каталог
      </NuxtLink>
      <div class="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 class="text-xl font-semibold text-slate-900">
          {{ fields.name.trim() || (product ? 'Без названия' : 'Новый товар') }}
        </h1>
        <AtomsStatusBadge v-if="state === 'ready' && isDraft" tone="warn" label="Черновик" />
        <AtomsStatusBadge v-else-if="archived" tone="muted" label="В архиве" />
        <AtomsStatusBadge v-if="product?.isDemo" tone="demo" label="ДЕМО" />
      </div>
      <p v-if="product?.isDemo" class="mt-1 text-sm text-slate-500">
        Демо-товар: его видит и заказывает только демо-водитель.
        {{ editable ? '' : 'Менять его может только владелец.' }}
      </p>
      <p v-if="state === 'ready' && isDraft" class="mt-1 text-sm text-slate-500">
        Водителю не виден нигде, пока товар не опубликован.
      </p>
      <p v-else-if="archived" class="mt-1 text-sm text-slate-500">
        Товар в архиве: водителю не показывается, но остаётся в истории заказов и в остатках.
      </p>
    </div>

    <MoleculesStateNotice v-if="state === 'loading'" state="loading" message="Читаем товар…" />
    <MoleculesStateNotice
      v-else-if="state === 'error'"
      state="error"
      message="Товар не прочитался. Это отказ запроса, а не отсутствие товара."
    />
    <template v-else>
      <MoleculesSectionPanel v-if="product === null && ownsDemo" title="Для кого">
        <MoleculesDemoField
          v-model="demo"
          hint="Демо-товар видит и заказывает только демо-водитель, живым он не показывается."
        />
      </MoleculesSectionPanel>

      <OrganismsProductForm
        v-model:name="fields.name"
        v-model:description="fields.description"
        v-model:price-points="fields.pricePoints"
        v-model:price-retail="fields.priceRetail"
        v-model:price-cost="fields.priceCost"
        v-model:promo="promo"
        v-model:hidden-in-catalog="hiddenInCatalog"
        :title="isDraft ? 'Черновик' : 'Правка товара'"
        :product="product"
        :mode="isDraft ? 'draft' : 'published'"
        :autosave-state="autosave.state.value"
        :autosave-error="autosave.error.value"
        :saving="saving"
        :error="saveError"
        :uploading="uploading"
        :photo-error="photoError"
        :readonly="!editable"
        @submit="savePublished"
        @upload="upload"
        @retry="autosave.retry"
      />

      <template v-if="editable && isDraft">
        <MoleculesSectionPanel
          title="Публикация"
          note="После публикации товар живёт как любой другой: попадает на витрину офиса, где лежит, принимает приход и уходит в архив, а не удаляется."
        >
          <AtomsActionButton
            label="Опубликовать"
            tone="primary"
            :disabled="acting || product === null || publishProblems.length > 0"
            @click="publish"
          />
          <ul
            v-if="publishProblems.length > 0"
            class="mt-3 list-inside list-disc space-y-0.5 text-sm text-red-700"
          >
            <li v-for="problem in publishProblems" :key="problem">{{ problem }}</li>
          </ul>
          <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
        </MoleculesSectionPanel>

        <MoleculesSectionPanel
          v-if="product"
          title="Удаление"
          note="Черновик удаляется целиком, вместе с фото: ни заказов, ни остатков у него нет. Брошенный черновик сам не удаляется — только этой кнопкой."
        >
          <AtomsActionButton
            label="Удалить черновик"
            tone="danger"
            :disabled="acting"
            @click="removeDraft"
          />
        </MoleculesSectionPanel>
      </template>

      <MoleculesSectionPanel
        v-else-if="editable"
        title="Архив"
        note="Удаления нет: на товар ссылаются позиции заказов, и позиция обязана помнить, что именно было заказано."
      >
        <AtomsActionButton
          :label="archived ? 'Вернуть из архива' : 'Убрать в архив'"
          :tone="archived ? 'primary' : 'danger'"
          :disabled="acting"
          @click="toggleArchive"
        />
        <p v-if="actionError" class="mt-3 text-sm text-red-700">{{ actionError }}</p>
      </MoleculesSectionPanel>
    </template>
  </div>
</template>
