/** The two fields that open a studio, and the loan that opening it forces. */
import { useState } from 'react';
import { C, num, label, micro, Screen, Scroll, Button, Field, Row } from '../ui.tsx';
import { newGame } from '../store.ts';

// --- onboarding ------------------------------------------------------------

export function Onboarding() {
  const [studio, setStudio] = useState('');
  const [game, setGame] = useState('');
  return (
    <Screen>
      <Scroll>
        <div style={{ padding: '30px 26px 0 26px' }}>
          <div style={{ ...micro, color: C.go, letterSpacing: '0.16em' }}>FOUNDED 2026</div>
          <div style={{ fontSize: 38, lineHeight: 1.05, marginTop: 10, fontWeight: 700, textWrap: 'pretty' }}>
            Every studio<br />starts with<br />a name.
          </div>
        </div>
        <div style={{ height: 1, background: C.rule, margin: '24px 26px 0' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '22px 26px 0' }}>
          <Field label="The studio" value={studio} onChange={setStudio} placeholder="Halcyon Press" />
          <Field label="The game it makes" value={game} onChange={setGame} placeholder="Emberline" />
        </div>

        <div style={{ margin: '22px 26px 0', border: `1px solid ${C.rule}`, background: C.panel }}>
          <div style={{ ...label, padding: '8px 13px', background: C.raised, borderBottom: `1px solid ${C.rule}` }}>OPENING POSITION</div>
          <Row left="Cash on hand" right="100,000" strong />
          <div style={{ height: 1, background: C.ruleSoft, margin: '0 12px' }} />
          <Row left="A first run of 8,000 boxes" right="147,840" />
          <div style={{ height: 1, background: C.ink, margin: '0 12px' }} />
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '8px 12px' }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: C.bad }}>Short by</span>
            <span style={{ ...num, fontSize: 17, fontWeight: 600, color: C.bad }}>47,840</span>
          </div>
          <div style={{ padding: '10px 13px', background: C.raised, borderTop: `1px solid ${C.rule}`, fontSize: 12, lineHeight: 1.42, color: C.ink2 }}>
            You cannot print your first set without borrowing. <strong>One studio in four never gets out from under it.</strong>
          </div>
        </div>

        <div style={{ padding: '20px 26px 34px' }}>
          <Button onClick={() => newGame(studio.trim() || 'Halcyon Press', game.trim() || 'Emberline')}>
            Open the doors
          </Button>
          <div style={{ textAlign: 'center', fontSize: 11, color: C.dim, marginTop: 11 }}>
            You will design your first characters inside.
          </div>
        </div>
      </Scroll>
    </Screen>
  );
}