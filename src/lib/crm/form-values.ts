export type FieldSnapshot = Array<[string, string]>

export function snapshotFields(data: FormData): FieldSnapshot {
  const entries: FieldSnapshot = []
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") {
      entries.push([key, value])
    }
  }
  return entries
}

export function applyFieldSnapshot(form: HTMLFormElement, entries: FieldSnapshot) {
  const grouped = new Map<string, string[]>()
  for (const [key, value] of entries) {
    const current = grouped.get(key) ?? []
    current.push(value)
    grouped.set(key, current)
  }

  for (const [key, values] of grouped) {
    const element = form.elements.namedItem(key)
    if (!element) {
      continue
    }

    if (element instanceof RadioNodeList) {
      for (const node of element) {
        if (
          node instanceof HTMLInputElement &&
          (node.type === "checkbox" || node.type === "radio")
        ) {
          node.checked = values.includes(node.value)
        }
      }
      continue
    }

    if (element instanceof HTMLInputElement) {
      if (element.type === "file") {
        continue
      }
      if (element.type === "checkbox" || element.type === "radio") {
        element.checked = values.includes(element.value)
      } else {
        element.value = values.at(-1) ?? ""
      }
      continue
    }

    if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      element.value = values.at(-1) ?? ""
    }
  }
}
