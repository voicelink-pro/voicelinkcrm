import { describe, expect, it } from "vitest"

import {
  cleanNip,
  parseInvoiceOcrText,
  parseKsefXmlInvoice,
} from "@/lib/crm/invoice-ocr"

describe("silnik OCR faktur PDF i parser KSeF XML", () => {
  it("rozpoznaje polską fakturę VAT z tekstu PDF (numer, NIP, daty, kwoty Netto/VAT/Brutto i IBAN)", () => {
    const samplePdfText = `
      FAKTURA VAT nr FV/11/2026
      Numer KSeF: 5250001020-20261106-A1B2C3-900101-FA
      Data wystawienia: 06.11.2026
      Data sprzedaży: 06.11.2026
      Termin płatności: 20.11.2026

      Sprzedawca:
      VoiceLink Sp. z o.o.
      NIP: 525-000-10-20

      Nabywca:
      Optima Medycyna Sp. z o.o.
      NIP: PL 5252811122

      Pozycja: Wdrożenie asystenta głosowego AI
      Wartość netto: 3 500,00 PLN
      Kwota VAT: 805,00 PLN
      Razem do zapłaty: 4 305,00 PLN
      Nr konta: 61 1090 1014 0000 0712 1981 2874
    `

    const parsed = parseInvoiceOcrText(samplePdfText, "FV_11_2026.pdf", "5250001020")

    expect(parsed.invoiceNumber).toBe("FV/11/2026")
    expect(parsed.ksefReferenceNumber).toBe("5250001020-20261106-A1B2C3-900101-FA")
    expect(parsed.issueDate).toBe("2026-11-06")
    expect(parsed.dueDate).toBe("2026-11-20")
    expect(parsed.sellerNip).toBe("5250001020")
    expect(parsed.buyerNip).toBe("5252811122")
    expect(parsed.buyerName).toContain("Optima Medycyna")
    expect(parsed.netCents).toBe(350000)
    expect(parsed.vatCents).toBe(80500)
    expect(parsed.grossCents).toBe(430500)
    expect(parsed.kind).toBe("sales")
    expect(parsed.confidence).toBeGreaterThanOrEqual(80)
  })

  it("parsuje fakturę ustrukturyzowaną KSeF FA(2) XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><NumerKSeF>5250001020-20261106-ABC123-000001-FA</NumerKSeF></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5250001020</NIP><Nazwa>VoiceLink</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>6762598831</NIP><Nazwa>AS-Med Centrum Medyczne</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <KodWaluty>PLN</KodWaluty>
    <P_1>2026-11-06</P_1>
    <P_2>FV/KSEF/09/11/2026</P_2>
    <P_13_1>2400.00</P_13_1>
    <P_14_1>552.00</P_14_1>
    <P_15>2952.00</P_15>
  </Fa>
</Faktura>`

    const res = parseKsefXmlInvoice(xml, "5250001020")
    expect(res).not.toBeNull()
    expect(res?.invoiceNumber).toBe("FV/KSEF/09/11/2026")
    expect(res?.buyerName).toBe("AS-Med Centrum Medyczne")
    expect(res?.buyerNip).toBe(cleanNip("676-259-88-31"))
    expect(res?.netCents).toBe(240000)
    expect(res?.vatCents).toBe(55200)
    expect(res?.grossCents).toBe(295200)
  })
})
