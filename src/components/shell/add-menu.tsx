"use client"

import { PlusIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const futureActions = ["Zadanie", "Wdrożenie", "Dokument"]

export function AddMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button />}>
        <PlusIcon data-icon="inline-start" />
        <span className="sr-only sm:not-sr-only">Dodaj</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem nativeButton={false} render={<Link href="/leads?create=1" />}>
            Lead
          </DropdownMenuItem>
          <DropdownMenuLabel>Dostępne po wdrożeniu modułów</DropdownMenuLabel>
          {futureActions.map((action) => (
            <DropdownMenuItem key={action} disabled>
              {action}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
