"use client"

import {
  parseInvoiceOcrText,
  type ExtractedInvoiceFields,
} from "@/lib/crm/invoice-ocr"

export type OcrProgressCallback = (stage: string, percent: number) => void

async function extractFromPdfBuffer(
  file: File,
  onProgress?: OcrProgressCallback,
): Promise<{ text: string; renderedPageBlob: Blob | null }> {
  onProgress?.("Odczytywanie struktury PDF...", 15)

  const pdfjs = await import("pdfjs-dist")
  if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  }

  const arrayBuffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) })
  const pdf = await loadingTask.promise

  const pageCount = Math.min(pdf.numPages, 4)
  const pageTexts: string[] = []

  for (let i = 1; i <= pageCount; i += 1) {
    onProgress?.(`Analiza warstwy tekstowej PDF (strona ${i}/${pageCount})...`, 20 + i * 15)
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const items = content.items as Array<{
      str?: string
      transform?: number[]
      hasEOL?: boolean
    }>

    let lastY: number | null = null
    let line = ""
    const lines: string[] = []

    for (const item of items) {
      const str = item.str ?? ""
      const y = item.transform?.[5] ?? null
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 4) {
        if (line.trim()) lines.push(line.trim())
        line = str
      } else {
        line += (line && !line.endsWith(" ") && !str.startsWith(" ") ? " " : "") + str
      }
      if (item.hasEOL) {
        if (line.trim()) lines.push(line.trim())
        line = ""
      }
      if (y !== null) lastY = y
    }
    if (line.trim()) lines.push(line.trim())
    pageTexts.push(lines.join("\n"))
  }

  const combinedText = pageTexts.join("\n\n").trim()

  // Jeśli PDF ma natywną warstwę tekstową (> 35 znaków), zwracamy ją od razu
  if (combinedText.length >= 35) {
    return { text: combinedText, renderedPageBlob: null }
  }

  // Jeśli PDF to zeskanowany obraz (brak warstwy tekstowej), renderujemy pierwszą stronę na canvas pod OCR
  onProgress?.("Wykryto skan PDF — renderowanie obrazu pod OCR...", 50)
  const firstPage = await pdf.getPage(1)
  const viewport = firstPage.getViewport({ scale: 2.0 })
  const canvas = document.createElement("canvas")
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    return { text: combinedText, renderedPageBlob: null }
  }

  await firstPage.render({ canvasContext: ctx, canvas, viewport }).promise
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  )

  return { text: combinedText, renderedPageBlob: blob }
}

async function runOpticalCharacterRecognition(
  imageSource: File | Blob,
  onProgress?: OcrProgressCallback,
): Promise<string> {
  onProgress?.("Uruchamianie silnika OCR (polski + angielski)...", 60)
  const Tesseract = await import("tesseract.js")
  const result = await Tesseract.recognize(imageSource, "pol+eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.(
          `Rozpoznawanie tekstu OCR (${Math.round(m.progress * 100)}%)...`,
          60 + Math.round(m.progress * 35),
        )
      }
    },
  })
  return result.data?.text ?? ""
}

export async function extractInvoiceFromFileClient(
  file: File,
  ourNip?: string | null,
  onProgress?: OcrProgressCallback,
): Promise<ExtractedInvoiceFields> {
  const mime = file.type.toLowerCase()
  const name = file.name

  let extractedText = ""

  if (mime === "application/xml" || mime === "text/xml" || name.toLowerCase().endsWith(".xml")) {
    onProgress?.("Odczytywanie faktury ustrukturyzowanej KSeF XML...", 50)
    extractedText = await file.text()
  } else if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    try {
      const { text, renderedPageBlob } = await extractFromPdfBuffer(file, onProgress)
      if (text.length >= 35) {
        extractedText = text
      } else if (renderedPageBlob) {
        extractedText = await runOpticalCharacterRecognition(renderedPageBlob, onProgress)
      }
    } catch {
      // Fallback: próba odczytu surowych ciągów tekstowych z bufora PDF
      const rawBuf = await file.text().catch(() => "")
      extractedText = rawBuf
    }
  } else if (mime.startsWith("image/")) {
    extractedText = await runOpticalCharacterRecognition(file, onProgress)
  } else {
    extractedText = await file.text().catch(() => "")
  }

  onProgress?.("Przypisywanie rozpoznanych pól faktury...", 98)
  const parsed = parseInvoiceOcrText(extractedText, name, ourNip)
  onProgress?.("Rozpoznano dane faktury", 100)
  return parsed
}
