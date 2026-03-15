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
    'instagram',
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

export interface CustomDistractionPatterns {
  apps: string[]
  urls: string[]
}

let CUSTOM_DISTRACTION_PATTERNS: CustomDistractionPatterns = {
  apps: [],
  urls: [],
}

export function setCustomDistractionPatterns(patterns: CustomDistractionPatterns) {
  CUSTOM_DISTRACTION_PATTERNS = {
    apps: (patterns.apps || []).map((v) => v.toLowerCase().trim()).filter(Boolean),
    urls: (patterns.urls || []).map((v) => v.toLowerCase().trim()).filter(Boolean),
  }
}

export function getCustomDistractionPatterns(): CustomDistractionPatterns {
  return {
    apps: [...CUSTOM_DISTRACTION_PATTERNS.apps],
    urls: [...CUSTOM_DISTRACTION_PATTERNS.urls],
  }
}

export function isDistractingWindow(win: {
  title: string
  owner: string
  url: string | null
}): boolean {
  const ownerLower = win.owner.toLowerCase()
  const titleLower = win.title.toLowerCase()
  const allApps = [...DISTRACTION_PATTERNS.apps, ...CUSTOM_DISTRACTION_PATTERNS.apps]
  const allUrls = [...DISTRACTION_PATTERNS.urls, ...CUSTOM_DISTRACTION_PATTERNS.urls]

  // Check app name
  for (const app of allApps) {
    if (ownerLower.includes(app)) return true
  }

  // Check URL (macOS) and title (Windows — active-win doesn't provide URL on Windows)
  const urlOrTitle = win.url || win.title
  if (urlOrTitle) {
    // Check allowlist first
    for (const pattern of DISTRACTION_PATTERNS.allowlist) {
      if (pattern.test(urlOrTitle)) return false
    }
    for (const domain of allUrls) {
      if (urlOrTitle.toLowerCase().includes(domain)) return true
    }
  }

  // Check title for social media / entertainment app names
  const socialPatterns = /\binstagram\b|\bfacebook\b|\btwitter\b|\breddit\b|\btiktok\b|\bnetflix\b|\btwitch\b|\byoutube\b|\bdiscord\b|\bsnapchat\b|\bwhatsapp\b/i
  if (socialPatterns.test(titleLower)) return true

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
