<script setup lang="ts">
/**
 * Шапка экранов сотрудника — `_reference/design/staff/01-office-picker.html` и `02-desk.html`,
 * `.bar` (issue #250).
 *
 * Раскладка и подложка — один в один с шапкой главной водителя: 68 = 14 + 40 + 14, липкая,
 * с размытием. Слева аватар — он ведёт в профиль, — имя и роль словом вместо позывного.
 * Баланса нет: у сотрудника его нет.
 *
 * На стойке справа — выбранный офис и под ним «Сменить»: как строка офиса в каталоге водителя,
 * только столбиком — в строку рядом с именем не влезает. Имя офиса 15/700, ссылка 14/500
 * подчёркнутой. «Сменить» нет у сотрудника с одним офисом. Кнопки «назад» нет: менеджер
 * за день работает в одном офисе, и уходить со стойки ему некуда.
 *
 * У демо-зрителя шапка липнет под полосой «Демо-аккаунт» — на её высоту (`--xb-demo-offset`).
 */
defineProps<{
  name: string;
  /** Роль словом: «Менеджер». */
  role: string;
  /** Выбранный офис. Нет — справа пусто: выбор офиса или сотрудник без офисов. */
  office?: string;
  /** «Сменить» под офисом. */
  canChange?: boolean;
}>();

defineEmits<{ profile: []; change: [] }>();
</script>

<template>
  <header
    class="sticky top-(--xb-demo-offset) z-[5] box-border flex h-[68px] items-center gap-3 border-b border-white/6 bg-[rgba(11,13,17,0.82)] px-4 pb-3.5 pt-[calc(14px+env(safe-area-inset-top))] font-manrope leading-[normal] backdrop-blur-[14px]"
  >
    <AtomsNextMemberIconButton label="Профиль" size="m" @click="$emit('profile')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.6" stroke="currentColor" stroke-width="1.8" />
        <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
      </svg>
    </AtomsNextMemberIconButton>

    <div class="min-w-0 grow">
      <AtomsNextMemberNameplate :name="name" :callsign="role" />
    </div>

    <div v-if="office" class="flex max-w-[45%] shrink-0 flex-col items-end gap-0.5">
      <b class="max-w-full truncate text-[15px] font-bold text-xb-text">{{ office }}</b>
      <button
        v-if="canChange"
        type="button"
        class="cursor-pointer border-0 bg-transparent p-0 font-manrope text-[14px] font-medium text-xb-light underline decoration-[rgba(169,178,191,0.4)] underline-offset-[3px]"
        @click="$emit('change')"
      >
        Сменить
      </button>
    </div>
  </header>
</template>
