export default function PageHeader({ eyebrow, title, description, actions, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="er-label mb-1.5">{eyebrow}</div>}
        <h1 className="text-[22px] font-extrabold leading-tight text-brand-navy sm:text-[26px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}