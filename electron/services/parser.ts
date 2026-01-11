import fs from 'fs'
import path from 'path'
import { parseStringPromise } from 'xml2js'

export interface BookContent {
  title: string
  author: string
  chapters: Array<{
    title: string
    content: string
  }>
  fullText: string
}

export async function parseBook(filePath: string): Promise<BookContent> {
  const ext = path.extname(filePath).toLowerCase()

  switch (ext) {
    case '.fb2':
      return parseFB2(filePath)
    case '.epub':
      return parseEPUB(filePath)
    case '.txt':
      return parseTXT(filePath)
    default:
      throw new Error(`Unsupported file format: ${ext}`)
  }
}

async function parseFB2(filePath: string): Promise<BookContent> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const result = await parseStringPromise(content, { explicitArray: false })

  const fictionBook = result.FictionBook || result['fiction-book']
  if (!fictionBook) {
    throw new Error('Invalid FB2 file structure')
  }

  const description = fictionBook.description || {}
  const titleInfo = description['title-info'] || {}

  const title = extractTextContent(titleInfo['book-title']) || 'Unknown Title'
  const authorData = titleInfo.author || {}
  const author = [
    extractTextContent(authorData['first-name']),
    extractTextContent(authorData['middle-name']),
    extractTextContent(authorData['last-name']),
  ].filter(Boolean).join(' ') || 'Unknown Author'

  // Handle multiple body elements
  const bodies = Array.isArray(fictionBook.body) ? fictionBook.body : [fictionBook.body].filter(Boolean)
  const chapters: Array<{ title: string; content: string }> = []
  let fullText = ''

  bodies.forEach((body: any) => {
    if (!body) return

    // Extract body title if present
    if (body.title) {
      const bodyTitle = extractTextContent(body.title)
      if (bodyTitle) {
        fullText += bodyTitle + '\n\n'
      }
    }

    // Extract sections
    const sections = Array.isArray(body.section) ? body.section : [body.section].filter(Boolean)

    sections.forEach((section: any, index: number) => {
      const chapterTitle = extractTextContent(section.title) || `Chapter ${index + 1}`
      const chapterContent = extractSectionText(section)

      if (chapterContent.trim()) {
        chapters.push({
          title: chapterTitle,
          content: chapterContent,
        })

        fullText += chapterContent + '\n\n'
      }
    })
  })

  if (!fullText.trim()) {
    throw new Error('No text content to convert')
  }

  return { title, author, chapters, fullText: fullText.trim() }
}

/**
 * Recursively extracts text content from any FB2 node.
 * Handles strings, text nodes (_), and nested elements.
 */
function extractTextContent(node: any): string {
  if (!node) return ''
  if (typeof node === 'string') return node.trim()
  if (typeof node === 'number') return String(node)

  // If it's an array, process each element
  if (Array.isArray(node)) {
    return node.map(extractTextContent).filter(Boolean).join(' ')
  }

  // If it's an object with text content
  if (typeof node === 'object') {
    const parts: string[] = []

    // Direct text content (xml2js stores text in _ property)
    if (node._) {
      parts.push(node._.trim())
    }

    // Check for common inline elements that contain text
    const inlineElements = ['emphasis', 'strong', 'a', 'strikethrough', 'sub', 'sup', 'code', 'style']
    for (const elem of inlineElements) {
      if (node[elem]) {
        const elemContent = Array.isArray(node[elem]) ? node[elem] : [node[elem]]
        elemContent.forEach((item: any) => {
          const text = extractTextContent(item)
          if (text) parts.push(text)
        })
      }
    }

    // Handle paragraph elements
    if (node.p) {
      const paragraphs = Array.isArray(node.p) ? node.p : [node.p]
      paragraphs.forEach((p: any) => {
        const text = extractTextContent(p)
        if (text) parts.push(text)
      })
    }

    // Handle verse elements in poems
    if (node.v) {
      const verses = Array.isArray(node.v) ? node.v : [node.v]
      verses.forEach((v: any) => {
        const text = extractTextContent(v)
        if (text) parts.push(text)
      })
    }

    return parts.join(' ').trim()
  }

  return ''
}

