// UI preferences: the active tab, the active sub-tab per tab, and which
// collapsible sections are open. Stored in localStorage under their own key so
// they survive a reload but never touch the run save (persistence.js) or the
// career keys. The sim never imports this file.
//
// Every storage access is guarded: a private window, a disabled store, or a
// full quota must degrade to "no memory", never to a crash on boot.

import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react'

const KEY = 'tcg-manager-sim/ui'
const VERSION = 1

const EMPTY = { tab: null, subtab: {}, sections: {} }

export function loadUiPrefs() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return { ...EMPTY }
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw)
    if (!parsed || parsed.version !== VERSION || !parsed.data) return { ...EMPTY }
    return {
      tab: typeof parsed.data.tab === 'string' ? parsed.data.tab : null,
      subtab: parsed.data.subtab && typeof parsed.data.subtab === 'object' ? parsed.data.subtab : {},
      sections: parsed.data.sections && typeof parsed.data.sections === 'object' ? parsed.data.sections : {},
    }
  } catch {
    return { ...EMPTY }
  }
}

export function saveUiPrefs(data) {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, data }))
  } catch {
    /* quota or storage disabled — nothing actionable */
  }
}

// The hook App owns. Returns the prefs and three setters that each write
// through to storage immediately (the prefs are tiny).
export function useUiPrefs() {
  const [prefs, setPrefs] = useState(loadUiPrefs)
  const update = useCallback((fn) => {
    setPrefs((cur) => {
      const next = fn(cur)
      saveUiPrefs(next)
      return next
    })
  }, [])
  const setTab = useCallback((tab) => update((p) => ({ ...p, tab })), [update])
  const setSubtab = useCallback((tab, subtab) => update((p) => ({ ...p, subtab: { ...p.subtab, [tab]: subtab } })), [update])
  const setSectionOpen = useCallback((id, open) => update((p) => ({ ...p, sections: { ...p.sections, [id]: !!open } })), [update])
  return { prefs, setTab, setSubtab, setSectionOpen }
}

// Sections read their open state through context, so a deeply nested panel
// never has to thread the prefs down by hand. Without a provider (a stray
// render outside App) a section falls back to local state.
export const SectionPrefsContext = createContext(null)

export function SectionPrefsProvider({ sections, setSectionOpen, children }) {
  const value = useMemo(() => ({ sections, setSectionOpen }), [sections, setSectionOpen])
  return createElement(SectionPrefsContext.Provider, { value }, children)
}

export function useSectionPrefs() {
  return useContext(SectionPrefsContext)
}
