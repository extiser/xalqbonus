<script setup lang="ts">
import { computed } from 'vue';
import type { MemberOrderRowView, MemberOrderStatus } from '~/types/memberView';

/**
 * Заказ строкой на главной — `_reference/design/home/orders-block.html`: номер, состояние со сроком
 * и офисом, шеврон. В разделе «Мои заказы» заказ рисует `MemberItemCard`.
 *
 * Строка, а не карточка заказа: состав, адрес офиса и отмена живут на экране заказа,
 * нажатие открывает его. Кода в строке нет — он виден любому, кто заглянул через плечо,
 * а нужен один раз и у стойки; отсюда следствие — строка обязана открываться. Суммы нет —
 * блок отвечает на «за чем идти и до когда».
 *
 * Висящий — зелёной карточкой; ждущих нет — на главной один последний, выданный или отменённый,
 * спокойной карточкой с серым шевроном: за ним идти не нужно. Слово у выданного зелёное,
 * у отменённого алое.
 */
const props = defineProps<{
  order: MemberOrderRowView;
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
  <AtomsNextMemberCard :tone="isPending ? 'green' : 'plain'" clickable @click="$emit('open')">
    <span class="flex items-center gap-3 px-3.5 py-[13px]">
      <span class="flex min-w-0 grow flex-col gap-0.5 leading-[1.35]">
        <span class="text-[16px] leading-[normal]" :class="isPending ? 'font-bold' : 'font-semibold'">{{ order.title }}</span>
        <AtomsNextMemberStateLine :tone="STATE_TONES[order.status]" :state="order.state" :hint="order.hint" />
      </span>
      <AtomsNextMemberChevron :tone="isPending ? 'green' : 'grey'" />
    </span>
  </AtomsNextMemberCard>
</template>
