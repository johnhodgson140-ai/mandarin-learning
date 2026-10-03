import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Token } from '../../chinese/tokens.ts'
import { go } from '../../hash.ts'
import { load, save } from '../../services/storage.ts'
import { loadDaily } from '../../services/daily.ts'
import { getStory, saveStory, storyTokens, type Story } from '../../services/stories.ts'
import { playbackState, rateForLevel, speak, stopPlayback, subscribePlayback, togglePlayback, unlockAudio, whenDone } from '../../services/tts.ts'
import type { ParagraphResult } from '../../grading/readAloud.ts'
import ReadAloudSheet from './ReadAloudSheet.tsx'
import WordSheet from './WordSheet.tsx'
import './read.css'

type ReaderPrefs = { fontSize: number; toneColours: boolean; english: boolean }
const DEFAULT_PREFS: ReaderPrefs = { fontSize: 24, toneColours: false, english: true }
const SENTENCE_END = /^[。！？!?…]+$/u
const LONG_PRESS_MS = 500

/** `listen`: opened to listen (from Today): the listening bar is open and the text hidden until I tap it. */
export default function Reader({ id, listen = false }: { id: string; listen?: boolean }) {
  const [story, setStory] = useState<Story | undefined>(() => getStory(id))
  const [looked, setLooked] = useState(false)
  // Opened before today's stories were added (e.g. straight from a link): fetch them, then look again.
  useEffect(() => {
    if (story) return
    let cancelled = false
    void loadDaily().finally(() => {
      if (cancelled) return
      setStory(getStory(id))
      setLooked(true)
    })
    return () => {
      cancelled = true
    }
  }, [id, story])
  if (!story)
    return (
      <>
        <a href="#read" className="back-link">‹ Library</a>
        <p className="muted">{looked ? "This story isn't on this device." : 'Loading…'}</p>
      </>
    )
  return <StoryView story={story} onChange={setStory} listen={listen} />
}