/**
 * Extracts all text from an FB2 section, including nested sections
 * and all text-containing elements.
 */
function extractSectionText(section: any): string {
  if (!section) return ''

  const parts: string[] = []

  // Process all child elements in order
  // FB2 sections can contain: title, epigraph, image, annotation,
  // section, p, poem, subtitle, cite, empty-line, table, text-author

  // Extract title
  if (section.title) {
    const titleText = extractTextContent(section.title)
    if (titleText) parts.push(titleText)
  }

  // Extract epigraphs
  if (section.epigraph) {
    const epigraphs = Array.isArray(section.epigraph) ? section.epigraph : [section.epigraph]
    epigraphs.forEach((epigraph: any) => {
      const epigraphText = extractElementText(epigraph)
      if (epigraphText) parts.push(epigraphText)
    })
  }

  // Extract paragraphs
  if (section.p) {
    const paragraphs = Array.isArray(section.p) ? section.p : [section.p]
    paragraphs.forEach((p: any) => {
      const text = extractTextContent(p)
      if (text) parts.push(text)
    })
  }

  // Extract subtitles
  if (section.subtitle) {
    const subtitles = Array.isArray(section.subtitle) ? section.subtitle : [section.subtitle]
    subtitles.forEach((subtitle: any) => {
      const text = extractTextContent(subtitle)
      if (text) parts.push(text)
    })
  }

  // Extract poems
  if (section.poem) {
    const poems = Array.isArray(section.poem) ? section.poem : [section.poem]
    poems.forEach((poem: any) => {
      const poemText = extractPoemText(poem)
      if (poemText) parts.push(poemText)
    })
  }

  // Extract citations
  if (section.cite) {
    const cites = Array.isArray(section.cite) ? section.cite : [section.cite]
    cites.forEach((cite: any) => {
      const citeText = extractElementText(cite)
      if (citeText) parts.push(citeText)
    })
  }

  // Extract text-author
  if (section['text-author']) {
    const authors = Array.isArray(section['text-author']) ? section['text-author'] : [section['text-author']]
    authors.forEach((author: any) => {
      const text = extractTextContent(author)
      if (text) parts.push(text)
    })
  }

  // Extract nested sections recursively
  if (section.section) {
    const subsections = Array.isArray(section.section) ? section.section : [section.section]
    subsections.forEach((sub: any) => {
      const subText = extractSectionText(sub)
      if (subText) parts.push(subText)
    })
  }

  return parts.filter(Boolean).join('\n\n')
}

/**
 * Extracts text from poem elements (stanzas and verses)
 */
function extractPoemText(poem: any): string {
  if (!poem) return ''

  const parts: string[] = []

  // Poem title
  if (poem.title) {
    const titleText = extractTextContent(poem.title)
    if (titleText) parts.push(titleText)
  }

  // Poem epigraph
  if (poem.epigraph) {
    const epigraphs = Array.isArray(poem.epigraph) ? poem.epigraph : [poem.epigraph]
    epigraphs.forEach((epigraph: any) => {
      const text = extractElementText(epigraph)
      if (text) parts.push(text)
    })
  }

  // Stanzas
  if (poem.stanza) {
    const stanzas = Array.isArray(poem.stanza) ? poem.stanza : [poem.stanza]
    stanzas.forEach((stanza: any) => {
      if (stanza.v) {
        const verses = Array.isArray(stanza.v) ? stanza.v : [stanza.v]
        const stanzaText = verses.map((v: any) => extractTextContent(v)).filter(Boolean).join('\n')
        if (stanzaText) parts.push(stanzaText)
      }
    })
  }

  // Text author of poem
  if (poem['text-author']) {
    const authors = Array.isArray(poem['text-author']) ? poem['text-author'] : [poem['text-author']]
    authors.forEach((author: any) => {
      const text = extractTextContent(author)
      if (text) parts.push(text)
    })
  }

  return parts.join('\n\n')
}

