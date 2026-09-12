import { requireEmployee } from '#server/utils/employeeAuth';
import type { EmployeeMeResponse } from '#shared/types/employee';

// Кто пришёл этим запросом: имя, телефон и роль вошедшего.
//
// Нужна и шапке, и разметке страниц. Роль отсюда, а не из cookie: в cookie она подсказка
// для лога, а здесь — то, что прочитано из базы на этом самом запросе, поэтому выключенная
// учётка выпадает немедленно (docs/principles.md → «Доверие к входным данным»).
//
// Отказ разводится там же, где у всех остальных ручек: `401` — представьтесь заново,
// `403` — представились, но доступа нет. Клиент по этой разнице и решает, вести человека
// на форму входа или объяснять, почему вход не поможет.
export default defineEventHandler(async (event): Promise<EmployeeMeResponse> => {
  const employee = await requireEmployee(event);

  return {
    employee: {
      employeeId: employee.employeeId,
      role: employee.role,
      fullName: employee.fullName,
      phoneE164: employee.phoneE164,
    },
  };
});
