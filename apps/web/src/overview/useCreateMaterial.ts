import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';

/** A4 альбомная — то, на чём печатают грамоты чаще всего. */
const A4_LANDSCAPE = { pageWidthMm: 297, pageHeightMm: 210 };

/**
 * Завести материал и сразу открыть его в редакторе макета.
 *
 * «Создать документ» на главной и «Редактор» в шапке ведут в одно место —
 * к листу. Раньше отсюда открывался список получателей, и плитка делала
 * ровно то же, что соседняя «Документы и шаблоны»: обе показывали списки,
 * а собрать сам документ было негде.
 *
 * Размер листа берём обычный: поменять его до расстановки полей ничего
 * не стоит, а выбор размера на входе — лишняя развилка.
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
      navigate(`/documents/${doc.id}`);
    },
  });
}
