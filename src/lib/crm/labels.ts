export const dealStages = [
  ["new", "Nowy"],
  ["contact_attempt", "Próba kontaktu"],
  ["conversation_done", "Rozmowa odbyta"],
  ["meeting_scheduled", "Spotkanie umówione"],
  ["meeting_done", "Spotkanie odbyte"],
  ["offer_sent", "Oferta wysłana"],
  ["negotiation", "Negocjacje"],
  ["won", "Wygrany"],
  ["lost", "Przegrany"],
] as const

export const openDealStages = dealStages.filter(
  ([code]) => code !== "won" && code !== "lost",
)

export const productTypes = [
  ["voice_assistant", "Asystent głosowy"],
  ["website", "Strona"],
  ["digital_infrastructure", "Infrastruktura cyfrowa"],
] as const

export const accountKinds = [
  ["unknown", "Nieustalone"],
  ["person", "Osoba"],
  ["company", "Firma"],
] as const

const stageLabels = Object.fromEntries(dealStages)
const productLabels = Object.fromEntries(productTypes)
const kindLabels = Object.fromEntries(accountKinds)

export function stageLabel(code: string | null | undefined) {
  if (!code) {
    return "Nie uzupełniono"
  }

  return stageLabels[code] ?? code
}

export function productLabel(code: string | null | undefined) {
  if (!code) {
    return "Nie uzupełniono"
  }

  return productLabels[code] ?? code
}

export const implementationStages = [
  ["todo", "Do rozpoczęcia"],
  ["in_progress", "W trakcie realizacji"],
  ["waiting_for_client", "Oczekuje na klienta"],
  ["testing", "Testy"],
  ["launched", "Uruchomione"],
  ["completed", "Zakończone"],
  ["paused", "Wstrzymane"],
] as const

const implementationLabels = Object.fromEntries(implementationStages)

export function implementationStageLabel(code: string | null | undefined) {
  if (!code) {
    return "W trakcie realizacji"
  }

  return implementationLabels[code] ?? code
}

export function kindLabel(code: string | null | undefined) {
  if (!code) {
    return "Nie uzupełniono"
  }

  return kindLabels[code] ?? code
}

export function missing(value: string | null | undefined) {
  const text = value?.trim()
  return text ? text : "Nie uzupełniono"
}
