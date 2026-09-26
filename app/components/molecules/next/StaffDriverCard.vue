<script setup lang="ts">
import type { StaffDriverView } from '~/types/staffView';

/**
 * Водитель на карточке заказа и награды у стойки — `_reference/design/staff/03-order-card.html`,
 * `.who`, `.row` (issue #250). Устройство — как карточка профиля водителя: фамилия крупно,
 * имя под ней, поля строками. По имени и позывному менеджер сверяет, тот ли водитель перед ним.
 *
 * Телефон — ссылкой `tel:`, строка нажимается целиком и звонит; справа круг с зелёной трубкой —
 * вид глазика у номера ВУ в профиле, трубка зелёная: это действие, а не поле.
 *
 * Чего нет в профиле — имени, позывного или телефона, — той строки нет.
 */
defineProps<{
  driver: StaffDriverView;
}>();
</script>

<template>
  <AtomsNextMemberCard tone="plain" divided>
    <MoleculesNextMemberPersonHead v-if="driver.lastName" :last-name="driver.lastName" :given-names="driver.givenNames" />
    <MoleculesNextMemberFieldRow v-if="driver.callsign" label="Позывной" :value="driver.callsign" />
    <a v-if="driver.phone" :href="driver.phone.href" class="block text-inherit no-underline active:bg-white/4">
      <MoleculesNextMemberFieldRow label="Телефон" :value="driver.phone.display">
        <template #aside>
          <span class="-mr-1.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[rgba(95,208,138,0.14)]" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
              <path
                d="M6.6 3.8l2.3-.4 1.6 3.9-1.8 1.3a11 11 0 005.1 5.1l1.3-1.8 3.9 1.6-.4 2.3c-.2 1-1 1.7-2 1.7C10.4 17.5 6.5 13.6 6.5 7.8c0-1 .7-1.8 1.7-2z"
                fill="#5FD08A"
              />
            </svg>
          </span>
        </template>
      </MoleculesNextMemberFieldRow>
    </a>
  </AtomsNextMemberCard>
</template>
