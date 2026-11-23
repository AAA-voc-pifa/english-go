import type { ReactNode } from "react"
import type { MnemonicData } from "@/lib/types"

function RichLine({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("`") && part.endsWith("`") && part.length > 1 ? (
          <code key={index} className="font-mono text-[0.92em] text-lime">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

function Section({
  label,
  children,
  compact,
}: {
  label: string
  children: ReactNode
  compact?: boolean
}) {
  return (
    <section>
      <p className="mb-1 font-mono text-[11px] tracking-[0.16em] text-lime uppercase">{label}</p>
      <div lang="zh-CN" className={compact ? "text-sm leading-6 text-muted" : "text-base leading-7 text-ink"}>
        {children}
      </div>
    </section>
  )
}

export function MnemonicView({
  data,
  compact = false,
}: {
  data: MnemonicData
  compact?: boolean
}) {
  const hasBody =
    data.all_in_one ||
    data.etymology ||
    data.variant ||
    data.homophonic ||
    data.abbreviation ||
    data.meme ||
    data.other

  if (!hasBody) {
    return <p className="text-sm text-muted">No mnemonic content.</p>
  }

  return (
    <div className={compact ? "mt-2 space-y-3" : "space-y-5"}>
      {data.all_in_one ? (
        <Section label="All in one" compact={compact}>
          <p>
            <RichLine text={data.all_in_one} />
          </p>
        </Section>
      ) : null}

      {data.etymology ? (
        <Section label="Etymology" compact={compact}>
          <ul className="list-disc space-y-1 pl-5">
            {data.etymology.components.map((item) => (
              <li key={item}>
                <RichLine text={item} />
              </li>
            ))}
          </ul>
          <p className={compact ? "mt-2" : "mt-3"}>
            <RichLine text={data.etymology.explanation} />
          </p>
        </Section>
      ) : null}

      {data.variant ? (
        <Section label="Variant" compact={compact}>
          <p>
            <RichLine text={data.variant} />
          </p>
        </Section>
      ) : null}

      {data.homophonic ? (
        <Section label="Homophonic" compact={compact}>
          <ol className="list-decimal space-y-1 pl-5">
            {data.homophonic.list.map((item, index) => (
              <li key={item} className={index === data.homophonic?.best ? "text-ink" : undefined}>
                <RichLine text={item} />
                {index === data.homophonic?.best ? (
                  <span className="ml-2 font-mono text-[10px] tracking-[0.14em] text-lime uppercase">Best</span>
                ) : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {data.abbreviation ? (
        <Section label="Abbreviation" compact={compact}>
          <p>
            <RichLine text={data.abbreviation} />
          </p>
        </Section>
      ) : null}

      {data.meme ? (
        <Section label="Meme" compact={compact}>
          <p>
            <RichLine text={data.meme} />
          </p>
        </Section>
      ) : null}

      {data.other ? (
        <Section label="Other" compact={compact}>
          <p>
            <RichLine text={data.other} />
          </p>
        </Section>
      ) : null}
    </div>
  )
}
