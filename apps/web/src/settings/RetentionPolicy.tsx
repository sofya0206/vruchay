import { useEffect, useState } from 'react';
import { Check, Timer } from 'lucide-react';
import { usePublicProfile, useUpdatePublicProfile } from '../api/org';
import { Button } from '../ui/Button';
import { Input, Label } from '../ui/Field';

/**
 * Сроки хранения.
 *
 * Держать персональные данные дольше, чем требует цель, запрещает
 * ч. 7 ст. 5 152-ФЗ. Оператор этих данных — сама организация, поэтому
 * срок корзины задаёт она. Остальные сроки перечислены рядом и не
 * настраиваются: они выведены из закона и одинаковы для всех, а
 * возможность их растянуть означала бы возможность нарушить.
 */
const FIXED = [
  ['Адрес участника в журнале писем', 'обезличивается через год'],
  ['Заявка с формы на сайте: адрес, отпечаток браузера', 'стираются через 90 дней'],
  ['Незавершённая заявка целиком', 'удаляется через 30 дней'],
  ['Согласие на обработку данных', 'хранится три года — столько длится срок исковой давности'],
];

export function RetentionPolicy() {
  const profile = usePublicProfile();
  const update = useUpdatePublicProfile();
  const [days, setDays] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile.data) setDays(String(profile.data.trashDays));
  }, [profile.data]);

  const value = Number(days);
  const valid = Number.isInteger(value) && value >= 1 && value <= 90;
  const changed = profile.data ? value !== profile.data.trashDays : false;

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Timer size={18} className="text-[var(--accent)]" />
        Сроки хранения
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Закон запрещает держать данные дольше, чем требует цель. Оператор этих данных — вы,
        поэтому срок корзины выбираете тоже вы.
      </p>

      <div className="mt-4 max-w-md space-y-3 rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
        <div>
          <Label>Материал лежит в корзине, дней</Label>
          <Input
            value={days}
            onChange={(e) => setDays(e.target.value)}
            inputMode="numeric"
            placeholder="7"
          />
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            От суток до 90 дней. По истечении срока материал и выданные по нему файлы удаляются
            безвозвратно, а ссылки проверки перестают отвечать — это уже не корзина, а удаление.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="primary"
            disabled={!valid || !changed || update.isPending}
            onClick={() => {
              update.mutate(
                { trashDays: value },
                {
                  onSuccess: () => {
                    setSaved(true);
                    setTimeout(() => setSaved(false), 4000);
                  },
                },
              );
            }}
          >
            {update.isPending ? 'Сохраняем…' : 'Сохранить'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-[var(--accent)]">
              <Check size={15} /> Сохранено
            </span>
          )}
        </div>
      </div>

      <dl className="mt-4 max-w-2xl space-y-2 text-sm">
        {FIXED.map(([what, when]) => (
          <div key={what} className="flex flex-wrap justify-between gap-2 border-b border-[var(--line)] pb-2">
            <dt className="text-[var(--text-muted)]">{what}</dt>
            <dd>{when}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 max-w-2xl text-xs text-[var(--text-muted)]">
        Эти сроки выведены из закона и одинаковы для всех — растянуть их значило бы нарушить его.
      </p>
    </section>
  );
}