/**
 * Extracts text from generic container elements (epigraph, cite, etc.)
 * that can contain p, poem, text-author, subtitle, etc.
 */
function extractElementText(element: any): string {
  if (!element) return ''

  const parts: string[] = []

  // Paragraphs
  if (element.p) {
    const paragraphs = Array.isArray(element.p) ? element.p : [element.p]
    paragraphs.forEach((p: any) => {
      const text = extractTextContent(p)
      if (text) parts.push(text)
    })
  }

  // Poems within the element
  if (element.poem) {
    const poems = Array.isArray(element.poem) ? element.poem : [element.poem]
    poems.forEach((poem: any) => {
      const poemText = extractPoemText(poem)
      if (poemText) parts.push(poemText)
    })
  }

  // Text author
  if (element['text-author']) {
    const authors = Array.isArray(element['text-author']) ? element['text-author'] : [element['text-author']]
    authors.forEach((author: any) => {
      const text = extractTextContent(author)
      if (text) parts.push(text)
    })
  }

  // Subtitle
  if (element.subtitle) {
    const subtitles = Array.isArray(element.subtitle) ? element.subtitle : [element.subtitle]
    subtitles.forEach((subtitle: any) => {
      const text = extractTextContent(subtitle)
      if (text) parts.push(text)
    })
  }

  return parts.join('\n\n')
}

async function parseEPUB(filePath: string): Promise<BookContent> {
  // Dynamic import for epub2
  const EPub = (await import('epub2')).default

  return new Promise((resolve, reject) => {
    const epub = new EPub(filePath)

    epub.on('error', reject)

    epub.on('end', async () => {
      try {
        const title = epub.metadata.title || 'Unknown Title'
        const author = epub.metadata.creator || 'Unknown Author'

        const chapters: Array<{ title: string; content: string }> = []
        let fullText = ''

        const flow = epub.flow || []

        for (const chapter of flow) {
          if (!chapter.id) continue

          try {
            const chapterContent = await new Promise<string>((res, rej) => {
              epub.getChapter(chapter.id!, (error: Error, text?: string) => {
                if (error) rej(error)
                else res(text || '')
              })
            })

            // Strip HTML tags
            const cleanContent = stripHtml(chapterContent)

            if (cleanContent.trim()) {
              chapters.push({
                title: chapter.title || `Chapter ${chapters.length + 1}`,
                content: cleanContent,
              })
              fullText += cleanContent + '\n\n'
            }
          } catch (e) {
            // Skip chapters that fail to parse
          }
        }

        resolve({ title, author, chapters, fullText: fullText.trim() })
      } catch (error) {
        reject(error)
      }
    })

    epub.parse()
  })
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function parseTXT(filePath: string): Promise<BookContent> {
  const content = fs.readFileSync(filePath, 'utf-8')
  const fileName = path.basename(filePath, '.txt')

  // Split into paragraphs
  const paragraphs = content
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0)

  // Try to detect chapters by patterns like "Chapter X" or "Глава X"
  const chapterPattern = /^(chapter|глава|часть|part)\s*\d*/i
  const chapters: Array<{ title: string; content: string }> = []
  let currentChapter = { title: 'Text', content: '' }

  paragraphs.forEach(para => {
    if (chapterPattern.test(para)) {
      if (currentChapter.content) {
        chapters.push({ ...currentChapter })
      }
      currentChapter = { title: para.split('\n')[0], content: para }
    } else {
      currentChapter.content += (currentChapter.content ? '\n\n' : '') + para
    }
  })

  if (currentChapter.content) {
    chapters.push(currentChapter)
  }

  return {
    title: fileName,
    author: 'Unknown',
    chapters,
    fullText: content,
  }
}
