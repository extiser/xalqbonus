<script setup lang="ts">
import { computed } from 'vue';
import { PhDownloadSimple } from '@phosphor-icons/vue';

/**
 * Плитка «Ссылка и QR» карточки метки (issue #380) — `03-card.html`, 4 × 3.
 *
 * Ссылка только для чтения со значком «скопировать»: длинная обрезается слева, код метки
 * виден всегда. QR — голый код на белой подложке 164, на ширине 901–1100 — 140 и ближе
 * к ссылке: там «PNG» и «SVG» не помещаются в ряд и встают в два, и без этого плитка
 * переполнялась на пиксель. Картинка — той же ручки, что скачивается SVG. Кнопки «PNG» и «SVG» — последняя строка плитки, прижата
 * к низу: нижние строки соседних плиток ряда стоят на одной линии (`codex.md`). Зачем какой
 * формат — подсказкой при наведении: в две строки подпись выталкивала содержимое за край.
 */
const props = defineProps<{
  code: string;
  link: string;
}>();

const qrPath = computed(() => `/api/promo/${encodeURIComponent(props.code)}/qr`);
</script>

<template>
  <MoleculesWebTile :cols="4" :rows="3" title="Ссылка и QR">
    <div class="mt-4">
      <MoleculesWebLinkField size="tile" :link="link" :code="code" />
    </div>
    <div class="mx-auto mt-3.5 size-[164px] shrink-0 rounded-[18px] bg-white p-3.5 web:max-[1100px]:mt-2.5 web:max-[1100px]:size-[140px]">
      <img :src="`${qrPath}.svg`" :alt="`QR-код ссылки ${link}`" class="block size-full" />
    </div>
    <div class="mt-auto flex flex-wrap justify-center gap-2 pt-3">
      <AtomsWebActionButton
        label="PNG"
        size="page"
        :icon="PhDownloadSimple"
        :download="`${qrPath}.png`"
        title="Скачать PNG — для сообщений и просмотра"
      />
      <AtomsWebActionButton
        label="SVG"
        size="page"
        :icon="PhDownloadSimple"
        :download="`${qrPath}.svg`"
        title="Скачать SVG — для печати любого размера"
      />
    </div>
  </MoleculesWebTile>
</template>
