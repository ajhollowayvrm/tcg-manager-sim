// A number input you can actually clear. Two things fight the player here, and
// <input type="number"> causes both. A controlled one snaps straight back to the
// stored value the moment the field goes empty, so the leading 0 of a fresh
// rarity is impossible to delete — you must select it and overwrite. It also
// sanitises half-typed text: press "0" then "." and the field still reads "0",
// which makes a pull weight of 0.05 a fight.
//
// So this is a text field with a decimal keypad (inputMode carries the iOS
// keyboard, which type=number was the only other way to get). It keeps the raw
// text in local state while the player edits, and writes back only a real
// number. An empty or half-typed field commits nothing: the stored value stands
// until valid text arrives, and reappears on blur if none ever does.

import { useState } from 'react'

const NUMERIC = /^\d*\.?\d*$/ // digits with at most one point; "" and "0." allowed mid-typing

export default function NumberField({ value, onCommit, min = 0, max = Infinity, ...rest }) {
  const [draft, setDraft] = useState(null) // raw text while editing, null when idle

  const change = (raw) => {
    if (!NUMERIC.test(raw)) return // reject the keystroke outright; the field never shows junk
    setDraft(raw)
    const n = Number(raw)
    if (raw !== '' && Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)))
  }

  return (
    <input
      {...rest}
      type="text"
      inputMode="decimal"
      value={draft ?? String(value)}
      onChange={(e) => change(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => setDraft(null)} // drop the draft; the stored value shows again
    />
  )
}
