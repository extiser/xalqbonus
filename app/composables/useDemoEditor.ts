import { computed, type ComputedRef } from 'vue';
import { useCurrentEmployee } from '~/composables/useCurrentEmployee';
import { canEditDemo, DEMO_EDITOR_ROLES } from '#shared/access';

/**
 * Кто на экране правит демо (issue #212): поле «Демо» в формах заведения видит только владелец,
 * и кнопки правки демо-сущности у остальных не показываются.
 *
 * Правило одно с сервером — `shared/access.ts`; решает всё равно ручка (`requireDemoEditor`),
 * здесь — чтобы человек не нажимал то, что ему откажут.
 */
export const useDemoEditor = (): {
  /** Вошедший вправе заводить и править демо. */
  ownsDemo: ComputedRef<boolean>;
  /** Вправе ли вошедший править сущность с этим признаком. */
  canEdit: (isDemo: boolean) => boolean;
} => {
  const employee = useCurrentEmployee();

  return {
    ownsDemo: computed(
      () => employee.value !== null && DEMO_EDITOR_ROLES.includes(employee.value.role),
    ),
    canEdit: (isDemo) => employee.value !== null && canEditDemo(employee.value.role, isDemo),
  };
};
