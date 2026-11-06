export type InvoiceLineItem = {
  name: string
  quantity: number
  unitPriceNetCents: number
  vatRate: string
  netCents: number
  grossCents: number
}

export type ExtractedInvoiceFields = {
  invoiceNumber: string
  ksefReferenceNumber: string
  issueDate: string
  saleDate: string
  dueDate: string
  sellerName: string
  sellerNip: string
  buyerName: string
  buyerNip: string
  currency: string
  netCents: number
  vatCents: number
  grossCents: number
  paymentMethod: "transfer" | "card" | "cash" | "other"
  bankAccount: string
  kind: "sales" | "purchase"
  confidence: number
  rawText: string
  lineItems: InvoiceLineItem[]
}

const polishMonths: Record<string, string> = {
  stycznia: "01",
  lutego: "02",
  marca: "03",
  kwietnia: "04",
  maja: "05",
  czerwca: "06",
  lipca: "07",
  sierpnia: "08",
  wrzesnia: "09",
  września: "09",
  pazdziernika: "10",
  października: "10",
  listopada: "11",
  grudnia: "12",
}

function normalizeDateToken(raw: string): string | null {
  const cleaned = raw.trim()

  // YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
  const iso = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(cleaned)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    }
  }

  // DD.MM.YYYY or DD-MM-YYYY or DD/MM/YYYY
  const dmy = /^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/.exec(cleaned)
  if (dmy) {
    const d = Number(dmy[1])
    const m = Number(dmy[2])
    const y = Number(dmy[3])
    if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    }
  }

  // "5 listopada 2026"
  const wordMatch = /^(\d{1,2})\s+([a-ząćęłńóśźż]+)\s+(\d{4})$/i.exec(cleaned)
  if (wordMatch) {
    const d = Number(wordMatch[1])
    const mStr = polishMonths[wordMatch[2]!.toLowerCase()]
    const y = Number(wordMatch[3])
    if (mStr && y >= 2000 && y <= 2100 && d >= 1 && d <= 31) {
      return `${y}-${mStr}-${String(d).padStart(2, "0")}`
    }
  }

  return null
}

export function cleanNip(value: string): string {
  const digits = value.replace(/^PL/i, "").replace(/\D/g, "")
  return digits.length === 10 ? digits : ""
}

