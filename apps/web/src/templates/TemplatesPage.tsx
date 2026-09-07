import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User } from 'lucide-react';
import type { StarterPreset } from '@gramota/shared';
import { api } from '../api/client';
import type { DocumentDetail } from '../api/types';
import { LibraryLayout } from '../documents/LibraryNav';
import { PageSizePicker, type PageSizeValue } from '../documents/PageSizePicker';
import { PresetGallery } from '../documents/PresetGallery';

/**
 * Раздел «Шаблоны» — готовые бланки, с которых начинают материал.
 *
 * Витрина стояла под списком рабочих материалов и отодвигала вниз то,
 * ради чего в раздел заходят каждый день. Здесь у неё своя вкладка,
 * и список бланков ничего не загораживает.
 *
 * «Мои шаблоны» пока пусты намеренно: своих сохранённых бланков в сервисе
 * ещё нет, а подложить туда те же готовые — значит показать одно и то же
 * дважды под разными названиями.
 */
export function TemplatesPage({ mine = false }: { mine?: boolean }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  // A4 альбомная — то, на чём печатают грамоты чаще всего.
  const [size, setSize] = useState<PageSizeValue>({ widthMm: 297, heightMm: 210 });

  const create = useMutation({
    mutationFn: (preset: StarterPreset) =>
      api.post<DocumentDetail>('/documents', {
        title: preset.documentTitle,
        presetId: preset.id,
        pageWidthMm: size.widthMm,
        pageHeightMm: size.heightMm,
      }),
    /*
     * Материал из заготовки открываем сразу.
     *
     * Раньше нажатие на заготовку молча добавляло материал в список
     * на другой странице: ничего видимого не происходило, и человек нажимал
     * ещё раз — отсюда три «Грамоты за место» подряд. Заготовку выбирают,
     * чтобы её править, поэтому переход в редактор и есть ответ на нажатие.
     */
    onSuccess: (doc) => {
      void qc.invalidateQueries({ queryKey: ['documents'] });
      navigate(`/documents/${doc.id}`);
    },
  });

  if (mine) {
    return (
      <LibraryLayout head={<h1 className="text-lg font-medium">Мои шаблоны</h1>}>
        <p className="text-sm text-[var(--text-muted)]">
          Свои бланки: загруженные и сохранённые из каталога
        </p>

        <div className="mt-6 rounded-xl border border-dashed border-[var(--line-strong)] px-6 py-16 text-center">
          <User size={28} className="mx-auto mb-3 text-[var(--text-muted)]" strokeWidth={1.5} />
          <p className="font-medium">Своих шаблонов пока нет</p>
        </div>
      </LibraryLayout>
    );
  }

  return (
    <LibraryLayout head={<h1 className="text-lg font-medium">Шаблоны</h1>}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          Готовые бланки: текст уже расставлен по листу — останется поправить слова
        </p>
        {/* Формат выбирается до создания, а не после: поменять его
            у материала, на котором уже расставлен текст, значит сдвинуть
            весь макет. */}
        <PageSizePicker value={size} onChange={setSize} />
      </div>

      <PresetGallery
        category={null}
        size={size}
        busyId={create.isPending ? (create.variables?.id ?? null) : null}
        onPick={(preset) => create.mutate(preset)}
      />
    </LibraryLayout>
  );
}
