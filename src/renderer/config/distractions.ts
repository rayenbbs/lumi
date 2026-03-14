export const DISTRACTION_PATTERNS = {
  apps: [
    'discord',
    'slack',
    'telegram',
    'whatsapp',
    'steam',
    'epic games',
    'spotify',
    'tiktok',
    'snapchat',
    'minecraft',
    'roblox',
    'valorant',
    'league of legends',
    'fortnite',
  ],
  urls: [
    'youtube.com',
    'netflix.com',
    'twitch.tv',
    'instagram.com',
    'facebook.com',
    'twitter.com',
    'x.com',
    'reddit.com',
    'tiktok.com',
    '9gag.com',
    'discord.com',
    'web.whatsapp.com',
    'twitch.tv',
    'primevideo.com',
    'disneyplus.com',
    'hulu.com',
  ],
  // Allowlist: study-related URLs that match distraction patterns
  allowlist: [
    /youtube\.com\/watch\?.*lecture/i,
    /youtube\.com\/watch\?.*tutorial/i,
    /youtube\.com\/watch\?.*course/i,
    /youtube\.com\/watch\?.*study/i,
    /stackoverflow\.com/i,
    /github\.com/i,
    /docs\./i,
    /arxiv\.org/i,
    /scholar\.google\.com/i,
    /coursera\.org/i,
    /edx\.org/i,
    /khanacademy\.org/i,
    /mit\.edu/i,
    /wikipedia\.org/i,
  ],
  // Window title patterns that suggest studying
  studyPatterns: /\.pdf|lecture|chapter|course|study|docs|notes|textbook|homework|assignment|exam|quiz|tutorial/i,
}

export function isDistractingWindow(win: {
  title: string
  owner: string
  url: string | null
}): boolean {
  const ownerLower = win.owner.toLowerCase()
  const titleLower = win.title.toLowerCase()

  // Check app name
  for (const app of DISTRACTION_PATTERNS.apps) {
    if (ownerLower.includes(app)) return true
  }

  // Check URL
  if (win.url) {
    // Check allowlist first
    for (const pattern of DISTRACTION_PATTERNS.allowlist) {
      if (pattern.test(win.url)) return false
    }
    for (const domain of DISTRACTION_PATTERNS.urls) {
      if (win.url.includes(domain)) return true
    }
  }

  // Check title for gaming signals
  const gamePatterns = /\bplaying\b|\bgame\b|fps:|score:/i
  if (gamePatterns.test(titleLower)) return true

  return false
}

export function isStudyWindow(win: {
  title: string
  owner: string
  url: string | null
}): boolean {
  return (
    DISTRACTION_PATTERNS.studyPatterns.test(win.title) ||
    DISTRACTION_PATTERNS.studyPatterns.test(win.url || '')
  )
}
