"use client"

import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface MultiSelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  selected: (string | number)[];
  onChange: (selected: (string | number)[]) => void;
  placeholder?: string;
  defaultLabel?: string;
  maxHeight?: string;
  className?: string;
  disabled?: boolean;
  label?: string;
  searchable?: boolean;
}

/**
 * MultiSelect component using DropdownMenu primitives
 *
 * Features:
 * - Multi-selection with checkboxes
 * - Label summarization: "All" or "A, B +2"
 * - Scrollable list for many options
 * - Keyboard accessible
 * - Integrates with react-hook-form Controller
 *
 * @example
 * <Controller
 *   control={form.control}
 *   name="chapters"
 *   render={({ field }) => (
 *     <MultiSelect
 *       options={chapterOptions}
 *       selected={field.value || []}
 *       onChange={field.onChange}
 *       placeholder="Select chapters"
 *       defaultLabel="All Chapters"
 *     />
 *   )}
 * />
 */
export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select items",
  defaultLabel = "All",
  maxHeight = "280px",
  className,
  disabled = false,
  label,
  searchable = false,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState("")

  // Filter options based on search query
  const filteredOptions = React.useMemo(() => {
    if (!searchable || !searchQuery) return options
    return options.filter((option) =>
      option.label.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [options, searchQuery, searchable])

  // Generate summary label
  const summaryLabel = React.useMemo(() => {
    if (selected.length === 0) {
      return placeholder
    }

    if (selected.length === options.length) {
      return defaultLabel
    }

    // Show first 2 items + count of remaining
    const selectedOptions = options.filter((opt) => selected.includes(opt.value))
    if (selectedOptions.length <= 2) {
      return selectedOptions.map((opt) => opt.label).join(", ")
    }

    const first = selectedOptions[0].label
    const second = selectedOptions[1].label
    const remaining = selectedOptions.length - 2

    return `${first}, ${second} +${remaining}`
  }, [selected, options, placeholder, defaultLabel])

  const handleToggle = (value: string | number) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    onChange(newSelected)
  }

  const handleSelectAll = () => {
    if (selected.length === options.length) {
      onChange([])
    } else {
      onChange(options.map((opt) => opt.value))
    }
  }

  const isAllSelected = selected.length === options.length && options.length > 0

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <label className="text-sm font-medium mb-2 block">
          {label}
        </label>
      )}
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              selected.length === 0 && "text-muted-foreground"
            )}
          >
            <span className="truncate">{summaryLabel}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-[--radix-dropdown-menu-trigger-width] p-0"
          align="start"
        >
          {/* Search input (if searchable) */}
          {searchable && (
            <div className="p-2 border-b">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-2 py-1.5 text-sm border rounded-md outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {/* Select All option */}
          {options.length > 1 && !searchQuery && (
            <>
              <DropdownMenuCheckboxItem
                checked={isAllSelected}
                onCheckedChange={handleSelectAll}
                onSelect={(e) => e.preventDefault()}
                className="font-medium"
              >
                {defaultLabel}
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Scrollable options list */}
          <ScrollArea style={{ maxHeight }}>
            <div className="p-1">
              {filteredOptions.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  No results found
                </div>
              ) : (
                filteredOptions.map((option) => (
                  <DropdownMenuCheckboxItem
                    key={option.value}
                    checked={selected.includes(option.value)}
                    onCheckedChange={() => handleToggle(option.value)}
                    onSelect={(e) => e.preventDefault()}
                    disabled={option.disabled}
                  >
                    {option.label}
                  </DropdownMenuCheckboxItem>
                ))
              )}
            </div>
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
