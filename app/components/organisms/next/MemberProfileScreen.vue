<script setup lang="ts">
import type { MemberLanguage, MemberLanguageOptionView, MemberProfileFieldView } from '~/types/memberView';

/**
 * Раздел «Профиль» — `product/design/app/profile-screen.html` и шторка `artboard/language-sheet.html`.
 *
 * Кто залогинен и настройки. Водители работают «друг за друга», и при разборе проблем
 * с баллами менеджер в офисе должен понять, чья учётка перед ним, одним экраном.
 *
 * Номер ВУ — последними четырьмя знаками, глазик раскрывает его целиком. Сброс сессии —
 * отдельной кнопкой под настройками и только через шторку подтверждения: это не настройка,
 * и по ней не должны попадать, листая настройки.
 *
 * Что открыто — глазик, шторка сброса, шторка языка — решает родитель: экран принимает
 * состояние свойствами и отдаёт нажатия событиями.
 */
defineProps<{
  lastName: string;
  givenNames: string;
  fields: MemberProfileFieldView[];
  license: {
    label: string;
    /** Номер целиком. */
    full: string;
    /** Последние знаки — видны всегда. */
    tail: string;
  };
  licenseRevealed: boolean;
  language: MemberLanguage;
  languageOptions: MemberLanguageOptionView[];
  /** Открытая шторка: сброса, языка или никакой. */
  sheet: 'none' | 'reset' | 'language';
  texts: {
    title: string;
    back: string;
    settings: string;
    language: string;
    reset: string;
    licenseShow: string;
    licenseHide: string;
    resetTitle: string;
    resetSubtitle: readonly string[];
    resetConfirm: string;
    resetCancel: string;
    languageSubtitle: string;
    save: string;
    close: string;
  };
}>();

defineEmits<{
  back: [];
  toggleLicense: [];
  openLanguage: [];
  askReset: [];
  reset: [];
  save: [language: MemberLanguage];
  close: [];
}>();

/** Маска скрытой части номера — пять точек, сколько бы знаков ни пряталось. */
const LICENSE_MASK = '•••••';
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-xb-screen pb-[calc(40px+env(safe-area-inset-bottom))] font-manrope leading-[normal] text-xb-text">
    <MoleculesNextMemberSectionBar :title="texts.title" :back-label="texts.back" @back="$emit('back')" />

    <div class="flex flex-col gap-2.5 px-4 pb-5 pt-2">
      <AtomsNextMemberListCard>
        <MoleculesNextMemberPersonHead :last-name="lastName" :given-names="givenNames" />
        <MoleculesNextMemberFieldRow
          v-for="field in fields"
          :key="field.id"
          :label="field.label"
          :value="field.value"
          :missing="field.missing"
        />
        <MoleculesNextMemberFieldRow
          :label="license.label"
          :value="licenseRevealed ? license.full : license.tail"
          :mask="licenseRevealed ? undefined : LICENSE_MASK"
        >
          <template #aside>
            <span class="-mr-1.5 flex">
              <AtomsNextMemberIconButton
                :label="licenseRevealed ? texts.licenseHide : texts.licenseShow"
                size="s"
                @click="$emit('toggleLicense')"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" aria-hidden="true">
                  <path
                    d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
                    stroke="#C2C9D3"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                  />
                  <circle cx="12" cy="12" r="2.8" stroke="#C2C9D3" stroke-width="1.7" />
                  <path v-if="licenseRevealed" d="M4 20L20 4" stroke="#C2C9D3" stroke-width="1.7" stroke-linecap="round" />
                </svg>
              </AtomsNextMemberIconButton>
            </span>
          </template>
        </MoleculesNextMemberFieldRow>
      </AtomsNextMemberListCard>

      <div class="px-0.5 pb-0.5 pt-[18px]">
        <AtomsNextMemberGroupLabel :label="texts.settings" />
      </div>
      <AtomsNextMemberListCard>
        <MoleculesNextMemberSettingRow
          :label="texts.language"
          :value="languageOptions.find((option) => option.language === language)?.label ?? ''"
          @open="$emit('openLanguage')"
        />
      </AtomsNextMemberListCard>

      <div class="mt-[22px]">
        <AtomsNextMemberButton size="l" tone="danger" @click="$emit('askReset')">{{ texts.reset }}</AtomsNextMemberButton>
      </div>
    </div>

    <MoleculesNextMemberSheet
      :open="sheet === 'reset'"
      :title="texts.resetTitle"
      :subtitle="texts.resetSubtitle"
      @close="$emit('close')"
    >
      <template #buttons>
        <AtomsNextMemberButton size="l" tone="scarlet" @click="$emit('reset')">{{ texts.resetConfirm }}</AtomsNextMemberButton>
        <AtomsNextMemberButton size="l" tone="grey" @click="$emit('close')">{{ texts.resetCancel }}</AtomsNextMemberButton>
      </template>
    </MoleculesNextMemberSheet>

    <OrganismsNextMemberLanguageSheet
      :open="sheet === 'language'"
      :current="language"
      :options="languageOptions"
      :texts="{ title: texts.language, subtitle: texts.languageSubtitle, save: texts.save, close: texts.close }"
      @save="(picked) => $emit('save', picked)"
      @close="$emit('close')"
    />
  </div>
</template>
