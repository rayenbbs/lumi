// src/renderer/components/LumiCharacter.tsx
// Chunky purple pixel-art owl — matches reference sprite
// Glowing cyan eyes, gold beak, white outline, feathered wings
// Zero external dependencies

import React from 'react'

export type LumiState =
  | 'sleeping'
  | 'watching'
  | 'intervening'
  | 'chatting'
  | 'break'

interface Props {
  state?: LumiState
  isThinking?: boolean
  onClick?: () => void
  size?: number
}

type AnimState = 'idle' | 'sleeping' | 'waving' | 'talking' | 'alert' | 'thinking'

function toAnim(state: LumiState, isThinking: boolean): AnimState {
  if (isThinking) return 'thinking'
  switch (state) {
    case 'sleeping':    return 'sleeping'
    case 'watching':    return 'idle'
    case 'intervening': return 'alert'
    case 'chatting':    return 'talking'
    case 'break':       return 'waving'
    default:            return 'idle'
  }
}

const CSS = `
@keyframes lumi-float      { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-8px)} }
@keyframes lumi-float-slow { 0%,100%{transform:translateY(0)}   50%{transform:translateY(-4px)} }
@keyframes lumi-alert-pop  { 0%,100%{transform:scale(1)}        40%{transform:scale(1.07)} 70%{transform:scale(.95)} }
@keyframes lumi-blink      { 0%,88%,100%{transform:scaleY(1)}   94%{transform:scaleY(.06)} }
@keyframes lumi-blink-fast { 0%,78%,100%{transform:scaleY(1)}   88%{transform:scaleY(.06)} }
@keyframes lumi-wave-wing  { 0%,100%{transform:rotate(-5deg)}   50%{transform:rotate(28deg)} }
@keyframes lumi-mouth-talk { 0%,100%{transform:scaleY(1)}       50%{transform:scaleY(.15)} }
@keyframes lumi-spin       { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
@keyframes lumi-ear-bob    { 0%,100%{transform:rotate(-3deg)}   50%{transform:rotate(3deg)} }
@keyframes lumi-zzz        { 0%{opacity:0;transform:translate(0,0) scale(.4)} 30%{opacity:1} 100%{opacity:0;transform:translate(14px,-18px) scale(1)} }
@keyframes lumi-glow-ring  { 0%,100%{opacity:.35} 50%{opacity:.85} }
@keyframes lumi-eye-glow   { 0%,100%{opacity:.25} 50%{opacity:.55} }
@keyframes lumi-think-pulse{ 0%,100%{opacity:.4}  50%{opacity:1} }
`

