<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { PhCaretUpDown, PhUserCircle } from '@phosphor-icons/vue';
import { isCurrentPath, type NavigationItem } from '~/utils/navigation';
import { EMPLOYEE_ROLE_LABELS } from '#shared/employeeRoles';
import type { EmployeeIdentity } from '#shared/types/employee';

/**
 * Меню веба целиком — `.side` кодекса `_reference/design/web/codex.html` и экранов дашборда.
 *
 * На ноутбуке — колонка: знак, пункты, внизу блок «кто вошёл». Пункты прокручиваются по высоте,
 * знак и блок остаются на месте. На телефоне, ниже 900, — две отдельные плашки в зоне большого
 * пальца: панель пунктов с прокруткой вбок и круглая кнопка аккаунта; знака и блока «кто вошёл»
 * там нет (`codex.md`, «Раскладка и меню»).
 *
 * Меню аккаунта одно на оба вида: открывается блоком «кто вошёл» или кнопкой аккаунта,
 * закрывается повторным нажатием, щелчком мимо, Escape и переходом на другую страницу.
 *
 * Где меню стоит — колонкой у края окна или панелью внизу — решает раскладка: компонент
 * только заполняет отведённое ему место. За данными не ходит и выход сам не делает
 * (docs/frontend.md → «Данные в компоненты не ходят»).
 */
defineProps<{
  items: NavigationItem[];
  employee: EmployeeIdentity | null;
}>();

const emit = defineEmits<{ signOut: [] }>();

const route = useRoute();

const accountOpen = ref(false);
const accountArea = ref<HTMLElement | null>(null);

const toggleAccount = (): void => {
  accountOpen.value = !accountOpen.value;
};

const signOut = (): void => {
  accountOpen.value = false;
  emit('signOut');
};

const closeOnOutsideClick = (event: MouseEvent): void => {
  if (!accountOpen.value || !(event.target instanceof Node)) return;
  if (accountArea.value?.contains(event.target)) return;
  accountOpen.value = false;
};

const closeOnEscape = (event: KeyboardEvent): void => {
  if (event.key === 'Escape') accountOpen.value = false;
};

watch(
  () => route.fullPath,
  () => {
    accountOpen.value = false;
  },
);

onMounted(() => {
  document.addEventListener('click', closeOnOutsideClick);
  document.addEventListener('keydown', closeOnEscape);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', closeOnOutsideClick);
  document.removeEventListener('keydown', closeOnEscape);
});

/** Подложка плашки на телефоне: фон плитки 94 % с размытием, тень и контур. */
const PLATE_CLASSES =
  'max-web:pointer-events-auto max-web:bg-web-tile/94 max-web:shadow-[0_10px_30px_rgba(0,0,0,0.45)] max-web:inset-ring max-web:inset-ring-web-line max-web:backdrop-blur-[16px]';
</script>

<template>
  <!-- На телефоне промежуток между плашками нажатия не перехватывает: ловят только сами плашки. -->
  <aside
    class="flex h-full flex-col gap-1 rounded-3xl bg-web-tile px-3.5 py-[22px] font-manrope max-web:pointer-events-none max-web:h-auto max-web:flex-row max-web:items-stretch max-web:gap-2 max-web:rounded-none max-web:bg-transparent max-web:p-0"
  >
    <div class="px-2.5 pb-[18px] font-unbounded text-[15px] font-bold text-web-text max-web:hidden">
      Xalq Taxi <span class="text-web-cyan">Bonus</span>
    </div>

    <!-- Правый край панели на телефоне гаснет градиентом в цвет подложки — знак, что есть ещё. -->
    <nav
      class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto max-web:min-w-0 max-web:flex-row max-web:gap-0.5 max-web:overflow-x-auto max-web:overflow-y-hidden max-web:rounded-[26px] max-web:p-1.5 max-web:[scrollbar-width:none] max-web:after:pointer-events-none max-web:after:sticky max-web:after:-right-1.5 max-web:after:-ml-8 max-web:after:w-8 max-web:after:flex-none max-web:after:bg-linear-to-r max-web:after:from-transparent max-web:after:to-web-tile/94 max-web:[&::-webkit-scrollbar]:hidden"
      :class="PLATE_CLASSES"
    >
      <AtomsWebNavItem
        v-for="item in items"
        :key="item.path"
        :icon="item.icon"
        :title="item.title"
        :to="item.path"
        :current="isCurrentPath(route.path, item.path)"
      />
    </nav>

    <div v-if="employee" ref="accountArea" class="relative mt-2 max-web:pointer-events-auto max-web:mt-0 max-web:flex-none max-web:self-center">
      <button
        type="button"
        class="flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border-0 bg-web-raised p-3 text-left font-manrope text-[13px] leading-[1.45] text-web-title focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-web-cyan max-web:hidden"
        :aria-expanded="accountOpen"
        aria-controls="web-account-menu"
        @click="toggleAccount"
      >
        <span>
          <b class="font-semibold text-web-text">{{ employee.fullName }}</b><br />{{ EMPLOYEE_ROLE_LABELS[employee.role] }}
        </span>
        <PhCaretUpDown
          weight="duotone"
          aria-hidden="true"
          class="size-5 shrink-0"
          :class="accountOpen ? 'text-web-cyan' : 'text-web-grey'"
        />
      </button>

      <button
        type="button"
        aria-label="Аккаунт"
        class="hidden size-[66px] cursor-pointer place-items-center rounded-full border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-web-cyan max-web:grid"
        :class="[PLATE_CLASSES, accountOpen ? 'text-web-cyan' : 'text-web-grey']"
        :aria-expanded="accountOpen"
        aria-controls="web-account-menu"
        @click="toggleAccount"
      >
        <PhUserCircle weight="duotone" aria-hidden="true" class="size-[26px]" />
      </button>

      <!-- Над блоком «кто вошёл» по ширине колонки; на телефоне — над кнопкой, у правого края. -->
      <div
        v-if="accountOpen"
        id="web-account-menu"
        class="absolute inset-x-0 bottom-[calc(100%+8px)] z-20 max-web:left-auto max-web:min-w-[220px]"
      >
        <MoleculesWebAccountMenu :employee="employee" @sign-out="signOut" />
      </div>
    </div>
  </aside>
</template>
