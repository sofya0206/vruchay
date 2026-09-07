import type { CSSProperties, ReactNode } from 'react';
import { Archive, Download, FileText, Image, QrCode, Type, WandSparkles } from 'lucide-react';

/**
 * Экраны продукта для посадочной.
 *
 * Продукт — главная картинка страницы: вместо абстрактных иллюстраций
 * показываем то, что человек увидит в кабинете. Это разметка, а не снимки
 * экрана: она не устаревает при следующей правке интерфейса и не весит
 * мегабайт на первом экране.
 */

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

interface SheetProps {
  scale?: number;
  kind?: string;
  label?: string;
  name?: string;
  main?: string;
  event?: string;
  foot?: string;
  signer?: string;
  signerName?: string;
  org?: string;
  highlightName?: boolean;
}

/**
 * Наградной лист витрины.
 *
 * Размеры внутри листа считаются от `u`, а не задаются в пикселях: лист
 * показывают в четырёх разных масштабах, и только пропорциональная вёрстка
 * переживает это без разъезжающейся типографики.
 */
export function MiniSheet({
  scale = 1,
  kind = 'Сертификат',
  label = 'участника',
  name = 'Островская Анна',
  main = 'за первое место на дистанции 200 м вольным стилем',
  event = 'Первенство области по плаванию',
  foot = '17–19 июня 2026 · Челябинск',
  signer = 'Президент федерации',
  signerName = 'А. В. Соколов',
  org = 'Федерация плавания',
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
          <span>№ K7M2-9QXR</span>
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
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'var(--text-muted)' }}>{signer}</div>
            <div style={{ fontWeight: 500 }}>{signerName}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Документ: редактор макета с подставляемым полем. */
export function EditorMock() {
  return (
    <Frame url="vruchay.ru / документ">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderBottom: '1px solid var(--line)',
          padding: '10px 16px',
          fontSize: 14,
          color: 'var(--text-muted)',
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
        {/* Ширина листа ограничена, чтобы этот экран не возвышался над тремя
            остальными: лист квадратнее их содержимого и рос бы вдвое быстрее. */}
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

/** Таблица: колонки списка становятся полями бланка. */
export function TableMock() {
  const cols = ['ФИО', 'Почта', 'Место', 'Дистанция'];
  const vars = ['%name', '%email', '%place', '%event'];
  const rows = [
    ['Островская Анна', 'anna.k@mail.ru', '1', '200 м вольным стилем'],
    ['Иванов Пётр', 'p.ivanov@yandex.ru', '2', '200 м вольным стилем'],
    ['Смирнова Дарья', 'd.smirnova@gmail.com', '3', '100 м на спине'],
    ['Ким Артём', 'a.kim@mail.ru', '4', '100 м на спине'],
    ['Тарасов Илья', 'i.tarasov@mail.ru', '5', '400 м комплекс'],
  ];
  return (
    <Frame url="vruchay.ru / список участников">
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
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
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((cell, i) => (
                <td
                  key={cell}
                  style={{
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--line)',
                    color: i === 0 ? 'var(--text)' : 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ padding: '12px 14px', fontSize: 14, color: 'var(--text-muted)' }}>
        Excel или CSV · 212 строк · колонки распознаны автоматически
      </div>
    </Frame>
  );
}

/** Файлы: один лист крупно, рядом список выпущенных PDF. */
export function FilesMock() {
  const files = ['Островская Анна', 'Иванов Пётр', 'Смирнова Дарья', 'Ким Артём', 'Тарасов Илья'];
  return (
    <Frame url="vruchay.ru / выпущенные файлы">
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
          <MiniSheet kind="Грамота" label="" main="за первое место" event="" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ paddingBottom: 10, borderBottom: '1px solid var(--line)', fontSize: 14 }}>
            <p style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Грамота за место
            </p>
            <p
              style={{
                marginTop: 2,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
              }}
            >
              212 файлов
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--accent)', fontWeight: 500 }}>
                <Archive size={12} /> Скачать архивом
              </span>
            </p>
          </div>
          {files.map((n, i) => (
            <div
              key={n}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 0',
                borderBottom: '1px solid var(--line)',
                fontSize: 14,
                background: i === 0 ? 'var(--accent-soft)' : 'transparent',
                margin: i === 0 ? '0 -8px' : 0,
                paddingLeft: i === 0 ? 8 : 0,
                paddingRight: i === 0 ? 8 : 0,
                borderRadius: i === 0 ? 8 : 0,
              }}
            >
              <FileText size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {n}.pdf
              </span>
              <Download size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </div>
          ))}
          <p style={{ marginTop: 'auto', paddingTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>и ещё 207 файлов</p>
        </div>
      </div>
    </Frame>
  );
}

/** Письма: судьба каждого письма. */
export function LettersMock() {
  const items: [string, string, string, string][] = [
    ['anna.k@mail.ru', 'Доставлено', 'ok', '2 августа, 14:02'],
    ['p.ivanov@yandex.ru', 'Открыто', 'ok', '2 августа, 14:03'],
    ['d.smirnova@gmail.com', 'Доставлено', 'ok', '2 августа, 14:03'],
    ['a.kim@mail.ru', 'Письмо в пути', 'wait', '2 августа, 14:05'],
    ['i.tarasov@mail.ru', 'Ящик не существует', 'bad', '2 августа, 14:05'],
  ];
  return (
    <Frame url="vruchay.ru / рассылка">
      <div style={{ padding: 16, borderBottom: '1px solid var(--line)' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>От: Федерация плавания &lt;award@sport-fed.ru&gt;</p>
        <p style={{ marginTop: 4, fontWeight: 500 }}>Ваша грамота за Первенство области по плаванию</p>
      </div>
      {items.map(([mail, label, tone, when]) => (
        <div
          key={mail}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 16px',
            borderBottom: '1px solid var(--line)',
            fontSize: 14,
          }}
        >
          <span style={{ flex: 1 }}>{mail}</span>
          <span className={`vru-chip vru-chip--${tone}`}>{label}</span>
          <span className="tabular" style={{ width: 130, textAlign: 'right', color: 'var(--text-muted)' }}>
            {when}
          </span>
        </div>
      ))}
      <div style={{ padding: '12px 16px', fontSize: 14, color: 'var(--text-muted)' }}>212 писем · ушло с вашего домена</div>
    </Frame>
  );
}
