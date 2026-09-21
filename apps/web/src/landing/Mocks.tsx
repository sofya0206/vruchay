import type { CSSProperties, ReactNode } from 'react';
import {
  Archive,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Image,
  Mail,
  QrCode,
  Search,
  ShieldCheck,
  Trophy,
  Type,
  WandSparkles,
  XCircle,
} from 'lucide-react';

/**
 * Экраны продукта для посадочной.
 *
 * Продукт — главная картинка страницы: вместо абстрактных иллюстраций
 * показываем то, что человек увидит в кабинете. Это разметка, а не снимки
 * экрана: она не устаревает при следующей правке интерфейса и не весит
 * мегабайт на первом экране.
 *
 * Одна история на все экраны: везде, где нужен пример человека, — Иванов
 * Иван. Остальные строки списков нарочно скрыты плашками, а не выдуманы:
 * так видно, что список большой, и не появляется случайный второй герой,
 * который никуда дальше не ведёт.
 */

const PERSON = 'Иванов Иван';
const PERSON_DATIVE = 'Иванову Ивану';
const ORG = 'Центр «Развитие»';
const EVENT = 'Конкурс «Мастер года»';
const CODE = 'K7M2-9QXR-4TVB';

function Frame({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="vru-frame">
      <div className="vru-frame__bar">
        <span className="vru-frame__dot" />
        <span className="vru-frame__dot" />
        <span className="vru-frame__dot" />
        <span className="vru-frame__url">{url}</span>
      </div>
      {children}
    </div>
  );
}

/** Скрытая строка списка: плашки вместо выдуманного имени — список большой, а герой один. */
function RedactedRow({ widths = [96, 130, 40] }: { widths?: number[] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 14px', opacity: 0.55 }}>
      {widths.map((w, i) => (
        <span
          key={i}
          style={{ width: w, height: 8, borderRadius: 4, background: 'var(--line-strong)' }}
        />
      ))}
    </div>
  );
}

interface SheetProps {
  scale?: number;
  kind?: string;
  label?: string;
  name?: string;
  main?: string;
  event?: string;
  foot?: string;
  signer?: string;
  org?: string;
  highlightName?: boolean;
}

/**
 * Наградной лист витрины.
 *
 * Размеры внутри листа считаются от `u`, а не задаются в пикселях: лист
 * показывают в нескольких разных масштабах, и только пропорциональная
 * вёрстка переживает это без разъезжающейся типографики.
 */
