import type { CSSProperties } from 'react';

/**
 * Картинки для трёх плиток главной.
 *
 * Показывают, что внутри раздела, вместо того чтобы это описывать: лист
 * с подставляемым именем, полка готовых бланков, журнал отправленных писем.
 * Данные в них выдуманные и нарочно неизменные — это витрина раздела,
 * а не сводка. Живые числа стоят внутри самих разделов.
 *
 * Стили заданы прямо здесь, а не классами: рисунок листа держится
 * на пропорциях (кегль и отступы считаются от одной величины `u`),
 * и разнеси их по классам — масштаб пришлось бы повторять в каждом.
 */

/** Общий для листа набор цветов: бумага не меняется вместе с темой. */
const SHEET_VARS = {
  '--text': 'var(--sheet-ink)',
  '--text-muted': 'var(--sheet-ink-muted)',
  '--accent-line': 'var(--sheet-accent)',
} as CSSProperties;

const GLOW =
  'radial-gradient(60% 70% at 0% 0%, rgba(15,119,255,.28), transparent 70%),' +
  'radial-gradient(55% 65% at 100% 100%, rgba(197,180,255,.6), transparent 70%),' +
  'radial-gradient(45% 50% at 100% 0%, rgba(176,131,65,.16), transparent 70%)';

interface SheetProps {
  kind?: string;
  label?: string;
  name?: string;
  main?: string;
  event?: string;
  foot?: string;
  signer?: string;
  signerName?: string;
  org?: string;
  /** Имя обведено рамкой поля — так видно, что оно подставляется. */
  highlightName?: boolean;
}

