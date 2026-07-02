/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * SPDX-License-Identifier: Apache-2.0
 */

"use client"

import * as React from "react"

/**
 * Lets a page override the site-header with content only it knows - e.g. the
 * vault detail page feeding the loaded vault's name, protocol, and address up
 * into the header bar. The header sits above the page in the layout tree, so a
 * small context is the way to push values upward.
 *
 * Only plain strings cross the boundary (no JSX/closures), so the header owns
 * all rendering and the effect that sets the content can depend on stable
 * primitives. Split into a stable setter context and a value context so
 * components that only set content never re-render when it changes.
 */
export interface HeaderContent {
  /** Title text shown in place of the static nav title. */
  title: string
  /** Optional protocol/curator tag rendered beside the title (e.g. "MORPHO"). */
  protocol?: string
  /** Optional on-chain address rendered right-aligned with an explorer link. */
  address?: string
}

const SetHeaderContentContext = React.createContext<
  (content: HeaderContent | null) => void
>(() => {})
const HeaderContentValueContext = React.createContext<HeaderContent | null>(null)

export function HeaderTitleProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [content, setContent] = React.useState<HeaderContent | null>(null)
  return (
    <SetHeaderContentContext.Provider value={setContent}>
      <HeaderContentValueContext.Provider value={content}>
        {children}
      </HeaderContentValueContext.Provider>
    </SetHeaderContentContext.Provider>
  )
}

/** Read the current header content override (null when no page has set one). */
export function useHeaderContentValue(): HeaderContent | null {
  return React.useContext(HeaderContentValueContext)
}

/** Set the header content while this component is mounted; clears on unmount. */
export function useHeaderContent(content: HeaderContent | null) {
  const setContent = React.useContext(SetHeaderContentContext)
  const title = content?.title
  const protocol = content?.protocol
  const address = content?.address
  React.useEffect(() => {
    setContent(title ? { title, protocol, address } : null)
    return () => setContent(null)
  }, [setContent, title, protocol, address])
}
