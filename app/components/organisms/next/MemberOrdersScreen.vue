<script setup lang="ts">
import type { MemberOrderRowView, MemberViewLoad } from '~/types/memberView';

/**
 * Раздел «Мои заказы» — `_reference/design/orders/orders-screen.html`.
 *
 * Две группы, как у наград: сверху ждущие выдачи со счётчиком, ниже история заказов.
 * Подписи групп те же, что у дней в истории: разделы водителя выглядят одним приложением.
 * Строка открывает экран заказа — там код, офис и состав.
 */
defineProps<{
  state: MemberViewLoad;
  pending: MemberOrderRowView[];
  past: MemberOrderRowView[];
  /** Баланс справа в шапке — готовыми строками («Ваши баллы», «1 450»). */
  balance?: { label: string; amount: string };
  texts: {
    title: string;
    back: string;
    pendingGroup: string;
    pastGroup: string;
    empty: string;
    error: string;
    retry: string;
  };
}>();

defineEmits<{ back: []; open: [orderId: string]; retry: [] }>();
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" :balance="balance" @back="$emit('back')" />

    <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <template v-if="state === 'ready'">
        <template v-if="pending.length > 0">
          <div class="px-0.5 pb-0.5 pt-[18px]">
            <AtomsNextMemberGroupLabel :label="texts.pendingGroup" :count="pending.length" />
          </div>
          <MoleculesNextMemberOrderRow
            v-for="order in pending"
            :key="order.id"
            :order="order"
            variant="full"
            @open="$emit('open', order.id)"
          />
        </template>

        <template v-if="past.length > 0">
          <div class="px-0.5 pb-0.5 pt-[18px]">
            <AtomsNextMemberGroupLabel :label="texts.pastGroup" />
          </div>
          <MoleculesNextMemberOrderRow
            v-for="order in past"
            :key="order.id"
            :order="order"
            variant="full"
            @open="$emit('open', order.id)"
          />
        </template>
      </template>

      <MoleculesNextMemberNotice v-else-if="state === 'empty'" state="empty" :message="texts.empty" />

      <MoleculesNextMemberNotice
        v-else-if="state === 'error'"
        state="error"
        :message="texts.error"
        :retry-label="texts.retry"
        @retry="$emit('retry')"
      />
    </div>
  </div>
</template>
