// Local stand-in for shadcn's Calendar (react-day-picker), used only to typecheck and render this repo.
import type { ComponentProps } from "react"
import { DayPicker } from "react-day-picker"
import { cn } from "@/lib/utils"

export function Calendar({ className, classNames, ...props }: ComponentProps<typeof DayPicker>) {
  return (
    <DayPicker
      showOutsideDays
      className={cn("p-3", className)}
      classNames={{
        months: "flex flex-col gap-4",
        month: "flex flex-col gap-4",
        month_caption: "flex h-8 items-center justify-center text-sm font-medium",
        nav: "absolute inset-x-3 top-3 flex justify-between",
        button_previous: "inline-flex size-8 items-center justify-center rounded-md hover:bg-accent",
        button_next: "inline-flex size-8 items-center justify-center rounded-md hover:bg-accent",
        month_grid: "w-full border-collapse",
        weekday: "w-9 text-[0.8rem] font-normal text-foreground/60",
        week: "mt-1 flex w-full",
        day: "relative size-9 p-0 text-center text-sm",
        day_button: "size-9 rounded-md font-normal hover:bg-accent",
        selected: "bg-primary text-primary-foreground rounded-md",
        range_start: "bg-primary text-primary-foreground rounded-l-md",
        range_end: "bg-primary text-primary-foreground rounded-r-md",
        range_middle: "bg-accent rounded-none",
        today: "font-semibold",
        outside: "text-foreground/40",
        disabled: "opacity-50",
        ...classNames,
      }}
      {...props}
    />
  )
}
