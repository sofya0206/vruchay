import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, Check, Download, ExternalLink, Share2, ShieldX } from 'lucide-react';
import { Meta } from '../seo/Meta';
import { Brand } from '../shell/Brand';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface RecipientInfo {
  title: string;
  holder: string;
  issuer: string;
  issuedAt: string;
  code: string;
  verifyPath: string;
  revoked: boolean;
}

type Outcome =
  | { kind: 'pending' }
  | { kind: 'found'; data: RecipientInfo }
  | { kind: 'expired' }
  | { kind: 'missing' }
  | { kind: 'error' };

/**
 * Встроенные браузеры мессенджеров: PDF в них не сохраняется — Telegram
 * и VK открывают ссылку в своём WebView без загрузок. Подсказываем открыть
 * в настоящем браузере, а ссылку даём скопировать.
 */
function inAppBrowser(): boolean {
  return /Telegram|VKClient|VKAndroidApp|VKiOS|FBAN|FBAV|Instagram/i.test(navigator.userAgent);
}

/**
 * Страница получателя: «ваш документ» по ссылке из письма, без входа.
 *
 * Открывают с телефона, из письма или пересланного сообщения. Первым —
 * что за документ и кому, затем одна главная кнопка. «Открыть», а не
 * «Скачать»: на iPhone PDF по ссылке открывается в просмотрщике, а
 * сохраняют его уже оттуда — скачивания по ссылке в Safari нет.
 */
export function RecipientPage() {
  const { token = '' } = useParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'pending' });
  const [copied, setCopied] = useState(false);
  const inApp = inAppBrowser();

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch(`/api/v1/recipient/${encodeURIComponent(token)}`, { credentials: 'omit' });
        if (!alive) return;
        if (res.ok) setOutcome({ kind: 'found', data: (await res.json()) as RecipientInfo });
        else if (res.status === 410) setOutcome({ kind: 'expired' });
        else if (res.status === 404 || res.status === 400) setOutcome({ kind: 'missing' });
        else setOutcome({ kind: 'error' });
      } catch {
        if (alive) setOutcome({ kind: 'error' });
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const data = outcome.kind === 'found' ? outcome.data : null;
  const pdfHref = `/api/v1/recipient/${encodeURIComponent(token)}/pdf`;

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data?.title ?? 'Документ', url });
        return;
      }
    } catch {
      return;
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <>
      <Meta title={data ? `${data.title} — Вручай` : 'Ваш документ — Вручай'} description="Документ, выданный через Вручай." path="/d" noindex />
      <div className="flex min-h-full flex-col bg-sunken">
        <div className="flex h-13 items-center gap-2 px-4">
          <Brand size={28} />
          <span className="font-semibold">Вручай</span>
        </div>

        {inApp && (
          <div className="flex items-center gap-3 bg-accent-soft px-4 py-2.5 text-sm leading-tight">
            <ExternalLink size={18} className="shrink-0 text-accent" aria-hidden />
            <span className="flex-1">Открыто внутри мессенджера. Чтобы сохранить PDF, откройте ссылку в браузере.</span>
            <Button size="sm" variant="secondary" onClick={() => void share()}>
              {copied ? 'Скопировано' : 'Ссылка'}
            </Button>
          </div>
        )}

        <main className="mx-auto w-full max-w-md px-4 py-3">
          {outcome.kind === 'pending' && <p className="py-10 text-center text-muted">Открываем…</p>}
          {outcome.kind === 'expired' && (
            <Card>
              <h1 className="text-xl font-semibold">Ссылка устарела</h1>
              <p className="mt-2 text-muted">Она действовала месяц. Сам документ по-прежнему во вложении того же письма.</p>
            </Card>
          )}
          {outcome.kind === 'missing' && (
            <Card>
              <h1 className="text-xl font-semibold">Документ не найден</h1>
              <p className="mt-2 text-muted">Ссылка неполная или документ удалён выдавшей организацией.</p>
            </Card>
          )}
          {outcome.kind === 'error' && (
            <Card>
              <h1 className="text-xl font-semibold">Не удалось открыть</h1>
              <p className="mt-2 text-muted">Что-то пошло не так на нашей стороне. Попробуйте через минуту.</p>
            </Card>
          )}
          {data && (
            <Card>
              {data.revoked && (
                <Badge tone="danger" className="mb-3 flex w-fit items-center gap-1.5 py-2">
                  <ShieldX size={16} aria-hidden /> Документ отозван выдавшей организацией
                </Badge>
              )}
              <h1 className="text-xl leading-tight font-semibold">{data.title}</h1>
              {data.holder && <p className="mt-1 text-base">{data.holder}</p>}
              <p className="mt-1 text-sm text-muted">
                {data.issuer}
                {data.issuer ? ' · ' : ''}
                {formatDate(data.issuedAt)}
              </p>

              <div className="mt-5 flex flex-col gap-2">
                {!data.revoked && (
                  <Button variant="primary" size="lg" to={pdfHref} icon={<Download size={18} />} className="h-13">
                    Открыть PDF
                  </Button>
                )}
                <Button size="lg" className="h-12" icon={copied ? <Check size={18} /> : <Share2 size={18} />} onClick={() => void share()}>
                  {copied ? 'Ссылка скопирована' : 'Поделиться'}
                </Button>
              </div>
              {!data.revoked && (
                <p className="mt-3 text-center text-sm leading-snug text-muted">
                  Сохранить на iPhone: в открытом PDF нажмите <Share2 size={13} className="inline align-[-2px]" aria-label="Поделиться" /> и «Сохранить
                  в Файлы»
                </p>
              )}
              <Link to={data.verifyPath} className="mt-2 flex h-11 items-center justify-center gap-2 text-sm text-accent">
                <BadgeCheck size={16} aria-hidden />
                Проверить подлинность · <span className="font-mono text-sm">{data.code}</span>
              </Link>
            </Card>
          )}
          <p className="py-4 text-center text-sm text-muted">
            Документ выдан сервисом{' '}
            <Link to="/" className="text-accent">
              Вручай
            </Link>
          </p>
        </main>
      </div>
    </>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
