"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { KeyButton } from "@/components/key-button"
import { passwordHeaders } from "@/lib/client-auth"
import { cn } from "@/lib/cn"
import { requestJson } from "@/lib/http"
import type { AppSettings, Award, Quiz, QuizQuestion, QuizResponse } from "@/lib/types"

const AWARD_LABEL: Record<Award, string> = {
  5: "生疏",
  10: "可以",
  15: "很熟",
}

type SpeechAudio = HTMLAudioElement & { objectUrl?: string }

function splitSentence(sentence: string, word: string): Array<{ text: string; hit: boolean }> {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

function keepCursor(current: Quiz | null, next: Quiz): Quiz {
  if (!current || current.id !== next.id) return next
  return { ...next, cursor: current.cursor }
}

function advanceAfterAward(current: Quiz | null, incoming: Quiz, questionId: string): Quiz {
  const merged = keepCursor(current, incoming)
  const showing = merged.questions[merged.cursor]
  if (!showing || showing.id !== questionId || showing.award === null) return merged
  if (merged.cursor >= merged.questions.length - 1) return merged
  return { ...merged, cursor: merged.cursor + 1 }
}

function isFinished(quiz: Quiz): boolean {
  return quiz.questions.length > 0 && quiz.questions.every((item) => item.award !== null)
}

let activeAudio: SpeechAudio | null = null

function stopAudio() {
  if (!activeAudio) return
  activeAudio.pause()
  if (activeAudio.objectUrl) URL.revokeObjectURL(activeAudio.objectUrl)
  activeAudio = null
}

function Sentence({ en, word, compact = false }: { en: string; word: string; compact?: boolean }) {
  const parts = splitSentence(en, word)
  return (
    <p
      lang="en"
      className={
        compact
          ? "text-[15px] leading-snug text-ink"
          : "font-serif text-[1.7rem] leading-snug text-ink sm:text-3xl"
      }
    >
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="bg-transparent text-accent underline decoration-2 underline-offset-[6px]">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </p>
  )
}

export function QuizPlayer({ id }: { id: string }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [awardPending, setAwardPending] = useState(false)
  const [speechTarget, setSpeechTarget] = useState<string | null>(null)
  const [sound, setSound] = useState<"idle" | "loading" | "playing">("idle")
  const [soundError, setSoundError] = useState<string | null>(null)
  const savedCursor = useRef<number | null>(null)
  const speechToken = useRef(0)

  useEffect(() => {
    let cancelled = false
    requestJson<QuizResponse>(`/api/quizzes/${id}`)
      .then((data) => {
        if (!cancelled) setQuiz(data.quiz)
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "读不到这组练习")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [id])

  useEffect(() => {
    let cancelled = false
    requestJson<{ settings: AppSettings }>("/api/settings")
      .then((data) => {
        if (!cancelled) setSettings(data.settings)
      })
      .catch(() => {
        if (!cancelled) setSettings(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => stopAudio, [])

  useEffect(() => {
    if (!quiz) return
    if (savedCursor.current === null || savedCursor.current === quiz.cursor) {
      savedCursor.current = quiz.cursor
      return
    }
    const cursor = quiz.cursor
    savedCursor.current = cursor
    void requestJson<QuizResponse>(`/api/quizzes/${quiz.id}`, {
      method: "PATCH",
      body: JSON.stringify({ cursor }),
    }).catch((error: unknown) => {
      setActionError(error instanceof Error ? error.message : "没能记住进度")
    })
  }, [quiz])

  const play = useCallback(
    async (item: Pick<QuizQuestion, "id" | "en">) => {
      const token = speechToken.current + 1
      speechToken.current = token
      stopAudio()
      setSpeechTarget(item.id)
      setSound("loading")
      setSoundError(null)

      const params = new URLSearchParams({ text: item.en })
      if (settings) {
        params.set("voice", settings.voice)
        params.set("rate", settings.rate)
      }

      try {
        const response = await fetch(`/api/speak?${params}`, { headers: passwordHeaders() })
        if (speechToken.current !== token) return
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: unknown } | null
          const message = payload && typeof payload.error === "string" ? payload.error : "这段音频读不出来"
          throw new Error(message)
        }
        const objectUrl = URL.createObjectURL(await response.blob())
        if (speechToken.current !== token) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        const audio: SpeechAudio = new Audio(objectUrl)
        audio.objectUrl = objectUrl
        activeAudio = audio
        audio.addEventListener("ended", () => {
          if (audio.objectUrl) URL.revokeObjectURL(audio.objectUrl)
          audio.objectUrl = undefined
          if (activeAudio !== audio) return
          activeAudio = null
          setSound("idle")
        })
        audio.addEventListener("error", () => {
          if (activeAudio !== audio) return
          stopAudio()
          setSound("idle")
          setSoundError("这段音频读不出来")
        })
        await audio.play()
        if (speechToken.current !== token) {
          stopAudio()
          return
        }
        setSound("playing")
      } catch (error) {
        if (speechToken.current !== token) return
        stopAudio()
        setSound("idle")
        setSoundError(error instanceof Error ? error.message : "浏览器拦住了播放")
      }
    },
    [settings],
  )

  const question = quiz?.questions[quiz.cursor] ?? null
  const finished = quiz ? isFinished(quiz) : false
  const questionId = question?.id
  const questionEn = question?.en

  useEffect(() => {
    return () => {
      speechToken.current += 1
      stopAudio()
    }
  }, [finished, questionId])

  useEffect(() => {
    if (!questionId || !questionEn || !settings?.autoSpeak || finished) return
    const line = { id: questionId, en: questionEn }
    const timer = window.setTimeout(() => {
      void play(line)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [finished, play, questionEn, questionId, settings?.autoSpeak])

  function move(nextCursor: number) {
    stopAudio()
    setSound("idle")
    setSoundError(null)
    setActionError(null)
    setQuiz((current) => {
      if (!current) return current
      if (nextCursor < 0 || nextCursor >= current.questions.length) return current
      if (nextCursor > current.cursor) {
        const showing = current.questions[current.cursor]
        if (!showing || showing.award === null) return current
      }
      return { ...current, cursor: nextCursor }
    })
  }

  async function toggleReveal(current: Quiz, item: QuizQuestion) {
    const revealed = !item.revealed
    setActionError(null)
    setQuiz({
      ...current,
      questions: current.questions.map((entry) => (entry.id === item.id ? { ...entry, revealed } : entry)),
    })
    try {
      const data = await requestJson<QuizResponse>(`/api/quizzes/${current.id}`, {
        method: "PATCH",
        body: JSON.stringify({ questionId: item.id, revealed }),
      })
      setQuiz((latest) => keepCursor(latest, data.quiz))
    } catch (error) {
      setQuiz(current)
      setActionError(error instanceof Error ? error.message : "没能记下译文状态")
    }
  }

  async function award(item: QuizQuestion, points: Award) {
    if (awardPending || item.award !== null) return
    setAwardPending(true)
    setActionError(null)
    try {
      const data = await requestJson<QuizResponse>(`/api/quizzes/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ questionId: item.id, award: points }),
      })
      setQuiz((latest) => advanceAfterAward(latest, data.quiz, item.id))
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "加分失败")
    } finally {
      setAwardPending(false)
    }
  }

  if (loading) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-5 py-8">
        <p role="status" className="text-muted">
          正在读取练习…
        </p>
      </main>
    )
  }

  if (loadError || !quiz || !question) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-5 py-8">
        <p role="alert" className="text-accent">
          {loadError ?? "这组练习是空的"}
        </p>
      </main>
    )
  }

  if (finished) {
    const gained = quiz.questions.reduce((sum, item) => sum + (item.award ?? 0), 0)
    return (
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-5 py-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="font-serif text-3xl italic tracking-tight">一共加上 {gained} points</h1>
          <p className="text-sm text-good">已完成</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quiz.words.map((item) => (
            <div key={item.word} className="flex items-baseline gap-2 rounded-full border border-line bg-card px-3 py-1">
              <span className="font-serif italic">{item.word}</span>
              <span className="text-xs tabular-nums text-muted">{item.points}</span>
            </div>
          ))}
        </div>
        {soundError ? (
          <p role="alert" className="text-sm text-accent">
            {soundError}
          </p>
        ) : null}
        <ol className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {quiz.questions.map((item) => (
            <li key={item.id} className="flex flex-col gap-1.5 rounded-2xl border border-line bg-card px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-serif text-base italic">{item.word}</span>
                <span className="text-xs tabular-nums text-muted">
                  +{item.award}
                  {item.award ? ` ${AWARD_LABEL[item.award]}` : ""}
                </span>
              </div>
              <Sentence en={item.en} word={item.word} compact />
              <p lang="zh-CN" className="text-sm leading-5 text-muted">
                {item.zh}
              </p>
              <button
                type="button"
                onClick={() => void play(item)}
                disabled={sound === "loading" && speechTarget === item.id}
                className="mt-1 inline-flex h-8 items-center self-start rounded-full border border-line px-3 text-xs text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {speechTarget === item.id && sound === "playing"
                  ? "播放中"
                  : speechTarget === item.id && sound === "loading"
                    ? "读取音频"
                    : "朗读"}
              </button>
            </li>
          ))}
        </ol>
      </main>
    )
  }

  const groupIndex = quiz.words.findIndex((item) => item.word === question.word)
  const siblings = quiz.questions.filter((item) => item.word === question.word)
  const place = siblings.findIndex((item) => item.id === question.id) + 1
  const speechLabel =
    speechTarget === question.id && sound === "playing"
      ? "播放中"
      : speechTarget === question.id && sound === "loading"
        ? "读取音频"
        : "朗读"

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-5 py-8">
      <div className="flex flex-wrap gap-2">
        {quiz.words.map((item) => (
          <div
            key={item.word}
            className={cn(
              "flex items-baseline gap-3 rounded-full border px-3 py-1.5",
              item.word === question.word ? "border-accent bg-card" : "border-line bg-card/60",
            )}
          >
            <span className="font-serif text-lg italic">{item.word}</span>
            <span className="text-sm tabular-nums text-muted">{item.points} pts</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4" aria-hidden="true">
        {quiz.words.map((item) => (
          <div key={item.word} className="flex gap-1">
            {quiz.questions
              .filter((entry) => entry.word === item.word)
              .map((entry) => (
                <span
                  key={entry.id}
                  className={cn(
                    "h-1.5 w-7 rounded-full",
                    entry.id === question.id ? "bg-accent" : entry.award !== null ? "bg-good" : "bg-line",
                  )}
                />
              ))}
          </div>
        ))}
      </div>

      <article className="rounded-[28px] border border-line bg-card px-6 py-7 sm:px-8">
        <div className="flex items-baseline justify-between gap-4 text-sm text-muted">
          <p>
            第 {groupIndex + 1} 组 · {place}/{siblings.length}
          </p>
          <p className="tabular-nums">
            {quiz.cursor + 1} / {quiz.questions.length}
          </p>
        </div>
        <h1 className="mt-6 font-serif text-4xl italic tracking-tight text-ink">{question.word}</h1>
        <div className="mt-5">
          <Sentence en={question.en} word={question.word} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <KeyButton shortcut="p" onClick={() => void play(question)} disabled={sound === "loading"}>
            {speechLabel}
          </KeyButton>
          <KeyButton shortcut="r" onClick={() => void toggleReveal(quiz, question)} pressed={question.revealed}>
            {question.revealed ? "收起译文" : "显示译文"}
          </KeyButton>
        </div>
        {soundError ? (
          <p role="alert" className="mt-3 text-sm text-accent">
            {soundError}
          </p>
        ) : null}

        {question.revealed ? (
          <div className="mt-6 border-t border-dashed border-line pt-5">
            <p lang="zh-CN" className="text-lg leading-8 text-ink">
              {question.zh}
            </p>
          </div>
        ) : null}

        <div className="mt-8">
          {question.award === null ? (
            <div className="flex flex-wrap gap-2" role="group" aria-label="给这个单词加分">
              <ScoreButton
                shortcut="a"
                points={5}
                caption="生疏"
                selected={false}
                disabled={awardPending}
                onClick={() => void award(question, 5)}
              />
              <ScoreButton
                shortcut="s"
                points={10}
                caption="可以"
                selected={false}
                disabled={awardPending}
                onClick={() => void award(question, 10)}
              />
              <ScoreButton
                shortcut="d"
                points={15}
                caption="很熟"
                selected={false}
                disabled={awardPending}
                onClick={() => void award(question, 15)}
              />
            </div>
          ) : (
            <p className="text-sm text-ink">
              +{question.award} · {AWARD_LABEL[question.award]}
            </p>
          )}
          {actionError ? (
            <p role="alert" className="mt-3 text-sm text-accent">
              {actionError}
            </p>
          ) : null}
        </div>
      </article>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <KeyButton shortcut="j" onClick={() => move(quiz.cursor - 1)} disabled={quiz.cursor === 0}>
          上一题
        </KeyButton>
        <KeyButton
          shortcut="k"
          onClick={() => move(quiz.cursor + 1)}
          disabled={question.award === null || quiz.cursor === quiz.questions.length - 1}
        >
          下一题
        </KeyButton>
      </div>
    </main>
  )
}

function ScoreButton({
  shortcut,
  points,
  caption,
  selected,
  disabled,
  onClick,
}: {
  shortcut: string
  points: Award
  caption: string
  selected: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <KeyButton shortcut={shortcut} onClick={onClick} disabled={disabled} pressed={selected} tone="score">
      <span className="tabular-nums">+{points}</span>
      <span className={selected ? "text-paper/75" : "text-muted"}>{caption}</span>
    </KeyButton>
  )
}
