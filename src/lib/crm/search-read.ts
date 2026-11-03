import "server-only"

import { searchPageSize, type SearchQuery } from "@/lib/crm/search-query"
import { createClient } from "@/lib/supabase/server"

export type SearchHit = { id: string; label: string; href: string }
export type SearchGroup = { rows: SearchHit[]; count: number; error: string | null }

const readError = "Nie udało się przeszukać tej grupy."

function pattern(phrase: string) {
  return `%${phrase}%`
}

function quoted(value: string) {
  return `"${value.replaceAll('"', "")}"`
}

async function group(
  run: PromiseLike<{ data: SearchHit[] | null; count: number | null; error: { message: string } | null }>,
): Promise<SearchGroup> {
  const result = await run
  if (result.error) {
    return { rows: [], count: 0, error: readError }
  }
  return { rows: result.data ?? [], count: result.count ?? 0, error: null }
}

export async function searchCrm(query: SearchQuery) {
  const empty: SearchGroup = { rows: [], count: 0, error: null }
  if (!query.q) {
    return {
      accounts: empty,
      contacts: empty,
      deals: empty,
      tasks: empty,
      documents: empty,
    }
  }

  const supabase = await createClient()
  const like = quoted(pattern(query.q))
  const range = (page: number) => {
    const from = (page - 1) * searchPageSize
    return { from, to: from + searchPageSize - 1 }
  }

  const accountsRange = range(query.accountsPage)
  const contactsRange = range(query.contactsPage)
  const dealsRange = range(query.dealsPage)
  const tasksRange = range(query.tasksPage)
  const documentsRange = range(query.documentsPage)

  const [accounts, contacts, deals, tasks, documents] = await Promise.all([
    group(
      supabase
        .from("accounts")
        .select("id, display_name", { count: "exact" })
        .is("archived_at", null)
        .or([`display_name.ilike.${like}`, `company_name.ilike.${like}`].join(","))
        .order("display_name")
        .range(accountsRange.from, accountsRange.to)
        .then((result) => ({
          data: (result.data ?? []).map((row) => ({
            id: row.id,
            label: row.display_name,
            href: `/accounts/${row.id}`,
          })),
          count: result.count,
          error: result.error,
        })),
    ),
    group(
      supabase
        .from("contacts")
        .select("id, full_name, email, account_id", { count: "exact" })
        .is("archived_at", null)
        .or([`full_name.ilike.${like}`, `email.ilike.${like}`, `phone_e164.ilike.${like}`].join(","))
        .order("full_name")
        .range(contactsRange.from, contactsRange.to)
        .then((result) => ({
          data: (result.data ?? []).map((row) => ({
            id: row.id,
            label: row.email ? `${row.full_name} · ${row.email}` : row.full_name,
            href: `/accounts/${row.account_id}`,
          })),
          count: result.count,
          error: result.error,
        })),
    ),
    group(
      supabase
        .from("deals")
        .select("id, title", { count: "exact" })
        .is("archived_at", null)
        .ilike("title", pattern(query.q))
        .order("title")
        .range(dealsRange.from, dealsRange.to)
        .then((result) => ({
          data: (result.data ?? []).map((row) => ({
            id: row.id,
            label: row.title,
            href: `/leads/${row.id}`,
          })),
          count: result.count,
          error: result.error,
        })),
    ),
    group(
      supabase
        .from("tasks")
        .select("id, title", { count: "exact" })
        .is("archived_at", null)
        .ilike("title", pattern(query.q))
        .order("title")
        .range(tasksRange.from, tasksRange.to)
        .then((result) => ({
          data: (result.data ?? []).map((row) => ({
            id: row.id,
            label: row.title,
            href: `/tasks/${row.id}`,
          })),
          count: result.count,
          error: result.error,
        })),
    ),
    group(
      supabase
        .from("documents")
        .select("id, original_name", { count: "exact" })
        .is("deleted_at", null)
        .eq("status", "ready")
        .ilike("original_name", pattern(query.q))
        .order("original_name")
        .range(documentsRange.from, documentsRange.to)
        .then((result) => ({
          data: (result.data ?? []).map((row) => ({
            id: row.id,
            label: row.original_name,
            href: `/documents/${row.id}`,
          })),
          count: result.count,
          error: result.error,
        })),
    ),
  ])

  return { accounts, contacts, deals, tasks, documents }
}
