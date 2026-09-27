<script setup lang="ts">
import { computed } from 'vue';
import { DASH } from '~/utils/format';
import type { DemoEntities } from '#shared/types/demo';

/**
 * Сводка демо-офисов и демо-сущностей (issue #252) — ссылками на их карточки. Заводятся
 * они в своих разделах галочкой «Демо»; здесь только список, чтобы видеть витрину целиком.
 *
 * Карточки открываются в новой вкладке — пульт демо остаётся под рукой; пустая группа —
 * прочерк: «нет» читалось двояко.
 */
const props = defineProps<{
  demoOffices: { officeId: string; name: string }[];
  entities: DemoEntities;
}>();

/** Черновик без названия — строкой, а не пустой ссылкой. */
const UNTITLED = 'Без названия';

type Group = { title: string; links: { key: string; to: string; label: string }[] };

const groups = computed<Group[]>(() => [
  {
    title: 'Офисы',
    links: props.demoOffices.map((office) => ({
      key: office.officeId,
      to: `/offices/${office.officeId}`,
      label: office.name,
    })),
  },
  {
    title: 'Товары',
    links: props.entities.products.map((product) => ({
      key: product.productId,
      to: `/products/${product.productId}`,
      label: product.name ?? UNTITLED,
    })),
  },
  {
    title: 'Рассылки',
    links: props.entities.mailings.map((mailing) => ({
      key: mailing.mailingId,
      to: `/mailings/${mailing.mailingId}`,
      label: mailing.title ?? UNTITLED,
    })),
  },
  {
    title: 'Сегменты',
    links: props.entities.segments.map((segment) => ({
      key: segment.segmentId,
      to: `/segments/${segment.segmentId}`,
      label: segment.name,
    })),
  },
  {
    title: 'Акции',
    links: props.entities.campaigns.map((campaign) => ({
      key: campaign.campaignId,
      to: `/campaigns/${campaign.campaignId}`,
      label: campaign.title ?? UNTITLED,
    })),
  },
]);
</script>

<template>
  <MoleculesSectionPanel
    title="Демо-офисы и сущности"
    note="Заводятся в своих разделах галочкой «Демо»."
  >
    <dl class="space-y-4">
      <div v-for="group in groups" :key="group.title">
        <dt class="text-sm font-medium text-slate-700">{{ group.title }}</dt>
        <dd class="mt-1 text-sm">
          <span v-if="group.links.length === 0" class="text-slate-500">{{ DASH }}</span>
          <ul v-else class="flex flex-wrap gap-x-4 gap-y-1">
            <li v-for="link in group.links" :key="link.key">
              <NuxtLink
                :to="link.to"
                target="_blank"
                class="text-slate-900 underline underline-offset-2 hover:text-slate-700"
              >
                {{ link.label }}
              </NuxtLink>
            </li>
          </ul>
        </dd>
      </div>
    </dl>
  </MoleculesSectionPanel>
</template>