export function parsePolishMoneyToCents(raw: string): number | null {
  const cleaned = raw
    .replace(/\b(PLN|EUR|USD|zł|zl)\b/gi, "")
    .replace(/[\s\u00A0']/g, "")
    .trim()

  if (!cleaned) return null

  const normalized = cleaned.replace(",", ".")
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    return null
  }

  const num = Number(normalized)
  if (!Number.isFinite(num) || num < 0) return null
  return Math.round(num * 100)
}

/**
 * Parsuje oficjalny XML faktury ustrukturyzowanej KSeF FA(2) / FA(3)
 */
export function parseKsefXmlInvoice(
  xml: string,
  ourNip?: string | null,
): ExtractedInvoiceFields | null {
  if (!xml.includes("<Faktura") && !xml.includes(":Faktura")) {
    return null
  }

  const block = (name: string, scope: string = xml): string => {
    const re = new RegExp(
      `<(?:\\w+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:\\w+:)?${name}>`,
      "i",
    )
    const m = re.exec(scope)
    return m ? m[1]!.trim() : ""
  }

  const tag = (name: string, scope: string = xml): string => {
    return block(name, scope).replace(/<[^>]+>/g, "").trim()
  }

  const podmiot1Block = block("Podmiot1") || xml
  const podmiot2Block = block("Podmiot2") || xml
  const faBlock = block("Fa") || xml

  const sellerNip = cleanNip(tag("NIP", podmiot1Block))
  const sellerName =
    tag("Nazwa", podmiot1Block) ||
    tag("PelnaNazwa", podmiot1Block) ||
    [tag("ImiePierwsze", podmiot1Block), tag("Nazwisko", podmiot1Block)]
      .filter(Boolean)
      .join(" ") ||
    "Sprzedawca"

  const buyerNip = cleanNip(tag("NIP", podmiot2Block))
  const buyerName =
    tag("Nazwa", podmiot2Block) ||
    tag("PelnaNazwa", podmiot2Block) ||
    [tag("ImiePierwsze", podmiot2Block), tag("Nazwisko", podmiot2Block)]
      .filter(Boolean)
      .join(" ") ||
    "Nabywca"

  const invoiceNumber = tag("P_2", faBlock) || tag("NumerFaktury", faBlock) || "FV/KSEF"
  const issueDate =
    normalizeDateToken(tag("P_1", faBlock)) ?? new Date().toISOString().slice(0, 10)
  const saleDate = normalizeDateToken(tag("P_6", faBlock)) ?? issueDate
  const dueDate =
    normalizeDateToken(tag("Termin", faBlock)) ??
    normalizeDateToken(tag("DataZaplaty", faBlock)) ??
    ""

  const currency = (tag("KodWaluty", faBlock) || "PLN").toUpperCase().slice(0, 3)

  const netCents =
    parsePolishMoneyToCents(tag("P_13_1", faBlock)) ??
    parsePolishMoneyToCents(tag("P_13_2", faBlock)) ??
    0
  const vatCents =
    parsePolishMoneyToCents(tag("P_14_1", faBlock)) ??
    parsePolishMoneyToCents(tag("P_14_2", faBlock)) ??
    0
  const grossFromTag = parsePolishMoneyToCents(tag("P_15", faBlock))
  const grossCents = grossFromTag ?? netCents + vatCents

  const bankAccount = tag("NrRB", faBlock).replace(/\s+/g, "")
  const ksefReferenceNumber = tag("NumerKSeF") || tag("KSeFReferenceNumber") || ""

  // Wiersze faktury FaWiersz
  const lineItems: InvoiceLineItem[] = []
  const rowRegex = /<(?:\w+:)?FaWiersz[^>]*>([\s\S]*?)<\/(?:\w+:)?FaWiersz>/gi
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRegex.exec(faBlock)) !== null) {
    const rowXml = rowMatch[1]!
    const itemName = tag("P_7", rowXml) || "Pozycja faktury"
    const qty = Number((tag("P_8B", rowXml) || "1").replace(",", ".")) || 1
    const unitNet = parsePolishMoneyToCents(tag("P_9A", rowXml)) ?? 0
    const rowNet = parsePolishMoneyToCents(tag("P_11", rowXml)) ?? Math.round(unitNet * qty)
    const vatRate = tag("P_12", rowXml) || "23"
    const vatRateNum = Number(vatRate)
    const rowGross = Number.isFinite(vatRateNum)
      ? Math.round(rowNet * (1 + vatRateNum / 100))
      : rowNet
    lineItems.push({
      name: itemName,
      quantity: qty,
      unitPriceNetCents: unitNet || rowNet,
      vatRate: `${vatRate}%`,
      netCents: rowNet,
      grossCents: rowGross,
    })
  }

  const ourCleanNip = ourNip ? cleanNip(ourNip) : ""
  const kind: "sales" | "purchase" =
    ourCleanNip && buyerNip === ourCleanNip && sellerNip !== ourCleanNip
      ? "purchase"
      : "sales"

  return {
    invoiceNumber,
    ksefReferenceNumber,
    issueDate,
    saleDate,
    dueDate,
    sellerName,
    sellerNip,
    buyerName,
    buyerNip,
    currency,
    netCents: netCents || Math.round(grossCents / 1.23),
    vatCents: vatCents || grossCents - (netCents || Math.round(grossCents / 1.23)),
    grossCents,
    paymentMethod: "transfer",
    bankAccount,
    kind,
    confidence: 100,
    rawText: xml.slice(0, 4000),
    lineItems,
  }
}

/**
 * Silnik OCR dla polskich faktur VAT (tekst wyciągnięty z PDF lub obrazu faktury).
 * Rozpoznaje: numer faktury, numer KSeF, NIP sprzedawcy i nabywcy, nazwy podmiotów,
 * datę wystawienia, sprzedaży i płatności, kwoty Netto / VAT / Brutto (Do zapłaty) oraz konto bankowe.
 */