export function MiniSheet({
  scale = 1,
  kind = 'Диплом',
  label = 'победителя',
  name = PERSON,
  main = 'за первое место в номинации «Лучший проект»',
  event = EVENT,
  foot = '17–19 июня 2026 · Челябинск',
  signer = 'Директор центра',
  org = ORG,
  highlightName = false,
}: SheetProps) {
  const u = 10 * scale;
  const glow =
    'radial-gradient(60% 70% at 0% 0%, rgba(15,119,255,.28), transparent 70%),' +
    'radial-gradient(55% 65% at 100% 100%, rgba(197,180,255,.6), transparent 70%),' +
    'radial-gradient(45% 50% at 100% 0%, rgba(176,131,65,.16), transparent 70%)';

  return (
    <div
      style={
        {
          position: 'relative',
          width: '100%',
          aspectRatio: '297/210',
          background: 'var(--sheet-paper)',
          boxShadow: 'inset 0 0 0 1px var(--sheet-line)',
          overflow: 'hidden',
          fontFamily: 'var(--font-sans)',
          color: 'var(--sheet-ink)',
          '--text': 'var(--sheet-ink)',
          '--text-muted': 'var(--sheet-ink-muted)',
          '--accent-line': 'var(--sheet-accent)',
        } as CSSProperties
      }
    >
      <div style={{ position: 'absolute', inset: 0, background: glow }} />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', right: '-6%', top: '-10%', width: '42%', height: '60%', opacity: 0.35 }}
        fill="none"
        stroke="var(--sheet-accent)"
        strokeWidth=".4"
        aria-hidden
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path key={i} d={`M ${100 - i * 7} 0 C ${80 - i * 6} ${30 + i * 4}, ${60 + i * 3} ${60 - i * 3}, 100 ${90 - i * 8}`} />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: '5%',
          border: '1px solid rgba(9,17,53,.12)',
          background: 'rgba(255,255,255,.55)',
        }}
      />
      <div style={{ position: 'absolute', inset: '5%', display: 'flex', flexDirection: 'column', padding: '7% 8%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: u * 0.3,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          <span>{org}</span>
          <span>№ {CODE.slice(0, 9)}</span>
        </div>
        <div style={{ marginTop: 'auto', marginBottom: 'auto', textAlign: 'center' }}>
          <div style={{ fontSize: u * 1.35, fontWeight: 700, letterSpacing: '.02em', lineHeight: 1.1 }}>{kind}</div>
          {label && (
            <div
              style={{
                marginTop: u * 0.15,
                fontSize: u * 0.38,
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {label}
            </div>
          )}
          <div style={{ margin: `${u * 0.35}px auto 0`, width: u * 3, height: 2, background: 'var(--accent-line)' }} />
          <div
            style={{
              marginTop: u * 0.6,
              fontSize: u * 0.3,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            награждается
          </div>
          <div
            style={{
              position: 'relative',
              display: 'inline-block',
              marginTop: u * 0.25,
              padding: `${u * 0.18}px ${u * 0.9}px`,
              borderRadius: 9999,
              background: 'rgba(255,255,255,.8)',
              boxShadow: highlightName ? '0 0 0 1px var(--accent-line)' : 'inset 0 0 0 1px rgba(9,17,53,.12)',
              fontSize: u * 0.82,
              fontWeight: 600,
              letterSpacing: '.01em',
            }}
          >
            {name}
            {highlightName && (
              <span
                style={{ position: 'absolute', right: -5, bottom: -5, width: 7, height: 7, background: 'var(--accent-line)' }}
              />
            )}
          </div>
          {main && (
            <div
              style={{
                margin: `${u * 0.35}px auto 0`,
                maxWidth: '70%',
                fontSize: u * 0.36,
                lineHeight: 1.45,
                color: 'var(--text-muted)',
              }}
            >
              {main}
              {event ? `. ${event}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: u * 0.3 }}>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Дата</div>
            <div style={{ fontWeight: 500 }}>{foot}</div>
          </div>
          <div style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{signer}</div>
        </div>
      </div>
    </div>
  );
}

/** Шаг 1 — Лист: редактор макета, автомасштаб текста, служебные поля. */
export function EditorMock() {
  return (
    <Frame url="vruchay.ru / документ / лист">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--line)',
          padding: '10px 16px',
          fontSize: 14,
          color: 'var(--text-muted)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Type size={14} /> Текст
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Image size={14} /> Фон
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <QrCode size={14} /> Проверка по QR
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
          <WandSparkles size={14} /> Автомасштаб текста
        </span>
      </div>
      <div style={{ padding: 20, background: 'var(--surface-sunken)' }}>
        <div
          style={{
            maxWidth: 360,
            margin: '0 auto',
            background: 'var(--surface)',
            padding: 10,
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--ring-line)',
          }}
        >
          <MiniSheet scale={1.5} highlightName />
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['%name_dat', '%place_word', '%event', '%event_date', '%valid_until'].map((v) => (
            <span
              key={v}
              style={{
                borderRadius: 'var(--radius-pill)',
                background: 'var(--accent-soft)',
                boxShadow: 'inset 0 0 0 1px var(--accent-line)',
                padding: '4px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--accent)',
              }}
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** Шаг 2 — Получатели: список стал таблицей, колонки сами стали полями. */
export function RecipientsMock() {
  const cols = ['ФИО', 'Почта', 'Место', 'Номинация'];
  const vars = ['%name', '%email', '%place', '%event'];
  return (
    <Frame url="vruchay.ru / документ / получатели">
      {/* Таблица не сжимается уже своих ячеек: на узком экране скроллится
          сама, а не раздвигает всю страницу за край окна. */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 480, borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={c}
                  style={{
                    textAlign: 'left',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line)',
                    background: 'var(--surface-sunken)',
                    fontWeight: 500,
                  }}
                >
                  {c}
                  <span style={{ marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent)' }}>
                    {vars[i]}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: 'var(--accent-soft)' }}>
              {[PERSON, 'ivan.iv@yandex.ru', '1', 'Лучший проект'].map((cell, i) => (
                <td
                  key={cell}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line)',
                    fontWeight: i === 0 ? 600 : 400,
                    color: i === 0 ? 'var(--text)' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <RedactedRow widths={[110, 140, 20, 90]} />
      <RedactedRow widths={[90, 120, 20, 100]} />
      <RedactedRow widths={[100, 130, 20, 80]} />
      <div style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text-muted)' }}>
        Вставлено из Excel · 212 строк · колонки распознаны автоматически
      </div>
    </Frame>
  );
}

/** Шаг 3 — Проверка: линтер перед выпуском, не после. */
export function ValidationMock() {
  const rows: [string, string, 'ok' | 'warn' | 'bad'][] = [
    [PERSON, 'Всё в порядке', 'ok'],
    ['Падеж не подобрался — проверьте вручную', 'Фамилия на «-ых», род неочевиден', 'warn'],
    ['Нет адреса почты — письмо не уйдёт', 'Можно выпустить файл и без письма', 'bad'],
  ];
  const tone = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--danger)' } as const;
  const Icon = { ok: CheckCircle2, warn: ShieldCheck, bad: XCircle } as const;
  return (
    <Frame url="vruchay.ru / документ / проверка">
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 18, fontSize: 13 }}>
        <span style={{ color: 'var(--ok)' }}>● 209 без замечаний</span>
        <span style={{ color: 'var(--warn)' }}>● 2 предупреждения</span>
        <span style={{ color: 'var(--danger)' }}>● 1 блокирует</span>
      </div>
      {rows.map(([title, sub, kind]) => {
        const IconC = Icon[kind];
        return (
          <div
            key={title}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '12px 16px',
              borderBottom: '1px solid var(--line)',
              background: kind === 'ok' ? 'var(--accent-soft)' : 'transparent',
            }}
          >
            <IconC size={16} style={{ color: tone[kind], marginTop: 2, flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: kind === 'ok' ? 600 : 500 }}>{title}</p>
              <p style={{ marginTop: 2, fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>
            </div>
          </div>
        );
      })}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            borderRadius: 'var(--radius-control)',
            background: 'var(--accent-button)',
            color: 'var(--accent-contrast)',
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Исправить все 2
        </span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>или отметьте строки, которые пропустить</span>
      </div>
    </Frame>
  );
}

/** Правила награждения: одно место — три довода — три документа, автоматически. */
export function AwardsMock() {
  const rules: [string, string, number][] = [
    ['Место = 1 → «Диплом победителя»', 'Иванов Иван и ещё 37', 38],
    ['Место 2–3 → «Диплом призёра»', 'на основе колонки «Место»', 76],
    ['Иначе → «Сертификат участника»', 'всем, кто не выбыл', 98],
  ];
  return (
    <Frame url="vruchay.ru / документ / правила награждения">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rules.map(([rule, sub, count], i) => (
          <div
            key={rule}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              borderRadius: 'var(--radius-card)',
              padding: '12px 14px',
              background: i === 0 ? 'var(--accent-soft)' : 'var(--surface-sunken)',
            }}
          >
            {i === 0 ? (
              <Trophy size={18} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            ) : (
              <span
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  borderRadius: 9999,
                  background: 'var(--surface)',
                  boxShadow: 'var(--ring-line)',
                }}
              />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 500 }}>{rule}</p>
              <p style={{ marginTop: 1, fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>
            </div>
            <span
              className="tabular"
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', flexShrink: 0 }}
            >
              {count}
            </span>
          </div>
        ))}
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid var(--line)', fontSize: 12, color: 'var(--text-muted)' }}>
        Что выйдет: 212 документов трёх видов · пересчитано по загруженному протоколу
      </div>
    </Frame>
  );
}

/** Шаг 4 — Письмо: свой шаблон и то, что увидит именно Иван. */
export function LetterMock() {
  return (
    <Frame url="vruchay.ru / документ / письмо">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', minHeight: 0 }}>
        <div style={{ padding: 16, borderRight: '1px solid var(--line)' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
            Тема
          </p>
          <p style={{ marginTop: 4, fontSize: 13, fontWeight: 500 }}>Ваш диплом за «{EVENT}»</p>
          <p
            style={{
              marginTop: 12,
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: 'var(--text-muted)',
            }}
          >
            Текст
          </p>
          <p style={{ marginTop: 4, fontSize: 13, lineHeight: 1.6, color: 'var(--text-muted)' }}>
            Здравствуйте,{' '}
            <span
              style={{
                borderRadius: 4,
                background: 'var(--accent-soft)',
                padding: '1px 5px',
                fontFamily: 'var(--font-mono)',
                fontSize: 12,
                color: 'var(--accent)',
              }}
            >
              %name_dat
            </span>
            ! Ваш документ во вложении.
          </p>
          <p
            style={{
              marginTop: 14,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              color: 'var(--accent)',
            }}
          >
            <Check size={14} /> Прикрепить документ
          </p>
        </div>
        <div style={{ padding: 16, background: 'var(--surface-sunken)' }}>
          <p style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-muted)' }}>
            Как увидит {PERSON.split(' ')[1]}
          </p>
          <div
            style={{
              marginTop: 8,
              borderRadius: 'var(--radius-card)',
              background: 'var(--surface)',
              boxShadow: 'var(--ring-line)',
              padding: 14,
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 500 }}>Ваш диплом за «{EVENT}»</p>
            <p style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
              Здравствуйте, {PERSON_DATIVE}! Ваш документ во вложении.
            </p>
            <div
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                borderRadius: 'var(--radius-control)',
                boxShadow: 'var(--ring-line)',
                padding: '6px 10px',
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              <FileText size={14} /> диплом-иванов.pdf
            </div>
          </div>
        </div>
      </div>
      <div
        style={{
          padding: '10px 16px',
          borderTop: '1px solid var(--line)',
          fontSize: 12,
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Mail size={13} /> Письма уйдут с вашего домена, не с адреса сервиса
      </div>
    </Frame>
  );
}

/** Шаг 5 — Выпуск: список готовности и живой прогресс. */
export function IssueMock() {
  const checks = ['Получатели — 212 отмечено', 'Проверка строк — пройдена', 'Письмо участнику — готово', 'Правила награждения — 3 правила'];
  return (
    <Frame url="vruchay.ru / документ / выпуск">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {checks.map((c) => (
          <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <CheckCircle2 size={15} style={{ color: 'var(--ok)', flexShrink: 0 }} />
            {c}
          </div>
        ))}
      </div>
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>Создаём: {PERSON} · Диплом победителя</span>
          <span className="tabular">187 из 212</span>
        </div>
        <div style={{ marginTop: 6, height: 6, borderRadius: 9999, background: 'var(--surface-sunken)', overflow: 'hidden' }}>
          <div style={{ width: '88%', height: '100%', borderRadius: 9999, background: 'var(--accent)' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '0 16px 16px', flexWrap: 'wrap' }}>
        <span
          style={{
            borderRadius: 'var(--radius-control)',
            background: 'var(--accent-button)',
            color: 'var(--accent-contrast)',
            padding: '8px 14px',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          Создать и разослать
        </span>
        <span
          style={{
            borderRadius: 'var(--radius-control)',
            boxShadow: 'var(--ring-line)',
            padding: '8px 14px',
            fontSize: 13,
            color: 'var(--text-muted)',
          }}
        >
          Только создать файлы
        </span>
      </div>
    </Frame>
  );
}

/** Публичная страница проверки — то, куда ведёт QR на документе. */
export function VerifyMock() {
  return (
    <Frame url={`vruchay.ru / c / ${CODE}`}>
      <div style={{ padding: 20, textAlign: 'center' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 'var(--radius-pill)',
            background: 'var(--ok-soft)',
            color: 'var(--ok)',
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <CheckCircle2 size={15} /> Документ подлинный
        </div>
        <p style={{ marginTop: 14, fontSize: 18, fontWeight: 600 }}>{PERSON}</p>
        <p style={{ marginTop: 2, fontSize: 13, color: 'var(--text-muted)' }}>
          Диплом победителя · {EVENT} · {ORG}
        </p>
        <div
          style={{
            margin: '16px auto 0',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 'var(--radius-control)',
            boxShadow: 'var(--ring-line)',
            padding: '6px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          <QrCode size={14} /> {CODE}
        </div>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)' }}>
          Перетащите PDF сюда — сверим по отпечатку файла, не выходя за пределы браузера
        </p>
      </div>
    </Frame>
  );
}

/** Реестр — внутренний, для «найти и переслать через три месяца». */
export function RegistryMock() {
  return (
    <Frame url="vruchay.ru / реестр">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--line)' }}>
        <Search size={14} style={{ color: 'var(--text-muted)' }} />
        <span style={{ fontSize: 13, color: 'var(--text)' }}>Иванов</span>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>212 записей</span>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: 'var(--accent-soft)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ fontSize: 13, fontWeight: 600 }}>{PERSON}</p>
          <p style={{ marginTop: 1, fontSize: 12, color: 'var(--text-muted)' }}>{EVENT} · выдан 2 августа</p>
        </div>
        <span className="vru-chip vru-chip--ok">Действителен</span>
        <span className="vru-chip vru-chip--ok">Доставлено</span>
      </div>
      <RedactedRow widths={[120, 160]} />
      <RedactedRow widths={[100, 140]} />
      <div style={{ padding: '10px 16px', fontSize: 12, color: 'var(--text-muted)' }}>
        Переслать · Перевыпустить · Отозвать — на выбранных строках или на всём результате поиска
      </div>
    </Frame>
  );
}

/** Файлы: один лист крупно, рядом список выпущенных PDF. */
export function FilesMock() {
  return (
    <Frame url="vruchay.ru / документ / файлы">
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 16, padding: 16 }}>
        <div
          style={{
            borderRadius: 'var(--radius-card)',
            padding: 12,
            background: 'var(--surface-sunken)',
            display: 'grid',
            alignContent: 'center',
          }}
        >
          <MiniSheet label="" main="за первое место" event="" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', fontSize: 14 }}>
            <p style={{ fontWeight: 500 }}>Диплом победителя</p>
            <p
              style={{
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
              }}
            >
              212 файлов
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 500 }}>
                <Archive size={12} /> Скачать архивом
              </span>
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 0',
              borderBottom: '1px solid var(--line)',
              fontSize: 14,
              background: 'var(--accent-soft)',
              margin: '0 -8px',
              paddingLeft: 8,
              paddingRight: 8,
              borderRadius: 8,
            }}
          >
            <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {PERSON}.pdf
            </span>
            <Download size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </div>
          <RedactedRow widths={[130]} />
          <RedactedRow widths={[110]} />
          <p style={{ marginTop: 'auto', paddingTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>и ещё 209 файлов</p>
        </div>
      </div>
    </Frame>
  );
}
