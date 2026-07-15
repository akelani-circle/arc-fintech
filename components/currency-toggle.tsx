/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 */

"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import type { Currency } from "@/lib/constants/currency"

type Props = {
  value: Currency
  onChange: (currency: Currency) => void
  disabled?: boolean
}

export function CurrencyToggle({ value, onChange, disabled }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as Currency)
      }}
      disabled={disabled}
      className="grid grid-cols-2 gap-2"
    >
      <ToggleGroupItem
        value="USDC"
        className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        USDC
      </ToggleGroupItem>
      <ToggleGroupItem
        value="EURC"
        className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
      >
        EURC
      </ToggleGroupItem>
    </ToggleGroup>
  )
}
