interface StreamingTextProps {
  text: string
  streaming?: boolean
  className?: string
}

export function StreamingText({ text, streaming, className = '' }: StreamingTextProps) {
  return (
    <span className={className}>
      {text}
      {streaming && text.length > 0 && (
        <span className="stream-cursor" aria-hidden="true" />
      )}
    </span>
  )
}