function StoryView({ story, onChange, listen }: { story: Story; onChange: (s: Story) => void; listen: boolean }) {
  const paragraphs = useMemo(() => storyTokens(story), [story])
  const listening = useListening(story, paragraphs, listen)
  const [prefs, setPrefs] = useState<ReaderPrefs>(() => ({ ...DEFAULT_PREFS, ...load<Partial<ReaderPrefs>>('reader', {}) }))
  const [showPrefs, setShowPrefs] = useState(false)
  const [selected, setSelected] = useState<{ p: number; t: number } | null>(null)
  const [readingAloud, setReadingAloud] = useState<number | null>(null)
  const [results, setResults] = useState<Record<number, ParagraphResult | undefined>>({})
  const progress = useScrollProgress()
  useReadTime(story)

  function updatePrefs(patch: Partial<ReaderPrefs>) {
    const next = { ...prefs, ...patch }
    setPrefs(next)
    save('reader', next)
  }

  const hidePinyin = (token: Token) =>
    token.mastery === 'mature' || (story.level >= 4 && token.mastery === 'young')

  const longPress = useLongPress((p, t) => speak(sentenceAt(paragraphs[p], t), rateForLevel(story.level)))

  async function finish() {
    const latest = getStory(story.id) ?? story
    await saveStory({ ...latest, readAt: latest.readAt ?? Date.now() })
    go('read')
  }

  function saveGloss(word: string, english: string) {
    const next = { ...story, glossary: { ...story.glossary, [word]: english } }
    onChange(next)
    void saveStory(next)
  }

  const token = selected ? paragraphs[selected.p][selected.t] : null

  return (
    <article className="reader" style={{ '--reader-size': `${prefs.fontSize}px` } as React.CSSProperties}>
      <div className="reading-progress" style={{ transform: `scaleX(${progress})` }} aria-hidden="true" />
      <header className="reader-bar">
        <a href="#read" className="back-link">‹ Library</a>
        <span>
          <button type="button" className="icon-btn" aria-expanded={listening.open} onClick={listening.toggleOpen}>
            Listen
          </button>
          <button type="button" className="icon-btn" aria-expanded={showPrefs} onClick={() => setShowPrefs(!showPrefs)}>
            Aa
          </button>
        </span>
      </header>
      {listening.open && <ListenBar listening={listening} />}
      {showPrefs && (
        <div className="reader-prefs card fade-in">
          <label className="field">
            <span>Text size</span>
            <input type="range" min={18} max={32} step={1} value={prefs.fontSize}
              onChange={(e) => updatePrefs({ fontSize: Number(e.target.value) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.toneColours} onChange={(e) => updatePrefs({ toneColours: e.target.checked })} />
            Tone colours on pinyin
          </label>
          <label className="check">
            <input type="checkbox" checked={prefs.english} onChange={(e) => updatePrefs({ english: e.target.checked })} />
            English under each paragraph
          </label>
        </div>
      )}

      <h1 className="reader-title zh">{story.titleZh}</h1>
      <p className="muted">{story.titleEn}</p>

      <div className={`reader-text zh${prefs.toneColours ? ' tone-colours' : ''}`} onPointerDown={unlockAudio}>
        {paragraphs.map((tokens, p) => {
          const statuses = results[p]?.statuses
          let syllableIndex = 0
          const hidden = listening.isHidden(p)
          return (
          <p
            key={p}
            id={`para-${p}`}
            className={`${listening.at === p ? 'para-now' : ''}${hidden ? ' para-hidden' : ''}`.trim() || undefined}
            onClickCapture={hidden ? (e) => (e.stopPropagation(), e.preventDefault(), listening.reveal(p)) : undefined}
          >
            {tokens.map((tok, t) =>
              tok.syllables.length === 0 ? (
                <span key={t}>{tok.text}</span>
              ) : (
                <span
                  key={t}
                  role="button"
                  tabIndex={0}
                  className={`tok${selected?.p === p && selected.t === t ? ' tok-selected' : ''}`}
                  data-word={tok.text}
                  onClick={() => (longPress.fired() ? undefined : setSelected({ p, t }))}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setSelected({ p, t }))}
                  {...longPress.handlers(p, t)}
                >
                  {tok.syllables.map((s, i) => {
                    const status = statuses?.[syllableIndex++]
                    return (
                      <ruby key={i}>
                        <span className={status && status !== 'ok' ? `st-${status}` : undefined}>{s.hanzi}</span>
                        <rt className={`t${s.written}${hidePinyin(tok) ? ' rt-hidden' : ''}`}>{s.pinyin}</rt>
                      </ruby>
                    )
                  })}
                </span>
              ),
            )}
            {prefs.english && story.translations?.[p] && <span className="reader-en" lang="en">{story.translations[p]}</span>}
            <button type="button" className="read-aloud-btn" onClick={() => setReadingAloud(p)}>
              {statuses ? 'Read again' : 'Read aloud'}
            </button>
          </p>
          )
        })}
      </div>

      <button type="button" className="btn btn-primary reader-finish" onClick={finish}>
        {story.readAt ? 'Back to library' : 'Finished'}
      </button>

      {readingAloud !== null && (
        <ReadAloudSheet
          tokens={paragraphs[readingAloud]}
          storyId={story.id}
          paragraph={readingAloud}
          level={story.level}
          result={results[readingAloud]}
          onResult={(r) => setResults((prev) => ({ ...prev, [readingAloud]: r }))}
          onClose={() => setReadingAloud(null)}
        />
      )}

      {token && selected && (
        <WordSheet
          key={`${selected.p}-${selected.t}`}
          token={token}
          sentence={sentenceAt(paragraphs[selected.p], selected.t)}
          level={story.level}
          onGloss={saveGloss}
          onClose={() => setSelected(null)}
        />
      )}
    </article>
  )
}

type Listening = ReturnType<typeof useListening>

/**
 * Listen to the whole story, paragraph by paragraph, in the app's voice. Listening first and reading after is the
 * best ear training: "Hide text" blurs each paragraph until I tap it, so I check what I understood.
 */
