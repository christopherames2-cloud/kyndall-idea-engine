// kyndall-idea-engine/src/claude.js
// Claude AI analysis - generates virality scores, hooks, and insights

import Anthropic from '@anthropic-ai/sdk'

let anthropic = null

/**
 * Initialize the Anthropic client
 */
export function initClaude(apiKey) {
  anthropic = new Anthropic({ apiKey })
  console.log('✅ Claude client initialized')
}

/**
 * Analyze a content idea and generate enrichments
 */
export async function analyzeIdea(idea, existingContent) {
  if (!anthropic) {
    throw new Error('Claude not initialized')
  }

  const prompt = buildAnalysisPrompt(idea, existingContent)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const text = response.content[0].text
    return parseAnalysisResponse(text)
  } catch (error) {
    console.error('Error calling Claude:', error.message)
    return null
  }
}

/**
 * Build the analysis prompt with context
 */
function buildAnalysisPrompt(idea, existingContent) {
  const { stats, postsByCategory, recentTopics } = existingContent

  // Format platform array for display
  const platformStr = Array.isArray(idea.platform) && idea.platform.length > 0 
    ? idea.platform.join(', ') 
    : 'Not specified'
  
  // Format status for display (now a single select, not array)
  const statusStr = idea.status || 'Not set'

  return `You are an elite viral content strategist who has helped creators go from 0 to millions of followers. You understand the psychology of what makes people stop scrolling, watch till the end, and share with friends.

You're analyzing content ideas for Kyndall Ames (@kyndallames), a beauty and lifestyle creator known for her warm, authentic, best-friend energy. Her audience trusts her like a friend who always has the best recommendations.

## WHAT MAKES CONTENT GO VIRAL
- Pattern interrupt in the first 0.5 seconds
- Curiosity gap that MUST be closed
- Emotional resonance (relatability, aspiration, controversy)
- Watch time retention through storytelling
- Share trigger ("tag someone who needs this")
- Comment bait (asking for opinions, hot takes)
- Save trigger (valuable info they'll want later)

## KYNDALL'S BRAND VOICE
- Warm, approachable, like texting your best friend
- Authentic - she shares what she actually uses
- Enthusiastic but not fake - genuine excitement
- Slightly self-deprecating humor
- Direct - gets to the point fast
- Uses phrases like: "okay but...", "hear me out", "I'm obsessed", "game changer", "no because...", "the way this..."

## HER EXISTING CONTENT
Total posts: ${stats?.totalPosts || 0} | Articles: ${stats?.totalArticles || 0}

Categories: Makeup (${stats?.categories?.makeup || 0}) | Skincare (${stats?.categories?.skincare || 0}) | Fashion (${stats?.categories?.fashion || 0}) | Lifestyle (${stats?.categories?.lifestyle || 0}) | Travel (${stats?.categories?.travel || 0})

Recent content:
${recentTopics?.slice(0, 8).map(t => `• ${t}`).join('\n') || '(building content library)'}

---

## THE IDEA TO ANALYZE

**Title:** ${idea.title}
**Platform(s):** ${platformStr}
**Current Status:** ${statusStr}

---

## YOUR ANALYSIS

Think like a viral content expert. Be specific. Be strategic. Give her content that will PERFORM.

IMPORTANT: Respond with ONLY the content for each section. Do NOT include the section labels in your answers. Just provide the raw content that goes after each label.

Respond in EXACTLY this format:

VIRALITY_SCORE: [1-100]

SCORE_BREAKDOWN:
[Why this score? Be brutally honest. What's the viral potential? What's working? What's missing? 2-3 sentences max.]

AI_REVIEW:
[Strategic advice to make this CRUSH. Specific tweaks, angles, or approaches. What would make this go from good to viral? 2-3 sentences of actionable advice.]

HOOK_1:
[CURIOSITY HOOK - Create an information gap they NEED to close. Make them think "wait what?" Should stop the scroll in under 2 seconds. Under 12 words. Just the hook text, nothing else.]

HOOK_2:
[RELATABLE HOOK - Start with "POV:" or describe a universal experience. Make them feel SEEN. Something they'll comment "this is so me" on. Under 12 words. Just the hook text, nothing else.]

HOOK_3:
[SPICY HOOK - Controversial, bold, or unexpected take. Something that makes people want to argue OR aggressively agree. Under 12 words. Just the hook text, nothing else.]

DESCRIPTION:
[Write the actual caption/description she should post. Include:
- Engaging opening line
- Brief context or story (2-3 sentences)
- Call to action (save, share, comment, follow)
- Keep it conversational in her voice
- 150-300 characters for TikTok/Reels, can be longer for YouTube]

HASHTAGS:
[10-15 relevant hashtags. Mix of:
- High volume (1M+ posts): 3-4 tags
- Medium volume (100K-1M): 5-6 tags  
- Niche/specific (under 100K): 3-4 tags
- Trending if relevant: 1-2 tags
Format as: #hashtag #hashtag #hashtag]

BEST_FORMAT: [ONE of: TikTok | YouTube Short | YouTube Long | Instagram Reel | Instagram Story | Instagram Carousel | Blog Post]

ADDITIONAL_FORMATS: [Other formats this works for, comma-separated, or "None"]

SIMILAR_CONTENT:
[Has she covered this? If yes, how should this be different? If no, note it's fresh. Be specific.]

CONTENT_GAP:
[What unique angle makes this HER version? What will make people choose her video over the 1000 others on this topic?]

TRENDING_RELEVANCE:
[Any trends, sounds, formats, or timing she should leverage? Be specific - name actual trends if relevant.]

POSTING_TIME:
[Best day/time to post this type of content for maximum reach. Be specific.]

---

## SCORING GUIDE
- 90-100: VIRAL POTENTIAL - Perfect timing, insane hook potential, highly shareable, comment-worthy
- 75-89: STRONG - Will perform well, good engagement, solid content
- 60-74: GOOD - Decent idea, needs stronger hook or angle
- 40-59: NEEDS WORK - Oversaturated or weak angle, requires significant refinement
- Below 40: SKIP - Off-brand, bad timing, or won't resonate

Be her secret weapon. Give her the analysis that turns good ideas into viral content.`
}

