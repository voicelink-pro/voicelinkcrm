import { NextResponse, type NextRequest } from "next/server"

import { getDocumentObject } from "@/lib/crm/document-read"
import { createDownloadUrl } from "@/lib/crm/document-storage"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params
  const document = await getDocumentObject(documentId)

  if (!document || document.status !== "ready") {
    return new NextResponse("Plik nie jest gotowy.", {
      status: 404,
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const download = request.nextUrl.searchParams.get("pobierz") === "1"
  const signedUrl = await createDownloadUrl(
    document.storage_path,
    download ? document.original_name : undefined,
  )

  if (!signedUrl) {
    return new NextResponse("Nie udało się otworzyć pliku.", {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    })
  }

  const response = NextResponse.redirect(signedUrl)
  response.headers.set("Cache-Control", "private, no-store")
  return response
}
