import type { ReactNode } from "react";

type UiTone = "default" | "primary" | "secondary" | "success" | "warning" | "danger";

type AlertChip = {
  label: string;
  color: UiTone;
};

type MetaItem = {
  label: string;
  value: string;
};

export function LogAlertCard({
  tone,
  eyebrow,
  title,
  chips,
  description,
  message,
  meta,
  timestamp,
  codeLabel,
  compact = false,
  monospaceMessage = false
}: {
  tone: UiTone;
  eyebrow: string;
  title: string;
  chips: AlertChip[];
  description?: string;
  message: ReactNode;
  meta: MetaItem[];
  timestamp: string;
  codeLabel: string;
  compact?: boolean;
  monospaceMessage?: boolean;
}) {
  return (
    <article
      className={`log-alert-card rounded-[1rem] ${compact ? "p-2.5 sm:p-3" : "p-4 sm:p-5"}`}
      data-tone={tone}
    >
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="panel-meta">{eyebrow}</p>
            {chips.map((chip) => (
              <span key={`${chip.label}-${chip.color}`} className="log-pill" data-tone={chip.color}>
                {chip.label}
              </span>
            ))}
          </div>
          <div className="space-y-1">
            <h3 className={`${compact ? "text-sm" : "text-lg"} break-words font-semibold tracking-[-0.02em] text-ink`}>
              {title}
            </h3>
            {description ? (
              <p className="max-w-4xl text-[11px] leading-5 text-muted-ink">{description}</p>
            ) : null}
          </div>
        </div>

        <div className="panel-meta max-w-full space-y-1 text-left sm:text-right">
          <div>{timestamp}</div>
          <div className="break-all">{codeLabel}</div>
        </div>
      </div>

      <div
        className={`log-alert-message mt-2.5 overflow-x-auto rounded-[0.8rem] px-2.5 py-2.5 ${
          monospaceMessage ? "font-mono text-[11px] leading-5" : "text-[12px] leading-5"
        } text-ink`}
      >
        {message}
      </div>

      {meta.length > 0 ? (
        <dl className={`mt-2.5 grid gap-1.5 ${compact ? "sm:grid-cols-2 xl:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4"}`}>
          {meta.map((item) => (
            <div key={`${item.label}-${item.value}`} className="log-alert-meta rounded-[0.75rem] px-2.5 py-2">
              <dt className="panel-meta">{item.label}</dt>
              <dd className="mt-1 break-words text-[11px] leading-5 text-ink">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </article>
  );
}
