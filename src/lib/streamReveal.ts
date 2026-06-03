export interface StreamRevealOptions {
  charsPerStep?: number
  stepMs?: number
  signal?: AbortSignal
}

function splitUnits(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    return [...seg.segment(text)].map((s) => s.segment)
  }
  return [...text]
}

function revealSpeed(text: string): Pick<StreamRevealOptions, 'charsPerStep' | 'stepMs'> {
  const len = splitUnits(text).length
  if (len > 400) return { charsPerStep: 6, stepMs: 16 }
  if (len > 200) return { charsPerStep: 4, stepMs: 20 }
  if (len > 80) return { charsPerStep: 2, stepMs: 28 }
  return { charsPerStep: 1, stepMs: 36 }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

/** 将完整文本逐字/逐词展示，用于「AI 思考式」输出效果 */
export async function streamRevealText(
  fullText: string,
  onUpdate: (partial: string) => void,
  options: StreamRevealOptions = {},
): Promise<void> {
  if (!fullText) {
    onUpdate('')
    return
  }

  const speed = revealSpeed(fullText)
  const charsPerStep = options.charsPerStep ?? speed.charsPerStep ?? 1
  const stepMs = options.stepMs ?? speed.stepMs ?? 30
  const units = splitUnits(fullText)
  let built = ''

  for (let i = 0; i < units.length; i += charsPerStep) {
    if (options.signal?.aborted) {
      onUpdate(fullText)
      return
    }
    built += units.slice(i, i + charsPerStep).join('')
    onUpdate(built)
    if (i + charsPerStep < units.length) {
      await sleep(stepMs, options.signal)
    }
  }
}
