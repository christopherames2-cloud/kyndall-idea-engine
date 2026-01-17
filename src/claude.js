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
 * Check if an idea is a "help" request
 */
export function isHelpRequest(idea) {
  return idea.title.toLowerCase().trim().startsWith('help ')
}

/**
 * Extract the topic from a help request
 */
export function extractHelpTopic(idea) {
  return idea.title.replace(/^help\s+/i, '').trim()
}

/**
 * Brainstorm high-viral ideas for a topic (help mode)
 * Returns array of 5 fully-analyzed ideas
 */
export async function brainstormIdeas(topic, existingContent) {
  if (!anthropic) {
    throw new Error('Claude not initialized')
  }

  const prompt = buildBrainstormPrompt(topic, existingContent)

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const text = response.content[0].text
    return parseBrainstormResponse(text)
  } catch (error) {
    console.error('Error calling Claude for brainstorm:', error.message)
    return []
  }
}

/**
 * Build the brainstorm prompt
 */
function buildBrainstormPrompt(topic, existingContent) {
  const { stats, recentTopics } = existingContent

  return `You are an elite viral content strategist who has helped creators go from 0 to millions of followers. You ONLY suggest ideas that have genuine viral potential.

You're brainstorming content ideas for Kyndall Ames (@kyndallames), a beauty and lifestyle creator known for her warm, authentic, best-friend energy.

## KYNDALL'S BRAND VOICE
- Warm, approachable, like texting your best friend
- Authentic - she shares what she actually uses
- Enthusiastic but not fake - genuine excitement
- Uses phrases like: "okay but...", "hear me out", "I'm obsessed", "game changer"

## HER EXISTING CONTENT
Total posts: ${stats?.totalPosts || 0} | Articles: ${stats?.totalArticles || 0}
Recent content:
${recentTopics?.slice(0, 8).map(t => `• ${t}`).join('\n') || '(building content library)'}

---

## THE TOPIC TO BRAINSTORM

**Topic:** ${topic}

---

## YOUR TASK

Generate exactly 5 HIGH-VIRAL-POTENTIAL content ideas based on this topic. 

CRITICAL RULES:
- Every idea MUST be worthy of a 75+ virality score
- No generic or overdone ideas - be SPECIFIC and CREATIVE
- Each idea should have a unique angle or hook
- Think about what's trending NOW and what creates engagement
- Consider controversy, relatability, curiosity gaps, and shareability

For EACH of the 5 ideas, provide a COMPLETE analysis in this EXACT format:

---IDEA_1---
TITLE: [Specific, compelling title - not generic]
VIRALITY_SCORE: [75-100 only]
SCORE_BREAKDOWN:
[Why this will go viral - 2-3 sentences]
AI_REVIEW:
[Strategic advice - 2-3 sentences]
HOOK_1:
[Curiosity hook - under 12 words]
HOOK_2:
[Relatable/POV hook - under 12 words]
HOOK_3:
[Spicy/bold hook - under 12 words]
DESCRIPTION:
[Full caption/description in her voice - 150-300 characters]
HASHTAGS:
[10-15 relevant hashtags]
BEST_FORMAT: [TikTok | YouTube Short | YouTube Long | Instagram Reel | Instagram Story | Instagram Carousel | Blog Post]
ADDITIONAL_FORMATS: [Other formats or "None"]
SIMILAR_CONTENT:
[How this differs from her existing content]
CONTENT_GAP:
[What makes this unique]
TRENDING_RELEVANCE:
[Current trends to leverage]
POSTING_TIME:
[Best day/time to post]
---END_IDEA_1---

---IDEA_2---
[Same format...]
---END_IDEA_2---

---IDEA_3---
[Same format...]
---END_IDEA_3---

---IDEA_4---
[Same format...]
---END_IDEA_4---

---IDEA_5---
[Same format...]
---END_IDEA_5---

Remember: ONLY suggest ideas that would genuinely score 75+. Quality over quantity. Be her secret weapon.`
}

/**
 * Parse brainstorm response into array of ideas
 */
function parseBrainstormResponse(text) {
  const ideas = []
  
  // Extract each idea block
  for (let i = 1; i <= 5; i++) {
    const startMarker = `---IDEA_${i}---`
    const endMarker = `---END_IDEA_${i}---`
    
    const startIdx = text.indexOf(startMarker)
    const endIdx = text.indexOf(endMarker)
    
    if (startIdx !== -1 && endIdx !== -1) {
      const ideaBlock = text.substring(startIdx + startMarker.length, endIdx).trim()
      const parsedIdea = parseIdeaBlock(ideaBlock)
      if (parsedIdea && parsedIdea.title) {
        ideas.push(parsedIdea)
      }
    }
  }
  
  return ideas
}

/**
 * Parse a single idea block
 */
