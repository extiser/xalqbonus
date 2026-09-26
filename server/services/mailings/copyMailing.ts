import { consola } from 'consola';
import { copyMailingPhoto } from '#server/adapters/uploads/mailingPhotos';
import {
  findMailing,
  insertDraftMailing,
  updateDraftMailingPhotoPath,
} from '#server/repositories/mailings';
import {
  MailingStatusMismatchError,
  UnknownMailingError,
} from '#server/services/mailings/errors';
import { readMailing } from '#server/services/mailings/readMailing';
import { formatCalendarDate, formatClockTime } from '#server/utils/parkTime';
import type { Mailing } from '#shared/types/mailing';

/**
 * Копия рассылки в новый черновик: заголовок с пометкой копии, тексты и фото. Копируется всё, кроме идущей
 * (решение Руслана 15-09-2026): завершённую — чтобы повторить то же объявление через неделю,
 * черновик — чтобы сделать из него второй похожий, остановленную — чтобы разослать заново.
 *
 * Снимок не копируется. Новая рассылка снимет свой при запуске, и те, кто получил сообщение
 * от остановленной, получат его снова — копия означает «разослать заново», а не «дослать».
 * Дослать только оставшимся нельзя по построению: снимок оригинала относится к моменту его
 * запуска, а парк с тех пор поменялся.
 *
 * Фото копируется файлом, а не ссылкой: замена картинки в копии иначе переписала бы файл
 * оригинала.
 *
 * Признак демо копия берёт у оригинала (issue #212): копия демо-рассылки — демо, живой — живая.
 * Иначе копия стала бы способом превратить одно в другое.
 */
const log = consola.withTag('mailings:copy');

/** Пометка копии в конце заголовка — та, что ставит `copyMailingTitle`. */
const COPY_MARK = /\s*— копия \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/;

/**
 * Заголовок копии: «Тестовая 3 — копия 15.09.2026, 21:30». Без пометки в списке стояли бы две
 * одинаковые строки, и новую выдавала бы только колонка даты.
 *
 * Время — в зоне парка, теми же помощниками, что остальные даты (server/utils/parkTime.ts).
 * Пометка, уже стоящая в конце, заменяется: копия копии иначе копила бы их одну за другой.
 *
 * Черновик без заголовка остаётся без него: одна пометка вместо названия читалась бы
 * как поломка, а не как копия.
 */
export const copyMailingTitle = (title: string | null, moment: Date): string | null => {
  if (title === null) {
    return null;
  }

  const base = title.replace(COPY_MARK, '');

  return `${base} — копия ${formatCalendarDate(moment)}, ${formatClockTime(moment)}`;
};

export const copyMailing = async (mailingId: string, createdById: string): Promise<Mailing> => {
  const source = await findMailing(mailingId);

  if (!source) {
    throw new UnknownMailingError(mailingId);
  }

  // Идущую не копируют: её снимок и тексты ещё в работе. Ожидание `stopped` — не «только
  // остановленную», а шаг, который делает копию возможной.
  if (source.status === 'running') {
    throw new MailingStatusMismatchError(mailingId, source.status, 'stopped');
  }

  const copyId = await insertDraftMailing({
    title: copyMailingTitle(source.title, new Date()),
    textRu: source.textRu,
    textUz: source.textUz,
    photoPath: null,
    createdById,
    isDemo: source.isDemo,
  });

  // Сначала черновик, потом файл под его идентификатор: имя файла собирается из uuid
  // рассылки, а uuid рождается вставкой.
  if (source.photoPath !== null) {
    await updateDraftMailingPhotoPath(copyId, await copyMailingPhoto(source.photoPath, copyId));
  }

  log.info('рассылка скопирована в черновик', { mailingId, copyId, createdById });

  return readMailing(copyId);
};
