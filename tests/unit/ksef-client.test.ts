import { generateKeyPairSync, constants, privateDecrypt } from "node:crypto"
import { describe, expect, it } from "vitest"

import { encryptKsefTokenWithKey, mapKsefMetadataInvoice } from "@/lib/crm/ksef-client"

describe("ksef token encryption", () => {
  it("szyfruje token i znacznik czasu algorytmem RSA-OAEP SHA-256", () => {
    const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })
    const encrypted = encryptKsefTokenWithKey(publicKey, "token-testowy", 1_794_139_715_467)
    const plain = privateDecrypt(
      {
        key: privateKey,
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(encrypted, "base64"),
    )

    expect(plain.toString("utf8")).toBe("token-testowy|1794139715467")
  })
})

describe("mapowanie metadanych faktury KSeF", () => {
  it("przepisuje sprzedaż i zakup na pola CRM", () => {
    const sales = mapKsefMetadataInvoice(
      {
        ksefNumber: "5250001020-20261101-010080615740-E4",
        invoiceNumber: "FV/11/2026",
        issueDate: "2026-11-01",
        seller: { nip: "5250001020", name: "VoiceLink" },
        buyer: { identifier: { type: "Nip", value: "7352765225" }, name: "Optima Medycyna" },
        netAmount: 100,
        vatAmount: 23,
        grossAmount: 123,
        currency: "PLN",
      },
      { nip: "5250001020", companyName: "VoiceLink", kind: "sales" },
    )

    expect(sales).toMatchObject({
      invoiceNumber: "FV/11/2026",
      ksefReferenceNumber: "5250001020-20261101-010080615740-E4",
      issueDate: "2026-11-01",
      sellerNip: "5250001020",
      buyerNip: "7352765225",
      buyerName: "Optima Medycyna",
      netCents: 10000,
      vatCents: 2300,
      grossCents: 12300,
      kind: "sales",
    })
  })
})
