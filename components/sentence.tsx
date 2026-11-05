const WORD_PATTERN = /[.*+?^${}()|[\]\\]/g

function splitSentence(sentence: string, word: string): Array<{ text: string; hit: boolean }> {
  const escaped = word.replace(WORD_PATTERN, "\\$&")
  const pattern = new RegExp(`(?<![A-Za-z])(${escaped})(?![A-Za-z])`, "gi")
  const parts: Array<{ text: string; hit: boolean }> = []
  let last = 0
  for (const match of sentence.matchAll(pattern)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: sentence.slice(last, index), hit: false })
    parts.push({ text: match[0], hit: true })
    last = index + match[0].length
  }
  if (last < sentence.length) parts.push({ text: sentence.slice(last), hit: false })
  if (parts.length === 0) parts.push({ text: sentence, hit: false })
  return parts
}

export function Sentence({
  en,
  word,
  size = "practice",
}: {
  en: string
  word: string
  size?: "practice" | "review"
}) {
  const parts = splitSentence(en, word)
  return (
    <p
      lang="en"
      className={
        size === "review"
          ? "font-serif text-lg leading-snug text-ink"
          : "font-serif text-[1.85rem] leading-[1.25] tracking-tight text-ink sm:text-5xl sm:leading-[1.15]"
      }
    >
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="bg-transparent text-lime underline decoration-2 underline-offset-[5px]">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  )
}
