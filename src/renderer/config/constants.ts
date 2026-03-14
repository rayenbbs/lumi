// Timing thresholds (all in milliseconds unless noted)
export const CONFIG = {
  // Feature toggles
  EYE_TRACKING_ENABLED: false,        // set true to enable WebGazer flow

  // Distraction detection
  DISTRACTION_GRACE_PERIOD: 10_000,    // 10s before flagging distraction
  DISTRACTION_COOLDOWN: 30_000,        // 30s between distraction nudges

  // Stuck detection
  STUCK_THRESHOLD_SECS: 60,            // 60s staring at same area
  STUCK_COOLDOWN: 300_000,             // 5min between stuck interventions

  // Fatigue detection
  FATIGUE_BLINK_THRESHOLD: 30,         // >30 blinks/min = fatigue signal
  FATIGUE_SESSION_THRESHOLD: 50 * 60_000, // 50min without break
  FATIGUE_COOLDOWN: 900_000,           // 15min between fatigue nudges

  // Wandering detection (eyes off screen)
  WANDERING_THRESHOLD: 25_000,         // 25s looking away
  WANDERING_COOLDOWN: 120_000,         // 2min between wandering nudges

  // General
  MIN_INTERVENTION_GAP: 15_000,        // 20s minimum between ANY interventions
  SESSION_INACTIVITY_TIMEOUT: 300_000, // 5min no activity → session end

  // Update loops
  TRIGGER_CHECK_INTERVAL: 500,         // ms between trigger engine checks
  OCR_INTERVAL: 5_000,                 // ms between OCR captures (expensive)
  WINDOW_CHECK_INTERVAL: 500,          // ms between active-win polls

  // Eye tracker
  GAZE_STATIONARY_THRESHOLD: 180,      // pixels — "same region"
  GAZE_VELOCITY_STUCK: 15,             // px/s — slow eye movement = stuck
  EYE_HISTORY_WINDOW: 8_000,          // ms of gaze data to keep

  // UI
  CHAT_HISTORY_VISIBLE: 5,            // number of messages to show at once
  CONVERSATION_CONTEXT_MESSAGES: 6,   // messages to send to LLM as context

  // MCP server
  MCP_SERVER_PORT: 3001,
}

export const LUMI_VERSION = '1.0.0'
