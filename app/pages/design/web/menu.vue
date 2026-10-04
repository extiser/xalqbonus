<script setup lang="ts">
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';

/**
 * Меню веба на раскладке `web` — для сверки глазами с меню кодекса `_reference/design/web/codex.html`
 * и экрана `dashboard/01-money.html` на ноутбуке и на ширине 390. Плитки рядом — чтобы видеть
 * меню возле них и запас под панелью на телефоне.
 *
 * Только для разработки, как всё под `/design`: в сборке страницы нет, адрес отвечает 404.
 *
 * Вошедший — заглушка владельца: на `/design` общая проверка входа не идёт, и без заглушки
 * меню было бы пустым. Кладёт её посредник страницы, а не её `setup`: раскладка рисуется раньше
 * страницы, и на сервере меню успело бы отрисоваться пустым.
 */
if (!import.meta.dev) throw createError({ statusCode: 404 });

definePageMeta({
  layout: 'web',
  middleware: [
    () => {
      useCurrentEmployee().value = {
        employeeId: 'design-owner',
        role: 'owner',
        fullName: 'Равшан',
        phoneE164: '+998901234567',
      };
    },
  ],
});

useHead({ title: 'Меню веба' });
</script>

<template>
  <div class="flex flex-col gap-5">
    <div class="flex flex-col gap-1 px-1 pt-1.5">
      <AtomsWebPageTitle label="Меню веба" />
      <AtomsWebHint text="Пункты — владельца, все двенадцать. Цифры в плитках условные, с экрана дашборда." />
    </div>

    <MoleculesWebBento>
      <MoleculesWebTile :cols="8" :rows="3" title="Доход за вычетом программы">
        <template #aside>
          <AtomsWebBadge label="цифры условные" />
        </template>
        <div class="mt-[18px]">
          <AtomsWebFigure value="134,6" unit="млн сум" size="hero" />
        </div>
        <div class="mt-3 flex flex-wrap gap-x-7 gap-y-1.5">
          <AtomsWebDelta value="+8,3 млн" base="к сентябрю" tone="up" trend />
          <AtomsWebDelta value="+21,4 млн" base="к октябрю 2025" tone="up" />
        </div>
      </MoleculesWebTile>

      <MoleculesWebTile :cols="4" :rows="3" title="Почему изменилось">
        <div class="mt-[18px] flex flex-col gap-3">
          <MoleculesWebBreakdownRow label="Поездок больше" hint="83 120 против 79 400" value="+6,2 млн" tone="up" />
          <MoleculesWebBreakdownRow label="Доход с поездки" hint="1 689 против 1 659 сум" value="+2,5 млн" tone="up" />
          <MoleculesWebBreakdownRow
            label="Программа дороже"
            hint="выдано баллов на 5,8 млн"
            value="−0,4 млн"
            tone="down"
            marker="program"
          />
          <MoleculesWebBreakdownRow label="К сентябрю" value="+8,3 млн" tone="up" variant="total" />
        </div>
      </MoleculesWebTile>

      <MoleculesWebTile :cols="3" :rows="1" title="Доход парка">
        <div class="mt-3"><AtomsWebFigure value="140,4" unit="млн" size="tile" /></div>
      </MoleculesWebTile>
      <MoleculesWebTile :cols="3" :rows="1" title="Цена программы" marker="program">
        <div class="mt-3"><AtomsWebFigure value="5,8" unit="млн" size="tile" /></div>
      </MoleculesWebTile>
      <MoleculesWebTile :cols="3" :rows="1" title="Поездок">
        <div class="mt-3"><AtomsWebFigure value="83 120" size="tile" /></div>
      </MoleculesWebTile>
      <MoleculesWebTile :cols="3" :rows="1" title="Доход с поездки">
        <div class="mt-3"><AtomsWebFigure value="1 689" unit="сум" size="tile" /></div>
      </MoleculesWebTile>
    </MoleculesWebBento>
  </div>
</template>