export function parseInvoiceOcrText(
  rawText: string,
  fileName: string = "",
  ourNip?: string | null,
): ExtractedInvoiceFields {
  // Jeśli plik to XML KSeF wklejony jako tekst
  const xmlParsed = parseKsefXmlInvoice(rawText, ourNip)
  if (xmlParsed) {
    return xmlParsed
  }

  const text = rawText.replace(/\r/g, "\n")
  const lines = text
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)

  let matchedSignals = 0

  // 1. Numer KSeF (np. 1234567890-20261106-ABCDEF-123456-AB)
  const ksefMatch =
    /\b(\d{10}-\d{8}-[A-Z0-9]{6}-[A-Z0-9]{6}-[A-Z0-9]{2})\b/i.exec(text) ??
    /KSeF[\s#:]*([0-9A-Z-]{18,45})/i.exec(text)
  const ksefReferenceNumber = ksefMatch ? ksefMatch[1]!.toUpperCase() : ""
  if (ksefReferenceNumber) matchedSignals += 1

  // 2. Numer faktury
  let invoiceNumber = ""
  const invPatterns = [
    /Faktura\s+(?:VAT\s+)?(?:nr|numer|no\.?)?[\s:.-]*([A-Z0-9]+\/[A-Z0-9/-]+)/i,
    /(?:Faktura|FV|FS|FA|Rachunek)\s*(?:VAT)?\s*(?:nr|numer)?[\s:.-]+([A-Z0-9][A-Z0-9/_-]{2,32})/i,
    /\b((?:FV|FS|FA|Faktura|INV)[/-]\d{1,6}[/-]\d{2,4}(?:[/-]\d{2,4})?)\b/i,
    /\b(\d{1,5}\/\d{1,2}\/\d{4})\b/,
  ]
  for (const pat of invPatterns) {
    const m = pat.exec(text)
    if (m && m[1]) {
      const candidate = m[1].trim()
      if (!/^(VAT|NR|NUMER|ORYGINAŁ|ORYGINAL|KOPIA)$/i.test(candidate)) {
        invoiceNumber = candidate
        matchedSignals += 1
        break
      }
    }
  }
  if (!invoiceNumber && fileName) {
    const fromFile = fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[_]+/g, "/")
    invoiceNumber = fromFile.slice(0, 40)
  }
  if (!invoiceNumber) {
    invoiceNumber = `FV/${new Date().toISOString().slice(0, 10).replace(/-/g, "/")}`
  }

  // 3. Daty (wystawienia, sprzedaży, termin płatności)
  function findDateNear(keywords: RegExp): string | null {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      if (keywords.test(line)) {
        const chunk = `${line} ${lines[i + 1] ?? ""}`
        const dateTokens = chunk.match(
          /\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4}|\d{1,2}\s+[a-ząćęłńóśźż]+\s+\d{4})\b/gi,
        )
        if (dateTokens) {
          for (const tok of dateTokens) {
            const norm = normalizeDateToken(tok)
            if (norm) return norm
          }
        }
      }
    }
    return null
  }

  const allDates: string[] = []
  const genericDateMatches = text.match(
    /\b(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}[-./]\d{1,2}[-./]\d{4})\b/g,
  )
  for (const tok of genericDateMatches ?? []) {
    const norm = normalizeDateToken(tok)
    if (norm && !allDates.includes(norm)) {
      allDates.push(norm)
    }
  }

  const issueDate =
    findDateNear(/data\s+wystawienia|wystawiono\s+dnia|issue\s+date|data\s+dokumentu/i) ??
    allDates[0] ??
    new Date().toISOString().slice(0, 10)
  if (allDates.length > 0) matchedSignals += 1

  const saleDate =
    findDateNear(/data\s+sprzeda[żz]y|data\s+wykonania|data\s+dostawy|sale\s+date/i) ??
    issueDate

  const dueDate =
    findDateNear(/termin\s+p[łl]atno[śs]ci|data\s+p[łl]atno[śs]ci|p[łl]atne\s+do|due\s+date/i) ??
    (allDates.length > 1 ? allDates[allDates.length - 1]! : "")

  // 4. NIP-y i strony transakcji (Sprzedawca / Nabywca)
  const nipRegex = /(?:NIP|VAT(?:\s*UE)?|Tax\s*ID)[\s:.-]*((?:PL\s*)?(?:\d[\s-]?){10})/gi
  const foundNips: { nip: string; index: number; lineIndex: number }[] = []
  let nipMatch: RegExpExecArray | null
  while ((nipMatch = nipRegex.exec(text)) !== null) {
    const cleaned = cleanNip(nipMatch[1]!)
    if (cleaned && !foundNips.some((n) => n.nip === cleaned)) {
      const prefix = text.slice(0, nipMatch.index)
      const lineIndex = prefix.split("\n").length - 1
      foundNips.push({ nip: cleaned, index: nipMatch.index, lineIndex })
    }
  }

  function extractPartyBlock(headerRe: RegExp, stopRe: RegExp): { name: string; nip: string } {
    const idx = lines.findIndex((l) => headerRe.test(l))
    if (idx < 0) return { name: "", nip: "" }

    const blockLines: string[] = []
    const inlineAfterColon = lines[idx]!.replace(headerRe, "").replace(/^[\s:.-]+/, "").trim()
    if (inlineAfterColon && inlineAfterColon.length > 2 && !stopRe.test(inlineAfterColon)) {
      blockLines.push(inlineAfterColon)
    }

    for (let j = idx + 1; j < Math.min(lines.length, idx + 8); j += 1) {
      const l = lines[j]!
      if (stopRe.test(l)) break
      blockLines.push(l)
    }

    let partyNip = ""
    for (const bl of blockLines) {
      const m = /(?:NIP|VAT)?[\s:.-]*((?:PL\s*)?(?:\d[\s-]?){10})/i.exec(bl)
      if (m) {
        const c = cleanNip(m[1]!)
        if (c) {
          partyNip = c
          break
        }
      }
    }

    const nameCandidate =
      blockLines.find(
        (bl) =>
          bl.length >= 3 &&
          !/^(NIP|REGON|KRS|ul\.|ulica|\d{2}-\d{3}|tel|e-?mail|konto|bank)/i.test(bl) &&
          !cleanNip(bl),
      ) ?? ""

    return {
      name: nameCandidate.replace(/\s+NIP.*$/i, "").trim(),
      nip: partyNip,
    }
  }

  const sellerBlock = extractPartyBlock(
    /^(?:sprzedawca|wystawca|dostawca|seller|vendor)\b/i,
    /^(?:nabywca|kupuj[ąa]cy|odbiorca|płatnik|buyer|client|lp\.|pozycja|razem)/i,
  )
  const buyerBlock = extractPartyBlock(
    /^(?:nabywca|kupuj[ąa]cy|odbiorca|klient|buyer|customer)\b/i,
    /^(?:sprzedawca|odbiorca|pozycja|lp\.|nazwa\s+towaru|razem|do\s+zap[łl]aty|spos[óo]b\s+p[łl]atno[śs]ci)/i,
  )

  const sellerNip = sellerBlock.nip || foundNips[0]?.nip || ""
  const buyerNip =
    buyerBlock.nip ||
    foundNips.find((n) => n.nip !== sellerNip)?.nip ||
    ""

  if (sellerNip || buyerNip) matchedSignals += 1

  function guessCompanyNameNearLine(lineIdx: number): string {
    for (let k = Math.max(0, lineIdx - 3); k <= Math.min(lines.length - 1, lineIdx + 2); k += 1) {
      const candidate = lines[k]!
      if (
        /(sp\.\s*z\s*o\.o\.|s\.a\.|spółka|gabinet|klinika|centrum|med|stomatolog|poradnia|voicelink|firma|przedsiębiorstwo)/i.test(
          candidate,
        ) &&
        !/^(sprzedawca|nabywca|faktura)/i.test(candidate)
      ) {
        return candidate.replace(/\s*NIP.*$/i, "").trim()
      }
    }
    return ""
  }

  const sellerName =
    sellerBlock.name ||
    (foundNips[0] ? guessCompanyNameNearLine(foundNips[0].lineIndex) : "") ||
    "VoiceLink"

  const buyerName =
    buyerBlock.name ||
    (foundNips[1] ? guessCompanyNameNearLine(foundNips[1].lineIndex) : "") ||
    lines.find((l) => /(sp\.\s*z\s*o\.o\.|gabinet|klinika|centrum|med|poradnia)/i.test(l) && !l.toLowerCase().includes("voicelink")) ||
    ""

  if (buyerName) matchedSignals += 1

  // 5. Waluta
  const currencyMatch = /\b(PLN|EUR|USD|GBP)\b/i.exec(text)
  const currency = currencyMatch ? currencyMatch[1]!.toUpperCase() : "PLN"

  // 6. Kwoty: Do zapłaty / Brutto, Netto, VAT
  function findAmountByRegexes(patterns: RegExp[]): number | null {
    for (const pat of patterns) {
      const m = pat.exec(text)
      if (m && m[1]) {
        const cents = parsePolishMoneyToCents(m[1])
        if (cents != null && cents > 0) return cents
      }
    }
    return null
  }

  let grossCents =
    findAmountByRegexes([
      /(?:razem\s+do\s+zap[łl]aty|do\s+zap[łl]aty|kwota\s+brutto|warto[śs][ćc]\s+brutto|suma\s+brutto|total\s+due|gross\s+amount)[\s:.-]*([0-9][0-9\s\u00A0']*[,.]\d{2})/i,
      /(?:razem|og[óo][łl]em|suma)[\s:.-]*(?:PLN\s*)?([0-9][0-9\s\u00A0']*[,.]\d{2})\s*(?:PLN|zł|zl|EUR|USD)/i,
    ]) ?? 0

  let netCents =
    findAmountByRegexes([
      /(?:razem\s+netto|kwota\s+netto|warto[śs][ćc]\s+netto|suma\s+netto|net\s+amount)[\s:.-]*([0-9][0-9\s\u00A0']*[,.]\d{2})/i,
    ]) ?? 0

  let vatCents =
    findAmountByRegexes([
      /(?:kwota\s+vat|podatek\s+vat|warto[śs][ćc]\s+vat|suma\s+vat|vat\s+23%)[\s:.-]*([0-9][0-9\s\u00A0']*[,.]\d{2})/i,
    ]) ?? 0

  // Wiersz podsumowania tabeli: "Razem 1 000,00 230,00 1 230,00"
  if (!grossCents || !netCents) {
    const summaryTriple =
      /(?:razem|w\s+tym|og[óo][łl]em|podsumowanie)[^\n\d]*(\d[\d\s\u00A0']*[,.]\d{2})\s+(?:\d{1,2}%\s+|zw\.?\s+)?(\d[\d\s\u00A0']*[,.]\d{2})\s+(\d[\d\s\u00A0']*[,.]\d{2})/i.exec(
        text,
      )
    if (summaryTriple) {
      const c1 = parsePolishMoneyToCents(summaryTriple[1]!)
      const c2 = parsePolishMoneyToCents(summaryTriple[2]!)
      const c3 = parsePolishMoneyToCents(summaryTriple[3]!)
      if (c1 != null && c2 != null && c3 != null && Math.abs(c1 + c2 - c3) <= 5) {
        netCents = c1
        vatCents = c2
        grossCents = c3
      }
    }
  }

  // Fallback: największa kwota z końcówką PLN/zł w dokumencie
  if (!grossCents) {
    const allMoneyMatches = [
      ...text.matchAll(/(\d{1,3}(?:[\s\u00A0']\d{3})*[,.]\d{2})\s*(?:PLN|zł|zl|EUR|USD)/gi),
    ]
    const parsedAmounts = allMoneyMatches
      .map((m) => parsePolishMoneyToCents(m[1]!))
      .filter((n): n is number => n != null && n > 0)
    if (parsedAmounts.length > 0) {
      grossCents = Math.max(...parsedAmounts)
    }
  }

  if (grossCents > 0 && netCents === 0 && vatCents === 0) {
    netCents = Math.round(grossCents / 1.23)
    vatCents = grossCents - netCents
  } else if (netCents > 0 && grossCents === 0) {
    vatCents = vatCents || Math.round(netCents * 0.23)
    grossCents = netCents + vatCents
  } else if (grossCents > 0 && netCents > 0 && vatCents === 0) {
    vatCents = Math.max(0, grossCents - netCents)
  }

  if (grossCents > 0) matchedSignals += 1

  // 7. Numer konta bankowego (polski IBAN 26 cyfr)
  const ibanMatch = /\b(?:PL\s*)?(\d{2}(?:[\s-]?\d{4}){6})\b/.exec(text)
  const bankAccount = ibanMatch ? ibanMatch[1]!.replace(/\s+/g, " ").trim() : ""

  // 8. Metoda płatności
  const paymentMethod: "transfer" | "card" | "cash" | "other" = /got[óo]wk/i.test(text)
    ? "cash"
    : /kart[ąa]|card/i.test(text)
      ? "card"
      : "transfer"

  // 9. Kierunek faktury (sprzedaż vs kosztowa)
  const ourCleanNip = ourNip ? cleanNip(ourNip) : ""
  let kind: "sales" | "purchase" = "sales"
  if (ourCleanNip && buyerNip === ourCleanNip && sellerNip !== ourCleanNip) {
    kind = "purchase"
  } else if (
    /voicelink/i.test(buyerName) &&
    !/voicelink/i.test(sellerName)
  ) {
    kind = "purchase"
  }

  const confidence = Math.min(100, Math.max(25, Math.round((matchedSignals / 5) * 100)))

  return {
    invoiceNumber,
    ksefReferenceNumber,
    issueDate,
    saleDate,
    dueDate,
    sellerName,
    sellerNip,
    buyerName,
    buyerNip,
    currency,
    netCents,
    vatCents,
    grossCents,
    paymentMethod,
    bankAccount,
    kind,
    confidence,
    rawText: text.slice(0, 6000),
    lineItems: [],
  }
}
