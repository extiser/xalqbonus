<script setup lang="ts">
import type { MemberManagerIdsView } from '~/types/memberView';

/**
 * «Покажите менеджеру» — номер, с которым пришёл водитель, и его Telegram ID, у каждого
 * кнопка копирования. Единственные признаки, по которым в базе можно найти попытку, поэтому
 * они есть на каждом отказе регистрации и сначала идёт номер.
 *
 * Строки — поля профиля: подпись слева, значение табличными цифрами справа, копирование —
 * круг 32, как глазик у номера ВУ. Скопировано — значок сменяется зелёной галочкой на полторы
 * секунды, круг зеленеет; слов на экране нет. Одной подсветки круга не хватало — её не замечали
 * (`_reference/design/registration/registration-refused.html`, Руслан, 25-09-2026).
 *
 * Буфер обмена — единственное, куда компонент ходит сам: запроса в нём нет, а нажатие
 * без копирования было бы обманом. Где буфера нет (страница не по https), галочка всё равно
 * показывается — как в макете.
 */
type CopyTarget = 'phone' | 'telegramId';

const props = defineProps<MemberManagerIdsView>();

const rows = computed(() => [
  { target: 'phone' as const, label: props.texts.phoneLabel, value: props.phone.display, copyLabel: props.texts.copyPhone },
  { target: 'telegramId' as const, label: props.texts.telegramIdLabel, value: props.telegramId, copyLabel: props.texts.copyTelegramId },
]);

/** Сколько держится галочка после копирования. */
const COPIED_MS = 1500;

const copied = reactive<Record<CopyTarget, boolean>>({ phone: false, telegramId: false });
const timers: Partial<Record<CopyTarget, ReturnType<typeof setTimeout>>> = {};

function copy(target: CopyTarget): void {
  const value = target === 'phone' ? props.phone.copy : props.telegramId;

  try {
    void navigator.clipboard?.writeText(value).catch(() => undefined);
  } catch {
    // Буфер недоступен — галочка всё равно показывается, как в макете.
  }

  copied[target] = true;
  clearTimeout(timers[target]);
  timers[target] = setTimeout(() => {
    copied[target] = false;
  }, COPIED_MS);
}

onBeforeUnmount(() => {
  clearTimeout(timers.phone);
  clearTimeout(timers.telegramId);
});
</script>

<template>
  <div class="flex flex-col gap-2.5">
    <div class="px-0.5 pb-0.5">
      <AtomsNextMemberGroupLabel :label="texts.title" />
    </div>
    <AtomsNextMemberCard tone="plain" divided>
      <MoleculesNextMemberFieldRow
        v-for="row in rows"
        :key="row.target"
        :label="row.label"
        :value="row.value"
        spacing="even"
      >
        <template #aside>
          <span class="-mr-1.5 flex">
            <AtomsNextMemberIconButton :label="row.copyLabel" size="s" :done="copied[row.target]" @click="copy(row.target)">
              <svg v-if="copied[row.target]" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <path d="M5.5 12.5l4.2 4.2 8.8-9.2" stroke="#5FD08A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
                <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" stroke="#C2C9D3" stroke-width="1.7" />
                <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" stroke="#C2C9D3" stroke-width="1.7" />
              </svg>
            </AtomsNextMemberIconButton>
          </span>
        </template>
      </MoleculesNextMemberFieldRow>
    </AtomsNextMemberCard>
  </div>
</template>