/**
 * Parse Claude's response into structured data
 */
function parseAnalysisResponse(text) {
  const analysis = {
    viralityScore: 50,
    scoreBreakdown: '',
    aiReview: '',
    hook1: '',
    hook2: '',
    hook3: '',
    description: '',
    hashtags: '',
    bestFormat: 'TikTok',
    additionalFormats: [],
    similarContent: '',
    contentGap: '',
    trendingRelevance: '',
    postingTime: ''
  }

  // All possible section headers for boundary detection
  const sectionHeaders = [
    'VIRALITY_SCORE',
    'SCORE_BREAKDOWN',
    'AI_REVIEW',
    'HOOK_1',
    'HOOK_2',
    'HOOK_3',
    'DESCRIPTION',
    'HASHTAGS',
    'BEST_FORMAT',
    'ADDITIONAL_FORMATS',
    'SIMILAR_CONTENT',
    'CONTENT_GAP',
    'TRENDING_RELEVANCE',
    'POSTING_TIME'
  ]

  try {
    // Extract virality score
    const scoreMatch = text.match(/VIRALITY_SCORE:\s*(\d+)/i)
    if (scoreMatch) {
      analysis.viralityScore = Math.min(100, Math.max(1, parseInt(scoreMatch[1])))
    }

    // Extract each section
    analysis.scoreBreakdown = extractSection(text, 'SCORE_BREAKDOWN', sectionHeaders)
    analysis.aiReview = extractSection(text, 'AI_REVIEW', sectionHeaders)
    analysis.hook1 = extractSection(text, 'HOOK_1', sectionHeaders)
    analysis.hook2 = extractSection(text, 'HOOK_2', sectionHeaders)
    analysis.hook3 = extractSection(text, 'HOOK_3', sectionHeaders)
    analysis.description = extractSection(text, 'DESCRIPTION', sectionHeaders)
    analysis.hashtags = extractSection(text, 'HASHTAGS', sectionHeaders)
    
    // Extract best format
    const formatMatch = text.match(/BEST_FORMAT:\s*(.+?)(?:\n|$)/i)
    if (formatMatch) {
      const format = formatMatch[1].trim()
      analysis.bestFormat = normalizeFormat(format)
    }

    // Extract additional formats
    const additionalMatch = text.match(/ADDITIONAL_FORMATS:\s*(.+?)(?:\n|$)/i)
    if (additionalMatch) {
      const formatsStr = additionalMatch[1].trim()
      if (formatsStr.toLowerCase() !== 'none') {
        analysis.additionalFormats = formatsStr
          .split(',')
          .map(f => normalizeFormat(f.trim()))
          .filter(f => f && f !== analysis.bestFormat)
      }
    }

    analysis.similarContent = extractSection(text, 'SIMILAR_CONTENT', sectionHeaders)
    analysis.contentGap = extractSection(text, 'CONTENT_GAP', sectionHeaders)
    analysis.trendingRelevance = extractSection(text, 'TRENDING_RELEVANCE', sectionHeaders)
    analysis.postingTime = extractSection(text, 'POSTING_TIME', sectionHeaders)

  } catch (error) {
    console.error('Error parsing Claude response:', error.message)
  }

  return analysis
}

/**
 * Normalize format names to match Notion select options
 */
function normalizeFormat(format) {
  const formatMap = {
    'tiktok': 'TikTok',
    'youtube short': 'YouTube Short',
    'youtube shorts': 'YouTube Short',
    'yt short': 'YouTube Short',
    'youtube long': 'YouTube Long',
    'youtube long-form': 'YouTube Long',
    'yt long': 'YouTube Long',
    'instagram reel': 'Instagram Reel',
    'ig reel': 'Instagram Reel',
    'reel': 'Instagram Reel',
    'instagram story': 'Instagram Story',
    'ig story': 'Instagram Story',
    'story': 'Instagram Story',
    'instagram carousel': 'Instagram Carousel',
    'ig carousel': 'Instagram Carousel',
    'carousel': 'Instagram Carousel',
    'blog post': 'Blog Post',
    'blog': 'Blog Post'
  }
  return formatMap[format.toLowerCase()] || format
}

/**
 * Extract a section from the response text
 */
function extractSection(text, sectionName, allSections) {
  // Build regex pattern that stops at any other section header
  const otherSections = allSections.filter(s => s !== sectionName).join('|')
  const regex = new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?=\\n(?:${otherSections}):|$)`, 'i')
  
  const match = text.match(regex)
  if (match) {
    let content = match[1].trim()
    
    // Clean up any stray section labels that might have bled through
    // This catches cases where the regex didn't stop cleanly
    const cleanupRegex = new RegExp(`\\n?(${allSections.join('|')}):[\\s\\S]*$`, 'i')
    content = content.replace(cleanupRegex, '')
    
    // Remove common prefixes that Claude might add to hooks
    // e.g., "CURIOSITY HOOK - " or "[RELATABLE HOOK]"
    content = content.replace(/^\[?(?:CURIOSITY|RELATABLE|SPICY|BOLD)?\s*HOOK\s*[-:\]]\s*/i, '')
    
    return content.trim()
  }
  return ''
}