function useListening(story: Story, paragraphs: Token[][], listen: boolean) {
  const [open, setOpen] = useState(listen)
  const [hideText, setHideText] = useState(listen)
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set())
  const [at, setAt] = useState<number | null>(null)
  const run = useRef(0)
  const idOf = (p: number) => `listen-${story.id}-${p}`

  // Leaving the story stops it.
  useEffect(
    () => () => {
      run.current++
      if (playbackState().id?.startsWith(`listen-${story.id}-`)) stopPlayback()
    },
    [story.id],
  )

  async function from(start: number) {
    const mine = ++run.current
    for (let p = start; p < paragraphs.length; p++) {
      setAt(p)
      document.getElementById(`para-${p}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      // A sentence at a time: device voices (Chrome's especially) can stop partway through long text.
      let finished = true
      for (const sentence of sentencesOf(paragraphs[p])) {
        void speak(sentence, rateForLevel(story.level), idOf(p))
        finished = await whenDone(idOf(p))
        if (mine !== run.current) return
        if (!finished) break
      }
      if (!finished) break
    }
    setAt(null)
  }

  return {
    open,
    at,
    hideText,
    toggleOpen: () => setOpen((o) => !o),
    start: () => void from(0),
    pause: () => at !== null && togglePlayback(idOf(at), async () => {}),
    stop: () => {
      run.current++
      setAt(null)
      stopPlayback()
    },
    setHideText: (on: boolean) => {
      setHideText(on)
      setRevealed(new Set())
    },
    isHidden: (p: number) => hideText && !revealed.has(p),
    reveal: (p: number) => setRevealed((r) => new Set(r).add(p)),
    revealAll: () => setRevealed(new Set(paragraphs.map((_, p) => p))),
    paused: (status: string) => at !== null && status === 'paused',
  }
}

function ListenBar({ listening: l }: { listening: Listening }) {
  const p = useSyncExternalStore(subscribePlayback, playbackState)
  const paused = l.paused(p.status)
  return (
    <div className="listen-bar card fade-in">
      <div className="listen-controls">
        {l.at === null ? (
          <button type="button" className="btn btn-primary" onClick={l.start}>▶ Listen to the story</button>
        ) : (
          <>
            <button type="button" className="btn btn-secondary" onClick={l.pause}>{paused ? '▶ Resume' : '⏸ Pause'}</button>
            <button type="button" className="btn btn-secondary" onClick={l.stop}>■ Stop</button>
          </>
        )}
      </div>
      <label className="check">
        <input type="checkbox" checked={l.hideText} onChange={(e) => l.setHideText(e.target.checked)} />
        Hide text (tap a paragraph to check it)
      </label>
      {l.hideText && (
        <button type="button" className="link-quiet" onClick={l.revealAll}>Show all</button>
      )}
    </div>
  )
}

/** A paragraph's sentences as text (each up to and including 。！？). */
function sentencesOf(tokens: Token[]): string[] {
  const out: string[] = []
  let current = ''
  for (const t of tokens) {
    current += t.text
    if (SENTENCE_END.test(t.text)) {
      out.push(current)
      current = ''
    }
  }
  if (current.trim()) out.push(current)
  return out
}

/** The sentence (up to and including 。！？) containing token t. */
function sentenceAt(tokens: Token[], t: number): string {
  let start = t
  while (start > 0 && !SENTENCE_END.test(tokens[start - 1].text)) start--
  let end = t
  while (end < tokens.length - 1 && !SENTENCE_END.test(tokens[end].text)) end++
  return tokens.slice(start, end + 1).map((x) => x.text).join('')
}

function useLongPress(onLongPress: (p: number, t: number) => void) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const cancel = () => window.clearTimeout(timer.current)
  return {
    /** True once after a long press, so the click that follows doesn't also open the word sheet. */
    fired: () => {
      const was = fired.current
      fired.current = false
      return was
    },
    handlers: (p: number, t: number) => ({
      onPointerDown: () => {
        fired.current = false
        cancel()
        timer.current = window.setTimeout(() => {
          fired.current = true
          onLongPress(p, t)
        }, LONG_PRESS_MS)
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    }),
  }
}

function useScrollProgress(): number {
  const [progress, setProgress] = useState(0)
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 1)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return progress
}

/** Add the time this story is on screen (app visible) to its readSeconds. No timer is ever shown. */
function useReadTime(story: Story) {
  useEffect(() => {
    let since = document.visibilityState === 'visible' ? Date.now() : null
    const commit = () => {
      if (since === null) return
      const seconds = Math.round((Date.now() - since) / 1000)
      since = null
      if (seconds < 2) return
      const latest = getStory(story.id)
      if (latest) void saveStory({ ...latest, readSeconds: latest.readSeconds + seconds })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') since = Date.now()
      else commit()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      commit()
    }
  }, [story.id])
}
