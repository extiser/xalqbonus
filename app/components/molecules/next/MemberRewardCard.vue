<script setup lang="ts">
import { computed } from 'vue';
import type { MemberRewardView } from '~/types/memberView';

/**
 * Награда на главной — `_reference/design/home/rewards-block.html`. В разделе «Мои награды»
 * награду рисует `MemberItemCard`.
 *
 * `compact` — ждущие, две строки: что и где ждать. Кода нет — он виден любому, кто заглянул
 * через плечо; вместо него обещание «код внутри» и шеврон, и карточка обязана открываться.
 * Цвет золотой, а не зелёный: на главной зелёный был бы третьим акцентом после граната баланса
 * и золота акции, а золото там уже значит подарок.
 *
 * `full` — ждущих нет, но награды были: одна последняя целиком — что, откуда, состояние и офис
 * (сцена 3 блока). Полученная — спокойная строка. Сгоревшая гаснет целиком, но остаётся читаемой:
 * пустота вместо неё выглядела бы так, будто награды и не было.
 */
type RewardCardVariant = 'full' | 'compact';

const props = defineProps<{
  reward: MemberRewardView;
  variant: RewardCardVariant;
}>();

defineEmits<{ open: [] }>();

const isAwaiting = computed(() => props.reward.status === 'awaiting');
</script>

<template>
  <AtomsNextMemberCard v-if="variant === 'compact'" tone="gold" clickable @click="$emit('open')">
    <span class="flex items-center gap-3 px-3.5 py-[13px]">
      <span class="flex min-w-0 grow flex-col gap-0.5">
        <span class="text-[16px] font-bold leading-[1.25]">{{ reward.title }}</span>
        <AtomsNextMemberStateLine tone="gold" :state="reward.state" :hint="reward.hint" />
      </span>
      <AtomsNextMemberChevron tone="gold" />
    </span>
  </AtomsNextMemberCard>

  <AtomsNextMemberCard v-else :tone="isAwaiting ? 'green' : 'plain'" :dimmed="reward.status === 'expired'">
    <article class="flex flex-col gap-[3px] px-4 py-3.5">
      <span class="text-[16px] leading-[1.25]" :class="reward.status === 'issued' ? 'font-semibold' : 'font-bold'">
        {{ reward.title }}
      </span>
      <span v-if="reward.origin" class="text-[13px] font-light text-xb-grey">{{ reward.origin }}</span>
      <span class="mt-1">
        <AtomsNextMemberStateLine :tone="isAwaiting ? 'green' : 'quiet'" :state="reward.state" />
      </span>
      <span v-if="reward.office" class="text-[13px] font-light text-xb-grey">{{ reward.office }}</span>
    </article>
  </AtomsNextMemberCard>
</template>