/** Наградный лист в миниатюре: тот же порядок блоков, что и в настоящем. */
export function MiniSheet({
  kind = 'Сертификат',
  label = 'участника',
  name = 'Островская Анна',
  main = 'за первое место в номинации «Лучший проект»',
  event = 'Конкурс «Мастер года»',
  foot = '17–19 июня 2026 · Челябинск',
  signer = 'Директор центра',
  signerName = 'А. В. Соколов',
  org = 'Центр «Развитие»',
  highlightName = false,
}: SheetProps) {
  /*
   * Кегль считается от ширины самого листа, а не в пикселях.
   *
   * Лист занимает всю ширину плитки, а плитка на разных экранах разной
   * ширины; пиксельный кегль превращал текст в нечитаемую крупу на широком
   * экране. 4,4 % ширины на условную единицу — те же пропорции, что у листа
   * на посадочной: имя получателя выходит примерно в 1/28 ширины, как
   * на настоящей грамоте.
   */
  const cq = (k: number) => `${(4.4 * k).toFixed(3)}cqw`;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '297/210',
        containerType: 'inline-size',
        background: 'var(--sheet-paper)',
        boxShadow: 'inset 0 0 0 1px var(--sheet-line)',
        overflow: 'hidden',
        color: 'var(--sheet-ink)',
        ...SHEET_VARS,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, background: GLOW }} />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          right: '-6%',
          top: '-10%',
          width: '42%',
          height: '60%',
          opacity: 0.35,
        }}
        fill="none"
        stroke="var(--sheet-accent)"
        strokeWidth=".4"
      >
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <path
            key={i}
            d={`M ${100 - i * 7} 0 C ${80 - i * 6} ${30 + i * 4}, ${60 + i * 3} ${60 - i * 3}, 100 ${90 - i * 8}`}
          />
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
      <div
        style={{
          position: 'absolute',
          inset: '5%',
          display: 'flex',
          flexDirection: 'column',
          padding: '7% 8%',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: cq(0.3),
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          <span>{org}</span>
          <span>№ K7M2-9QXR</span>
        </div>

        <div style={{ marginTop: 'auto', marginBottom: 'auto', textAlign: 'center' }}>
          <div
            style={{ fontSize: cq(1.35), fontWeight: 700, letterSpacing: '.02em', lineHeight: 1.1 }}
          >
            {kind}
          </div>
          {label && (
            <div
              style={{
                marginTop: cq(0.15),
                fontSize: cq(0.38),
                letterSpacing: '.14em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              {label}
            </div>
          )}
          <div
            style={{
              margin: `${cq(0.35)} auto 0`,
              width: cq(3),
              height: 2,
              background: 'var(--accent-line)',
            }}
          />
          <div
            style={{
              marginTop: cq(0.6),
              fontSize: cq(0.3),
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
              marginTop: cq(0.25),
              padding: `${cq(0.18)} ${cq(0.9)}`,
              borderRadius: 9999,
              background: 'rgba(255,255,255,.8)',
              boxShadow: highlightName
                ? '0 0 0 1px var(--accent-line)'
                : 'inset 0 0 0 1px rgba(9,17,53,.12)',
              fontSize: cq(0.82),
              fontWeight: 600,
              letterSpacing: '.01em',
            }}
          >
            {name}
            {/* Уголок поля: без него обводка читается как рамка украшения,
                а не как место, куда подставится фамилия из списка. */}
            {highlightName && (
              <span
                style={{
                  position: 'absolute',
                  right: -5,
                  bottom: -5,
                  width: 7,
                  height: 7,
                  background: 'var(--accent-line)',
                }}
              />
            )}
          </div>
          {main && (
            <div
              style={{
                margin: `${cq(0.35)} auto 0`,
                maxWidth: '70%',
                fontSize: cq(0.36),
                lineHeight: 1.45,
                color: 'var(--text-muted)',
              }}
            >
              {main}
              {event ? `. ${event}` : ''}
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            fontSize: cq(0.3),
          }}
        >
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

/** Создание: лист с подсвеченным полем имени и подставляемые поля под ним. */
export function CreateVisual() {
  return (
    <span style={{ display: 'grid', gap: 10, justifyItems: 'center', width: '100%' }}>
      <span style={{ display: 'block', width: '72%', boxShadow: 'var(--shadow-sheet)' }}>
        <MiniSheet
          kind="Сертификат"
          label=""
          main="за первое место"
          event=""
          foot="17 июня 2026"
          signer="Президент"
          signerName="А. Соколов"
          highlightName
        />
      </span>
      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['%name', '%place', '%event'].map((v) => (
          <span
            key={v}
            style={{
              borderRadius: 'var(--radius-pill)',
              background: 'var(--accent-soft)',
              boxShadow: 'inset 0 0 0 1px var(--accent-line)',
              padding: '2px 8px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--accent)',
            }}
          >
            {v}
          </span>
        ))}
      </span>
    </span>
  );
}

/** Документы и шаблоны: полка готовых листов. */
export function LibraryVisual() {
  const sheets: [string, string][] = [
    ['Благодарственное письмо', 'Корпоративные награждения'],
    ['Диплом', 'Олимпиады и конкурсы'],
    ['Сертификат', 'Обучение и семинары'],
  ];

  return (
    <span style={{ display: 'grid', gap: 8, width: '100%' }}>
      {sheets.map(([kind, category], i) => (
        <span
          key={kind}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            borderRadius: 'var(--radius-control)',
            background: i === 0 ? 'var(--accent-soft)' : 'var(--surface)',
            boxShadow: i === 0 ? 'inset 0 0 0 1px var(--accent-line)' : 'var(--ring-line)',
            padding: 5,
          }}
        >
          <span style={{ display: 'block', width: 56, flexShrink: 0 }}>
            <MiniSheet
              kind={kind}
              label=""
              main=""
              event=""
              org=""
              foot=""
              signer=""
              signerName=""
            />
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 500 }}>{kind}</span>
            <span
              style={{
                display: 'block',
                fontSize: 10,
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {category}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Письма: маленький экран журнала с судьбой каждого письма. */
export function MailVisual() {
  const rows: [string, string, string][] = [
    ['anna.k@mail.ru', 'ok', 'Открыто'],
    ['p.ivanov@yandex.ru', 'ok', 'Доставлено'],
    ['d.smirnova@gmail.com', 'wait', 'В пути'],
  ];

  return (
    <span
      style={{
        display: 'block',
        width: '100%',
        borderRadius: 'var(--radius-control)',
        background: 'var(--surface)',
        boxShadow: 'var(--ring-line)',
        overflow: 'hidden',
      }}
    >
      <span
        style={{ display: 'block', padding: '8px 10px', borderBottom: '1px solid var(--line)' }}
      >
        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)' }}>
          От: award@example.ru
        </span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 12, fontWeight: 500 }}>
          Ваш сертификат за конкурс «Мастер года»
        </span>
      </span>
      {rows.map(([address, tone, label]) => (
        <span
          key={address}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 10px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 11,
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {address}
          </span>
          <span
            style={{
              flexShrink: 0,
              borderRadius: 'var(--radius-pill)',
              padding: '2px 8px',
              fontSize: 10,
              fontWeight: 500,
              background: tone === 'ok' ? 'var(--accent-soft)' : 'var(--award-soft)',
              color: tone === 'ok' ? 'var(--accent)' : 'var(--award)',
            }}
          >
            {label}
          </span>
        </span>
      ))}
      <span
        style={{ display: 'block', padding: '6px 10px', fontSize: 10, color: 'var(--text-muted)' }}
      >
        212 писем · ушло с вашего домена
      </span>
    </span>
  );
}
