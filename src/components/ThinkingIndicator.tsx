interface ThinkingIndicatorProps {
  label?: string
}

export function ThinkingIndicator({ label = '正在翻译' }: ThinkingIndicatorProps) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500">
      <span className="thinking-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {label}
    </span>
  )
}
