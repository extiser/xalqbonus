<script setup lang="ts">
import { computed } from 'vue';
import type { MemberItemTone } from '~/types/memberView';

/**
 * Карточка в списке раздела — заказ и награда одним элементом: `_reference/design/orders/orders-screen.html`
 * (`.order`, в `rewards-screen.html` побайтно тот же).
 *
 * Сверху вниз: название, у награды — откуда она, состояние, у закрытой — причина серым; справа
 * у заказа сумма с подписью, что стало с баллами. Ниже офис и строка-действие, отбитая линией.
 * Шапка в две колонки: подпись под суммой делает правый столбик выше, и иначе состояние уезжало бы
 * от названия на целую строку.
 *
 * Кода в карточке нет — он виден любому, кто заглянул через плечо, а нужен один раз и у стойки;
 * отсюда следствие — карточка открывается. Строка-действие говорит, что будет за нажатием:
 * зелёным зовёт только ждущая, закрытые — «Просмотреть» серым. Действия нет — карточка
 * не нажимается: баллам на балансе экран не нужен.
 *
 * Закрытые не гасятся прозрачностью: это запись, к которой возвращаются с вопросом
 * «что я тогда заказывал».
 */
const props = defineProps<{
  title: string;
  /** Откуда награда: «Акция «Неделя возвращения» · сундук недели». */
  origin?: string;
  /** Слово состояния: «Ждёт выдачи», «Получена». */
  state: string;
  /** Уточнение после точки: срок или дата. */
  hint?: string;
  tone: MemberItemTone;
  /** Причина отдельной строкой: «Вы отменили заказ». */
  reason?: string;
  /** Сумма справа: «900 баллов». */
  amount?: string;
  /** Подпись под суммой: «списано со счёта», «вернулось на счёт». */
  amountCaption?: string;
  /** «Офис · Чиланзар». */
  office?: string;
  /** Строка-действие внизу: «Код для выдачи — внутри», «Просмотреть». */
  action?: string;
}>();

defineEmits<{ open: [] }>();

const STATE_TONES: Record<MemberItemTone, 'green' | 'scarlet'> = {
  waiting: 'green',
  issued: 'green',
  credited: 'green',
  cancelled: 'scarlet',
};

const isWaiting = computed(() => props.tone === 'waiting');
</script>

<template>
  <AtomsNextMemberCard :tone="isWaiting ? 'green' : 'plain'" :clickable="Boolean(action)" @click="$emit('open')">
    <span class="flex flex-col gap-[3px] px-4 py-3.5 leading-[normal]">
      <span class="flex items-start gap-3">
        <span class="flex min-w-0 grow flex-col">
          <span class="text-[16px]" :class="tone === 'issued' ? 'font-semibold' : 'font-bold'">{{ title }}</span>
          <span v-if="origin" class="mt-0.5 text-[13px] font-light text-xb-grey">{{ origin }}</span>
          <span class="mt-[5px]">
            <AtomsNextMemberStateLine :tone="STATE_TONES[tone]" :state="state" :hint="hint" />
          </span>
          <span v-if="reason" class="text-[13px] font-light text-xb-grey">{{ reason }}</span>
        </span>
        <span v-if="amount" class="flex shrink-0 flex-col items-end gap-0.5">
          <span class="text-[17px] font-bold tabular-nums text-xb-secondary">{{ amount }}</span>
          <span v-if="amountCaption" class="text-[12px] font-light text-xb-grey">{{ amountCaption }}</span>
        </span>
      </span>
      <span v-if="office" class="mt-1.5 text-[13px] font-light text-xb-grey">{{ office }}</span>
      <span v-if="action" class="mt-3">
        <AtomsNextMemberCardAction :label="action" :tone="isWaiting ? 'green' : 'grey'" />
      </span>
    </span>
  </AtomsNextMemberCard>
</template>
