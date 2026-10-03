// The word in a sentence, under a card's answer: the word stands out, pinyin made by the app, English when known.
import { useEffect, useState } from 'react'
import { pinyinLine, tokensOfText } from '../chinese/tokens.ts'
import { exampleFor, type Example } from '../services/sentences.ts'
import { speak } from '../services/tts.ts'
import { getLexicon } from '../services/words.ts'
import PlayButton from './PlayButton.tsx'

export default function ExampleSentence({ hanzi, rate }: { hanzi: string; rate: number }) {
  const [example, setExample] = useState<Example | null>(null)
  useEffect(() => {
    let cancelled = false
    void exampleFor(hanzi).then((e) => !cancelled && setExample(e), () => {})
    return () => {
      cancelled = true
    }
  }, [hanzi])
  if (!example) return null
  const parts = example.zh.split(hanzi)
  const id = `example-${hanzi}`
  return (
    <div className="example">
      <p className="example-zh zh">
        {parts.map((p, i) => (
          <span key={i}>
            {p}
            {i < parts.length - 1 && <strong>{hanzi}</strong>}
          </span>
        ))}
      </p>
      <p className="example-pinyin">{pinyinLine(tokensOfText(example.zh, getLexicon()))}</p>
      {example.en && <p className="example-en muted">{example.en}</p>}
      <PlayButton id={id} label="Hear the sentence" className="link-quiet" start={() => speak(example.zh, rate, id)} />
    </div>
  )
}
