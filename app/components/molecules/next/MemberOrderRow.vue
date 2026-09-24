<script setup lang="ts">
import { computed } from 'vue';
import type { MemberOrderRowView, MemberOrderStatus } from '~/types/memberView';

/**
 * Заказ строкой — в разделе «Мои заказы» (`full`) и на главной (`compact`).
 *
 * Строка, а не карточка заказа: состав, адрес офиса и отмена живут на экране заказа,
 * нажатие открывает его. Кода в строке нет — он виден любому, кто заглянул через плечо,
 * а нужен один раз и у стойки; отсюда следствие — строка обязана открываться.
 *
 * `full` — номер, состояние, сумма с подписью, офис и строка-действие внизу. Сумма обычным
 * цветом: здесь каждая строка и так про списание, алым был бы весь экран.
 *
 * `compact` — на главной показываются только висящие: номер, состояние со сроком и офисом,
 * шеврон. Суммы нет — блок отвечает на «за чем идти и до когда».
 *
 * Висящий зелёный — «сходи и забери»; выданный спокойный, со словом зелёным;
 * отменённый спокойный, со словом алым. Закрытые не гасятся прозрачностью: это запись,
 * к которой возвращаются с вопросом «что я тогда заказывал».
 */
type OrderRowVariant = 'full' | 'compact';

const props = defineProps<{
  order: MemberOrderRowView;
  variant: OrderRowVariant;
}>();

defineEmits<{ open: [] }>();

const STATE_TONES: Record<MemberOrderStatus, 'green' | 'scarlet'> = {
  pending: 'green',
  issued: 'green',
  cancelled: 'scarlet',
};

const isPending = computed(() => props.order.status === 'pending');
</script>

<template>
  <AtomsNextMemberCard v-if="variant === 'compact'" tone="green" clickable @click="$emit('open')">
    <span class="flex items-center gap-3 px-3.5 py-[13px]">
      <span class="flex min-w-0 grow flex-col gap-0.5">
        <span class="text-[16px] font-bold">{{ order.title }}</span>
        <AtomsNextMemberStateLine :tone="STATE_TONES[order.status]" :state="order.state" :hint="order.hint" />
      </span>
      <AtomsNextMemberChevron tone="green" />
    </span>
  </AtomsNextMemberCard>

  <AtomsNextMemberCard v-else :tone="isPending ? 'green' : 'plain'" clickable @click="$emit('open')">
    <span class="flex flex-col gap-[3px] px-4 py-3.5">
      <span class="flex items-start gap-3">
        <span class="flex min-w-0 grow flex-col">
          <span class="text-[16px]" :class="order.status === 'issued' ? 'font-semibold' : 'font-bold'">{{ order.title }}</span>
          <span class="mt-[5px]">
            <AtomsNextMemberStateLine :tone="STATE_TONES[order.status]" :state="order.state" :hint="order.hint" />
          </span>
          <span v-if="order.reason" class="text-[13px] font-light text-xb-grey">{{ order.reason }}</span>
        </span>
        <span v-if="order.amount" class="flex shrink-0 flex-col items-end gap-0.5">
          <span class="text-[17px] font-bold tabular-nums text-xb-secondary">{{ order.amount }}</span>
          <span v-if="order.amountCaption" class="text-[12px] font-light text-xb-grey">{{ order.amountCaption }}</span>
        </span>
      </span>
      <span v-if="order.office" class="mt-1.5 text-[13px] font-light text-xb-grey">{{ order.office }}</span>
      <span v-if="order.actionLabel" class="mt-3">
        <AtomsNextMemberCardAction :label="order.actionLabel" :tone="isPending ? 'green' : 'grey'" />
      </span>
    </span>
  </AtomsNextMemberCard>
</template>