export default function LumiCharacter({
  state = 'sleeping',
  isThinking = false,
  onClick,
  size = 140,
}: Props) {
  const h = Math.round(size * (90 / 80))
  const anim = toAnim(state, isThinking)

  // ── body ──────────────────────────────────────────────────────────────────
  const bodyAnim: React.CSSProperties =
    anim === 'idle'     ? { animation: 'lumi-float 3s ease-in-out infinite' } :
    anim === 'sleeping' ? { animation: 'lumi-float-slow 5s ease-in-out infinite' } :
    anim === 'waving'   ? { animation: 'lumi-float 2.2s ease-in-out infinite' } :
    anim === 'talking'  ? { animation: 'lumi-float 2s ease-in-out infinite' } :
    anim === 'alert'    ? { animation: 'lumi-alert-pop .55s ease-in-out infinite' } :
    anim === 'thinking' ? { animation: 'lumi-float-slow 3.5s ease-in-out infinite' } : {}

  // ── eyes ──────────────────────────────────────────────────────────────────
  const eyeL: React.CSSProperties =
    anim === 'sleeping' ? { transformOrigin: 'center', transform: 'scaleY(.06)' } :
    anim === 'alert'    ? { transformOrigin: 'center', transform: 'scaleY(1.3)' } :
    anim === 'thinking' ? { transformOrigin: '26px 26px', transform: 'rotate(-10deg) scaleY(.8)' } :
    anim === 'talking'  ? { transformOrigin: '26px 26px', animation: 'lumi-blink-fast 2.2s ease-in-out infinite' } :
                          { transformOrigin: '26px 26px', animation: 'lumi-blink 4.5s ease-in-out infinite' }

  const eyeR: React.CSSProperties =
    anim === 'sleeping' ? { transformOrigin: 'center', transform: 'scaleY(.06)' } :
    anim === 'alert'    ? { transformOrigin: 'center', transform: 'scaleY(1.3)' } :
    anim === 'thinking' ? { transformOrigin: '54px 26px', transform: 'rotate(10deg) scaleY(.8)' } :
    anim === 'talking'  ? { transformOrigin: '54px 26px', animation: 'lumi-blink-fast 2.2s ease-in-out infinite .2s' } :
                          { transformOrigin: '54px 26px', animation: 'lumi-blink 4.5s ease-in-out infinite .3s' }

  // ── brows ─────────────────────────────────────────────────────────────────
  const browL: React.CSSProperties =
    anim === 'sleeping' ? { transform: 'translateY(4px)' } :
    anim === 'alert'    ? { transform: 'translateY(-5px)' } :
    anim === 'thinking' ? { transform: 'rotate(-12deg) translateY(-3px)', transformOrigin: '26px 15px' } : {}

  const browR: React.CSSProperties =
    anim === 'sleeping' ? { transform: 'translateY(4px)' } :
    anim === 'alert'    ? { transform: 'translateY(-5px)' } :
    anim === 'thinking' ? { transform: 'rotate(12deg) translateY(-3px)', transformOrigin: '54px 15px' } : {}

  // ── mouth ─────────────────────────────────────────────────────────────────
  const mouth: React.CSSProperties = {
    transformOrigin: '40px 43px',
    ...(anim === 'talking'  ? { animation: 'lumi-mouth-talk .3s ease-in-out infinite' } : {}),
    ...(anim === 'sleeping' ? { transform: 'scaleY(.2) translateY(6px)' } : {}),
    ...(anim === 'alert'    ? { transform: 'scaleY(1.6)' } : {}),
  }

  // ── wing / ear ────────────────────────────────────────────────────────────
  const wingR: React.CSSProperties = anim === 'waving'
    ? { transformOrigin: '62px 37px', animation: 'lumi-wave-wing .65s ease-in-out infinite' } : {}

  const earAnim: React.CSSProperties =
    anim === 'idle' || anim === 'sleeping'
      ? { animation: `lumi-ear-bob ${anim === 'sleeping' ? '5' : '4'}s ease-in-out infinite` } : {}

  // ── glow ring ─────────────────────────────────────────────────────────────
  const glowRing: React.CSSProperties = anim === 'alert'
    ? { animation: 'lumi-glow-ring .55s ease-in-out infinite' }
    : { display: 'none' }

  // ── spinner ───────────────────────────────────────────────────────────────
  const spinner: React.CSSProperties = anim === 'thinking'
    ? { animation: 'lumi-spin 1.3s linear infinite', transformOrigin: '70px 14px' }
    : { display: 'none' }

  // ── belly pulse when thinking ─────────────────────────────────────────────
  const bellyPulse: React.CSSProperties = isThinking
    ? { animation: 'lumi-think-pulse .9s ease-in-out infinite' } : {}

  return (
    <>
      <style>{CSS}</style>
      <svg
        width={size}
        height={h}
        viewBox="0 0 80 90"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          imageRendering: 'pixelated',
          cursor: onClick ? 'pointer' : 'default',
          overflow: 'visible',
          display: 'block',
          ...bodyAnim,
        }}
        onClick={onClick}
      >
        {/* ── ALERT GLOW RING ────────────────────────────────── */}
        <circle cx="40" cy="28" r="34" fill="none" stroke="#ff5577" strokeWidth="3" style={glowRing} />

        {/* ── WHITE OUTLINE LAYER ────────────────────────────── */}
        <g fill="white">
          <rect x="17" y="4"  width="12" height="14" rx="4" />
          <rect x="51" y="4"  width="12" height="14" rx="4" />
          <rect x="9"  y="28" width="62" height="48" rx="14" />
          <rect x="10" y="8"  width="60" height="44" rx="18" />
          <rect x="21" y="72" width="14" height="8"  rx="3" />
          <rect x="45" y="72" width="14" height="8"  rx="3" />
          <rect x="5"  y="34" width="14" height="26" rx="7" />
          <rect x="61" y="34" width="14" height="26" rx="7" />
        </g>

        {/* ── FEET ───────────────────────────────────────────── */}
        <rect x="22" y="73" width="12" height="6" rx="2" fill="#c8923a" />
        <rect x="46" y="73" width="12" height="6" rx="2" fill="#c8923a" />
        <rect x="21" y="76" width="5"  height="3" rx="1" fill="#a06828" />
        <rect x="27" y="76" width="5"  height="3" rx="1" fill="#a06828" />
        <rect x="45" y="76" width="5"  height="3" rx="1" fill="#a06828" />
        <rect x="51" y="76" width="5"  height="3" rx="1" fill="#a06828" />

        {/* ── BODY ───────────────────────────────────────────── */}
        <rect x="10" y="30" width="60" height="44" rx="13" fill="#9d7fe8" />
        <rect x="10" y="30" width="10" height="44" rx="8"  fill="#8a6cd4" />
        <rect x="60" y="30" width="10" height="44" rx="8"  fill="#8a6cd4" />

        {/* BELLY */}
        <rect x="22" y="40" width="36" height="28" rx="8" fill="#c8b8f8" style={bellyPulse} />
        <rect x="26" y="46" width="28" height="3"  rx="1" fill="#b8a4f0" style={bellyPulse} />
        <rect x="26" y="51" width="28" height="3"  rx="1" fill="#b8a4f0" style={bellyPulse} />
        <rect x="26" y="56" width="28" height="3"  rx="1" fill="#b8a4f0" style={bellyPulse} />

        {/* ── LEFT WING ──────────────────────────────────────── */}
        <g>
          <rect x="6"  y="35" width="12" height="24" rx="6" fill="#8a6cd4" />
          <rect x="6"  y="42" width="8"  height="12" rx="4" fill="#7a5cc0" />
          <rect x="8"  y="38" width="4"  height="2"  rx="1" fill="#9d7fe8" />
          <rect x="8"  y="43" width="4"  height="2"  rx="1" fill="#9d7fe8" />
          <rect x="8"  y="48" width="4"  height="2"  rx="1" fill="#9d7fe8" />
        </g>

        {/* ── RIGHT WING — waves ─────────────────────────────── */}
        <g style={wingR}>
          <rect x="62" y="35" width="12" height="24" rx="6" fill="#8a6cd4" />
          <rect x="66" y="42" width="8"  height="12" rx="4" fill="#7a5cc0" />
          <rect x="68" y="38" width="4"  height="2"  rx="1" fill="#9d7fe8" />
          <rect x="68" y="43" width="4"  height="2"  rx="1" fill="#9d7fe8" />
          <rect x="68" y="48" width="4"  height="2"  rx="1" fill="#9d7fe8" />
        </g>

        {/* ── HEAD ───────────────────────────────────────────── */}
        <rect x="11" y="9"  width="58" height="42" rx="17" fill="#b49af0" />
        <rect x="16" y="9"  width="48" height="8"  rx="10" fill="#c8b8f8" />
        <rect x="11" y="12" width="8"  height="36" rx="6"  fill="#a088e0" />
        <rect x="61" y="12" width="8"  height="36" rx="6"  fill="#a088e0" />

        {/* ── LEFT EAR ───────────────────────────────────────── */}
        <g style={{ ...earAnim, transformOrigin: '23px 11px' }}>
          <rect x="18" y="5"  width="10" height="12" rx="3" fill="#8a6cd4" />
          <rect x="20" y="4"  width="6"  height="7"  rx="2" fill="#b49af0" />
          <rect x="21" y="3"  width="4"  height="4"  rx="1" fill="#c8b8f8" />
        </g>

        {/* ── RIGHT EAR ──────────────────────────────────────── */}
        <g style={{ ...earAnim, transformOrigin: '57px 11px' }}>
          <rect x="52" y="5"  width="10" height="12" rx="3" fill="#8a6cd4" />
          <rect x="54" y="4"  width="6"  height="7"  rx="2" fill="#b49af0" />
          <rect x="55" y="3"  width="4"  height="4"  rx="1" fill="#c8b8f8" />
        </g>

        {/* ── EYE SOCKETS ────────────────────────────────────── */}
        <rect x="17" y="17" width="18" height="18" rx="9" fill="#1a0e3a" />
        <rect x="45" y="17" width="18" height="18" rx="9" fill="#1a0e3a" />

        {/* ── LEFT EYE ───────────────────────────────────────── */}
        <g style={eyeL}>
          <rect x="18" y="18" width="16" height="16" rx="8" fill="#2a1a5a" />
          <rect x="20" y="20" width="12" height="12" rx="6" fill="#00d4e8" />
          <rect x="23" y="23" width="6"  height="6"  rx="3" fill="#0a1a40" />
          <rect x="21" y="21" width="4"  height="3"  rx="1" fill="#80f0ff" opacity="0.9" />
          <rect x="26" y="25" width="2"  height="2"  rx="1" fill="#ffffff" opacity="0.6" />
          <rect x="19" y="19" width="14" height="14" rx="7" fill="#00d4e8" opacity="0.25"
            style={{ animation: 'lumi-eye-glow 2s ease-in-out infinite' }} />
        </g>

        {/* ── RIGHT EYE ──────────────────────────────────────── */}
        <g style={eyeR}>
          <rect x="46" y="18" width="16" height="16" rx="8" fill="#2a1a5a" />
          <rect x="48" y="20" width="12" height="12" rx="6" fill="#00d4e8" />
          <rect x="51" y="23" width="6"  height="6"  rx="3" fill="#0a1a40" />
          <rect x="49" y="21" width="4"  height="3"  rx="1" fill="#80f0ff" opacity="0.9" />
          <rect x="54" y="25" width="2"  height="2"  rx="1" fill="#ffffff" opacity="0.6" />
          <rect x="47" y="19" width="14" height="14" rx="7" fill="#00d4e8" opacity="0.25"
            style={{ animation: 'lumi-eye-glow 2s ease-in-out infinite .3s' }} />
        </g>

        {/* ── BROWS ──────────────────────────────────────────── */}
        <rect style={browL} x="18" y="15" width="16" height="3" rx="1.5" fill="#7a5cc0" />
        <rect style={browR} x="46" y="15" width="16" height="3" rx="1.5" fill="#7a5cc0" />

        {/* ── BEAK ───────────────────────────────────────────── */}
        <rect x="34" y="33" width="12" height="7" rx="3" fill="#f5c842" />
        <rect x="35" y="37" width="10" height="3" rx="1" fill="#d4a020" />
        <rect x="36" y="34" width="4"  height="2" rx="1" fill="#ffe080" />

        {/* ── MOUTH ──────────────────────────────────────────── */}
        <g style={mouth}>
          <rect x="32" y="42" width="16" height="3" rx="1.5" fill="#5a3a9a" />
          <rect x="33" y="44" width="14" height="2" rx="1"   fill="#3d2070" />
        </g>

        {/* ── THINKING SPINNER ───────────────────────────────── */}
        <g style={spinner}>
          {([[70,4,1.0],[75,10,.8],[75,17,.6],[70,23,.4],[63,23,.25],[57,17,.1]] as [number,number,number][])
            .map(([x,y,op],i) => (
              <rect key={i} x={x} y={y} width="5" height="5" rx="1" fill="#b49af0" opacity={op} />
            ))}
        </g>

        {/* ── SLEEP ZZZ ──────────────────────────────────────── */}
        {anim === 'sleeping' && (
          <g>
            <text style={{ animation: 'lumi-zzz 2.8s ease-in-out infinite 0s'   }} x="66" y="20" fill="#c8b8f8" fontSize="8"  fontFamily="monospace" fontWeight="bold">z</text>
            <text style={{ animation: 'lumi-zzz 2.8s ease-in-out infinite .9s'  }} x="69" y="12" fill="#c8b8f8" fontSize="10" fontFamily="monospace" fontWeight="bold">z</text>
            <text style={{ animation: 'lumi-zzz 2.8s ease-in-out infinite 1.8s' }} x="72" y="4"  fill="#c8b8f8" fontSize="12" fontFamily="monospace" fontWeight="bold">Z</text>
          </g>
        )}

      </svg>
    </>
  )
}
