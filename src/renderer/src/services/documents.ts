import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { AppMode } from '../../../shared/types'
import { completeOpenRouterChat, getStoredApiKey, getStoredModel } from './openrouter'

// Bundled locally: the CSP (script-src 'self') blocks a CDN worker, which silently broke every PDF.
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface AttachedDocument {
  id: string
  name: string
  size: number
  type: string
  mode: AppMode | 'all'
  content: string
  /** Condensed once at upload; sent instead of the full text on every request. */
  summary?: string
  /** Several CVs can be stored; only active ones (default) go into prompts. */
  active?: boolean
  addedAt: number
}

const STORAGE_KEY_DOCS = 'cluely_attached_documents'

export function getStoredDocuments(mode?: AppMode): AttachedDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DOCS)
    if (!raw) return []
    const all: AttachedDocument[] = JSON.parse(raw)
    if (!mode) return all
    return all.filter((d) => d.mode === 'all' || d.mode === mode)
  } catch (e) {
    console.error('Failed to load documents from localStorage', e)
    return []
  }
}

export function saveStoredDocuments(docs: AttachedDocument[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_DOCS, JSON.stringify(docs))
  } catch (e) {
    console.error('Failed to save documents to localStorage', e)
  }
}

export function deleteStoredDocument(id: string): void {
  const current = getStoredDocuments()
  const updated = current.filter((d) => d.id !== id)
  saveStoredDocuments(updated)
}

export async function parseFileToText(file: File): Promise<string> {
  const fileName = file.name.toLowerCase()

  // 1. Plain text, markdown, json, csv, code files
  if (
    file.type.startsWith('text/') ||
    fileName.endsWith('.txt') ||
    fileName.endsWith('.md') ||
    fileName.endsWith('.markdown') ||
    fileName.endsWith('.json') ||
    fileName.endsWith('.csv') ||
    fileName.endsWith('.ts') ||
    fileName.endsWith('.js') ||
    fileName.endsWith('.py')
  ) {
    return await file.text()
  }

  // 2. PDF Files (Resumes, CVs, Job descriptions)
  if (file.type === 'application/pdf' || fileName.endsWith('.pdf')) {
    try {
      const arrayBuffer = await file.arrayBuffer()
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer })
      const pdf = await loadingTask.promise
      let fullText = ''

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item: any) => ('str' in item ? item.str : ''))
          .join(' ')
        fullText += `[Page ${pageNum}]\n${pageText}\n\n`
      }

      if (fullText.trim().length > 0) {
        return fullText.trim()
      }
    } catch (pdfErr) {
      console.warn('PDF.js parse warning, attempting fallback text extraction', pdfErr)
    }

    throw new Error(`Could not read text from ${file.name}. Export it as a text-based PDF or TXT.`)
  }

  // 3. Fallback for other document types
  return await file.text()
}

/** Condense a CV / job description / notes into a compact fact sheet. Returns '' if it can't (no key, error). */
export async function summarizeDocument(text: string): Promise<string> {
  const apiKey = getStoredApiKey()
  const model = getStoredModel()
  if (!apiKey || !model) return ''
  try {
    return await completeOpenRouterChat({
      apiKey,
      model,
      maxTokens: 900,
      systemPrompt:
        'Condense the document into a compact fact sheet, max 450 words, plain text. Keep every concrete fact: names, employers, titles, dates, technologies, numbers and metrics. For a CV: headline, skills, experience (employer, role, dates, 2-3 achievements with numbers), projects, education. For a job description or notes: role, requirements, responsibilities, key facts. For a CV, end with one line: Likely target role - <role and level the CV points to>. No commentary, nothing invented.',
      userPrompt: text.replace(/\s+/g, ' ').slice(0, 20000)
    })
  } catch (e) {
    console.warn('Document summary failed, falling back to raw text', e)
    return ''
  }
}

export function formatDocumentsPromptContext(docs: AttachedDocument[]): string {
  if (!docs || docs.length === 0) return ''

  let context = "\n\n=== USER DOCUMENTS (the user's background and notes; use as facts, never paste) ===\n"
  for (const doc of docs) {
    const body = doc.summary || doc.content.replace(/\s+/g, ' ').slice(0, 8000)
    context += `--- ${doc.name} ---\n${body}\n`
  }
  context += '=== END DOCUMENTS ===\n'
  return context
}
