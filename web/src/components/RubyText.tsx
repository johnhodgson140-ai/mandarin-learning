// Chinese text with pinyin above each character, hidden for words I know well (as in the Reader).
import type { Token } from '../chinese/tokens.ts'

export default function RubyText({ tokens, className = '' }: { tokens: Token[]; className?: string }) {
  return (
    <span className={`ruby-text zh ${className}`}>
      {tokens.map((tok, t) =>
        tok.syllables.length === 0 ? (
          <span key={t}>{tok.text}</span>
        ) : (
          tok.syllables.map((s, i) => (
            <ruby key={`${t}-${i}`}>
              {s.hanzi}
              <rt className={`t${s.written}${tok.mastery === 'mature' ? ' rt-hidden' : ''}`}>{s.pinyin}</rt>
            </ruby>
          ))
        ),
      )}
    </span>
  )
}
