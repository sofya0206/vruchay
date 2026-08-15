import { useState } from 'react';
import { Check, Copy, Gift, Send, MessageCircle } from 'lucide-react';
import { useReferral, type ReferralSummary } from '../api/referral';
import { Button } from '../ui/Button';

/**
 * Раздел «Пригласить друга».
 *
 * Устроен так, что человеку не нужно ничего сочинять и никуда вписывать:
 * текст сообщения готов, кнопка одна, дальше открывается мессенджер.
 * Наши пользователи — секретари федераций и тренеры; форма вида
 * «введите адрес друга» здесь не сработала бы, потому что рекомендуют
 * не по списку адресов, а в разговоре.
 */
export function InviteFriend() {
  const { data, isLoading } = useReferral();

  return (
    <section>
      <h2 className="flex items-center gap-2 font-serif text-xl">
        <Gift size={18} className="text-[var(--accent)]" />
        Пригласить друга
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
        Если сервис вам пригодился, расскажите о нём знакомому организатору. Вы оба получите
        бесплатные документы: он — на старте, вы — когда он начнёт работать.
      </p>

      {isLoading && <p className="mt-4 text-sm text-[var(--text-muted)]">Загружаем…</p>}
      {data && <InviteBody data={data} />}
    </section>
  );
}

function InviteBody({ data }: { data: ReferralSummary }) {
  return (
    <div className="mt-4 max-w-2xl space-y-4">
      <HowItWorks data={data} />
      <ShareBox data={data} />
      <Progress data={data} />
    </div>
  );
}

/** Три шага простым языком. Без этого «реферальная программа» звучит как обман. */
function HowItWorks({ data }: { data: ReferralSummary }) {
  const steps = [
    'Отправьте знакомому готовое сообщение — там уже есть ваша ссылка.',
    `Он регистрируется по ней и получает ${data.welcomeBonus} дополнительных документов сверх обычной пробы.`,
    `Когда он выпустит первые ${data.qualifyDocuments} документов, вам придёт ${data.rewardPerFriend} документов.`,
  ];

  return (
    <ol className="space-y-2.5 rounded-2xl bg-[var(--surface-sunken)] p-4 text-sm">
      {steps.map((text, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full
                       bg-[var(--accent)] text-xs font-medium text-[var(--accent-contrast)]"
          >
            {i + 1}
          </span>
          <span>{text}</span>
        </li>
      ))}
      <li className="pt-1 text-[var(--text-muted)]">
        Мы ждём первых {data.qualifyDocuments} документов, чтобы бонусы нельзя было получать за
        пустые регистрации. Больше чем за {data.maxRewarded} приглашённых начисления не идут.
      </li>
    </ol>
  );
}

/** Главный блок: готовый текст и кнопки, открывающие мессенджер. */
function ShareBox({ data }: { data: ReferralSummary }) {
  const telegram = `https://t.me/share/url?url=${encodeURIComponent(data.link)}&text=${encodeURIComponent(data.message)}`;
  const whatsapp = `https://wa.me/?text=${encodeURIComponent(data.message)}`;

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <p className="text-sm font-medium">Готовое сообщение</p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Можно отправить как есть или переписать своими словами — ссылка внутри уже ваша.
      </p>

      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--surface-sunken)] p-3 font-sans text-sm">
        {data.message}
      </pre>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <CopyButton
          value={data.message}
          variant="primary"
          idle="Скопировать сообщение"
          done="Скопировано — вставьте в переписку"
        />
        {/* Прямые ссылки в мессенджеры: для нашего читателя «скопировать
            и вставить» — отдельное умение, а «открыть телеграм» — нет. */}
        <a href={telegram} target="_blank" rel="noreferrer">
          <Button icon={<Send size={15} />}>Telegram</Button>
        </a>
        <a href={whatsapp} target="_blank" rel="noreferrer">
          <Button icon={<MessageCircle size={15} />}>WhatsApp</Button>
        </a>
      </div>

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className="text-sm text-[var(--text-muted)]">Только ссылка, без текста:</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-[var(--surface-sunken)] px-2.5 py-1.5 text-sm">
            {data.link}
          </code>
          <CopyButton value={data.link} idle="Скопировать ссылку" done="Скопировано" />
        </div>
      </div>
    </div>
  );
}

function Progress({ data }: { data: ReferralSummary }) {
  if (data.invitedTotal === 0) {
    return (
      <p className="text-sm text-[var(--text-muted)]">
        Пока никто не пришёл по вашей ссылке. Как только придёт — появится здесь.
      </p>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4 ring-1 ring-[var(--line)]">
      <div className="flex flex-wrap gap-6">
        <Stat value={data.invitedTotal} label="пришли по ссылке" />
        <Stat value={data.invitedWorking} label="уже работают" />
        <Stat value={data.bonusEarned} label="документов вам начислено" accent />
      </div>

      <ul className="mt-4 space-y-1.5 border-t border-[var(--line)] pt-3 text-sm">
        {data.invited.map((org, i) => (
          <li key={i} className="flex items-center justify-between gap-3">
            <span>{org.name}</span>
            <span className={org.working ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}>
              {org.working
                ? `начислено ${data.rewardPerFriend}`
                : `ещё не выпустил ${data.qualifyDocuments} документов`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <div>
      <div className={`font-serif text-2xl ${accent ? 'text-[var(--accent)]' : ''}`}>{value}</div>
      <div className="text-sm text-[var(--text-muted)]">{label}</div>
    </div>
  );
}

/**
 * Копирование с подтверждением. Подтверждение обязательно: без него человек
 * не знает, сработало ли нажатие, и жмёт ещё раз, а потом бросает.
 */
function CopyButton({
  value,
  idle,
  done,
  variant = 'secondary',
}: {
  value: string;
  idle: string;
  done: string;
  variant?: 'primary' | 'secondary';
}) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant={variant}
      icon={copied ? <Check size={15} /> : <Copy size={15} />}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // Старый браузер или доступ к буферу запрещён. Ссылка видна на
          // экране целиком, её можно выделить руками, поэтому просто
          // не обманываем галочкой.
          return;
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
      }}
    >
      {copied ? done : idle}
    </Button>
  );
}
