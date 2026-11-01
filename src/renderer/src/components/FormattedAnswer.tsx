import React, { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface FormattedAnswerProps {
  content: string
  isStreaming: boolean
}

interface CodeBlockProps {
  code: string
  language: string
}

const CodeBlock: React.FC<CodeBlockProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = (): void => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="code-block-container">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'code'}</span>
        <button className="code-block-copy-btn" onClick={handleCopy}>
          {copied ? (
            <>
              <Check size={12} className="text-emerald-400" />
              <span>Copied</span>
            </>
          ) : (
            <>
              <Copy size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="code-block-pre">
        <code>{code}</code>
      </pre>
    </div>
  )
}

export const FormattedAnswer: React.FC<FormattedAnswerProps> = ({ content, isStreaming }) => {
  // Parse code blocks vs regular text
  const parts: React.ReactNode[] = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(content)) !== null) {
    // Add text preceding the code block
    if (match.index > lastIndex) {
      const textChunk = content.substring(lastIndex, match.index)
      parts.push(renderTextChunk(textChunk, `text-${lastIndex}`))
    }

    const language = match[1] || 'plaintext'
    const code = match[2].trimEnd()
    parts.push(<CodeBlock key={`code-${match.index}`} language={language} code={code} />)

    lastIndex = match.index + match[0].length
  }

  // Add remaining trailing text
  if (lastIndex < content.length) {
    const trailing = content.substring(lastIndex)
    parts.push(renderTextChunk(trailing, `text-${lastIndex}`))
  }

  return (
    <div className="formatted-answer-root">
      {parts}
      {isStreaming && <span className="streaming-cursor">▍</span>}
    </div>
  )
}

function renderTextChunk(text: string, keyPrefix: string): React.ReactNode {
  const lines = text.split('\n')

  return (
    <div key={keyPrefix} className="text-chunk">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (!trimmed) {
          return <div key={idx} className="empty-line-spacer" />
        }

        // Bullet points
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="bullet-row">
              <span className="bullet-dot">•</span>
              <span className="bullet-text">{parseInlineFormatting(trimmed.substring(2))}</span>
            </div>
          )
        }

        // Numbered list
        const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
        if (numMatch) {
          return (
            <div key={idx} className="bullet-row">
              <span className="bullet-num">{numMatch[1]}.</span>
              <span className="bullet-text">{parseInlineFormatting(numMatch[2])}</span>
            </div>
          )
        }

        // Section headers (### or **Header:**)
        if (trimmed.startsWith('### ') || trimmed.startsWith('## ')) {
          const headerText = trimmed.replace(/^#{2,3}\s+/, '')
          return (
            <div key={idx} className="section-heading">
              {headerText}
            </div>
          )
        }

        // Standard paragraph
        return (
          <p key={idx} className="paragraph-line">
            {parseInlineFormatting(line)}
          </p>
        )
      })}
    </div>
  )
}

// Parses **bold** and `inline code`
function parseInlineFormatting(text: string): React.ReactNode {
  const tokens: React.ReactNode[] = []
  // Matches `code` or **bold**
  const regex = /(`[^`]+`|\*\*[^*]+\*\*)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.substring(lastIndex, match.index))
    }

    const token = match[0]
    if (token.startsWith('`') && token.endsWith('`')) {
      tokens.push(
        <code key={match.index} className="inline-code-pill">
          {token.slice(1, -1)}
        </code>
      )
    } else if (token.startsWith('**') && token.endsWith('**')) {
      tokens.push(
        <strong key={match.index} className="bold-highlight">
          {token.slice(2, -2)}
        </strong>
      )
    }

    lastIndex = match.index + token.length
  }

  if (lastIndex < text.length) {
    tokens.push(text.substring(lastIndex))
  }

  return tokens
}

