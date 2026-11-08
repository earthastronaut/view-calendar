// Local stand-in for shadcn's Input, used only to typecheck this repo.
import * as React from "react"
import { cn } from "@/lib/utils"

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn("h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm", className)} {...props} />
}
