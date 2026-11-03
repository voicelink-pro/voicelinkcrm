import { describe, expect, it } from "vitest"

import { matchesDeclaredMime, mimeIsAllowed } from "@/lib/crm/document-bytes"
import {
  documentCategories,
  documentCategoryStyle,
  documentCategoryText,
  parseDocumentQuery,
} from "@/lib/crm/document-query"

const allowed = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "image/png",
  "image/jpeg",
]

function bytes(text: string) {
  return Uint8Array.from(text, (char) => char.charCodeAt(0))
}

describe("document bytes", () => {
  it("odrzuca html, svg i plik wykonywalny nawet gdy lista je zawiera", () => {
    expect(mimeIsAllowed("text/html", [...allowed, "text/html"])).toBe(false)
    expect(mimeIsAllowed("image/svg+xml", [...allowed, "image/svg+xml"])).toBe(false)
    expect(mimeIsAllowed("application/x-msdownload", allowed)).toBe(false)
    expect(mimeIsAllowed("application/pdf", allowed)).toBe(true)
  })

  it("rozpoznaje PDF, PNG i JPEG po treści, nie po nazwie", () => {
    expect(matchesDeclaredMime("application/pdf", bytes("%PDF-1.7"))).toBe(true)
    expect(matchesDeclaredMime("application/pdf", bytes("not a pdf"))).toBe(false)
    expect(matchesDeclaredMime("image/png", Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe(true)
    expect(matchesDeclaredMime("image/jpeg", Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true)
  })

  it("odróżnia DOCX od XLSX i odrzuca HTML oraz EXE w tekście", () => {
    const docx = bytes("PK\u0003\u0004 word/document.xml")
    const xlsx = bytes("PK\u0003\u0004 xl/workbook.xml")
    expect(
      matchesDeclaredMime(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        docx,
      ),
    ).toBe(true)
    expect(
      matchesDeclaredMime(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        xlsx,
      ),
    ).toBe(true)
    expect(matchesDeclaredMime("text/plain", bytes("zwykła notatka"))).toBe(true)
    expect(matchesDeclaredMime("text/plain", bytes("<html><script>"))).toBe(false)
    expect(matchesDeclaredMime("application/pdf", Uint8Array.from([0x4d, 0x5a, 0x90, 0x00]))).toBe(
      false,
    )
  })

  it("obsługuje kategorie Oferta, Integracja i Umowa z przypisanymi kolorami", () => {
    expect(documentCategories).toEqual([
      ["offer", "Oferta"],
      ["integration", "Integracja"],
      ["contract", "Umowa"],
    ])
    expect(documentCategoryText("offer")).toBe("Oferta")
    expect(documentCategoryText("integration")).toBe("Integracja")
    expect(documentCategoryText("contract")).toBe("Umowa")
    expect(documentCategoryStyle("offer").dot).toContain("blue")
    expect(documentCategoryStyle("integration").dot).toContain("amber")
    expect(documentCategoryStyle("contract").dot).toContain("emerald")
    expect(parseDocumentQuery({ category: "integration" }).category).toBe("integration")
  })
})
