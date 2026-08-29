import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { workspacePath } from '../mailing/workspace-tabs';
import type { DocumentDetail } from '../api/types';

/** A4 альбомная — то, на чём печатают грамоты чаще всего. */
const A4_LANDSCAPE = { pageWidthMm: 297, pageHeightMm: 210 };

/**
 * Завести материал и сразу открыть в нём список получателей.
 *
 * Быстрое действие обязано приводить туда, где работа продолжается,
 * а не в пустой редактор макета: человек нажал «загрузить протокол» —
 * значит, следующее, что он хочет видеть, это окно загрузки файла.
 * Список живёт на «Рассылке», в рабочем месте материала, — туда и ведём.
 * Размер листа берём обычный: поменять его до расстановки полей
 * ничего не стоит, а выбор размера на входе — лишняя развилка.
 */
export function useCreateMaterial() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: (title: string) =>
      api.post<DocumentDetail>('/documents', { title: title.trim(), ...A4_LANDSCAPE }),
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
      navigate(workspacePath(doc.id));
    },
  });
}