function parseIdeaBlock(block) {
  const idea = {
    title: '',
    viralityScore: 75,
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

  try {
    // Extract title
    const titleMatch = block.match(/TITLE:\s*(.+?)(?:\n|$)/i)
    if (titleMatch) {
      idea.title = titleMatch[1].trim()
    }

    // Extract virality score
    const scoreMatch = block.match(/VIRALITY_SCORE:\s*(\d+)/i)
    if (scoreMatch) {
      idea.viralityScore = Math.min(100, Math.max(75, parseInt(scoreMatch[1])))
    }

    // Extract sections
    idea.scoreBreakdown = extractSection(block, 'SCORE_BREAKDOWN')
    idea.aiReview = extractSection(block, 'AI_REVIEW')
    idea.hook1 = cleanHookText(extractSection(block, 'HOOK_1'))
    idea.hook2 = cleanHookText(extractSection(block, 'HOOK_2'))
    idea.hook3 = cleanHookText(extractSection(block, 'HOOK_3'))
    idea.description = extractSection(block, 'DESCRIPTION')
    idea.hashtags = extractSection(block, 'HASHTAGS')
    
    // Extract best format
    const formatMatch = block.match(/BEST_FORMAT:\s*(.+?)(?:\n|$)/i)
    if (formatMatch) {
      idea.bestFormat = normalizeFormat(formatMatch[1].trim())
    }

    // Extract additional formats
    const additionalMatch = block.match(/ADDITIONAL_FORMATS:\s*(.+?)(?:\n|$)/i)
    if (additionalMatch) {
      const formatsStr = additionalMatch[1].trim()
      if (formatsStr.toLowerCase() !== 'none') {
        idea.additionalFormats = formatsStr
          .split(',')
          .map(f => normalizeFormat(f.trim()))
          .filter(f => f && f !== idea.bestFormat)
      }
    }

    idea.similarContent = extractSection(block, 'SIMILAR_CONTENT')
    idea.contentGap = extractSection(block, 'CONTENT_GAP')
    idea.trendingRelevance = extractSection(block, 'TRENDING_RELEVANCE')
    idea.postingTime = extractSection(block, 'POSTING_TIME')

  } catch (error) {
    console.error('Error parsing idea block:', error.message)
  }

  return idea
}

/**
 * Analyze a content idea and generate enrichments (normal mode)
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

Respond in EXACTLY this format (provide ONLY the content after each label, no extra labels or prefixes):

VIRALITY_SCORE: [number 1-100]

SCORE_BREAKDOWN:
[Why this score? Be brutally honest. What's the viral potential? What's working? What's missing? 2-3 sentences max.]

AI_REVIEW:
[Strategic advice to make this CRUSH. Specific tweaks, angles, or approaches. What would make this go from good to viral? 2-3 sentences of actionable advice.]

HOOK_1:
[Curiosity hook - under 12 words, just the hook text]

HOOK_2:
[Relatable/POV hook - under 12 words, just the hook text]

HOOK_3:
[Spicy/bold hook - under 12 words, just the hook text]

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

  try {
    // Extract virality score
    const scoreMatch = text.match(/VIRALITY_SCORE:\s*(\d+)/i)
    if (scoreMatch) {
      analysis.viralityScore = Math.min(100, Math.max(1, parseInt(scoreMatch[1])))
    }

    // Extract each section
    analysis.scoreBreakdown = extractSection(text, 'SCORE_BREAKDOWN')
    analysis.aiReview = extractSection(text, 'AI_REVIEW')
    analysis.hook1 = cleanHookText(extractSection(text, 'HOOK_1'))
    analysis.hook2 = cleanHookText(extractSection(text, 'HOOK_2'))
    analysis.hook3 = cleanHookText(extractSection(text, 'HOOK_3'))
    analysis.description = extractSection(text, 'DESCRIPTION')
    analysis.hashtags = extractSection(text, 'HASHTAGS')
    
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

    analysis.similarContent = extractSection(text, 'SIMILAR_CONTENT')
    analysis.contentGap = extractSection(text, 'CONTENT_GAP')
    analysis.trendingRelevance = extractSection(text, 'TRENDING_RELEVANCE')
    analysis.postingTime = extractSection(text, 'POSTING_TIME')

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
 * Fixed regex to include digits (for HOOK_1, HOOK_2, HOOK_3)
 */
function extractSection(text, sectionName) {
  // [A-Z_0-9]+ now includes digits to match HOOK_1, HOOK_2, etc.
  const regex = new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?=\\n[A-Z_0-9]+:|$)`, 'i')
  const match = text.match(regex)
  if (match) {
    return match[1].trim()
  }
  return ''
}

/**
 * Clean up hook text - remove labels and prefixes that Claude might add
 */
function cleanHookText(hookText) {
  if (!hookText) return ''
  
  let cleaned = hookText
  
  // Remove common prefixes Claude adds to hooks
  // e.g., "HOOK_1:", "HOOK_2:", "Curiosity hook -", "[RELATABLE HOOK]", etc.
  cleaned = cleaned.replace(/^HOOK_\d:\s*/i, '')
  cleaned = cleaned.replace(/^\[?(?:CURIOSITY|RELATABLE|SPICY|BOLD|POV)?\s*(?:HOOK)?\]?\s*[-:]\s*/i, '')
  
  // Remove quotes if the entire hook is wrapped in them
  cleaned = cleaned.replace(/^["'](.+)["']$/, '$1')
  
  return cleaned.trim()
}
