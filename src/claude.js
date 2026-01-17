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
      max_tokens: 2000,
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
  
  // Format status array for display
  const statusStr = Array.isArray(idea.status) && idea.status.length > 0
    ? idea.status.join(', ')
    : 'Not set'

  return `You are a social media content strategist for Kyndall Ames, a beauty and lifestyle content creator. Analyze this content idea and provide insights.

## KYNDALL'S EXISTING CONTENT
Total posts: ${stats?.totalPosts || 0}
Total articles: ${stats?.totalArticles || 0}

Content by category:
- Makeup: ${stats?.categories?.makeup || 0} posts
- Skincare: ${stats?.categories?.skincare || 0} posts  
- Fashion: ${stats?.categories?.fashion || 0} posts
- Lifestyle: ${stats?.categories?.lifestyle || 0} posts
- Travel: ${stats?.categories?.travel || 0} posts

Recent topics she's covered:
${recentTopics?.map(t => `- ${t}`).join('\n') || '(none yet)'}

## THE IDEA TO ANALYZE
Title: ${idea.title}
Platform(s): ${platformStr}
Status: ${statusStr}

## YOUR TASK
Analyze this idea and respond in EXACTLY this format (keep each section concise):

VIRALITY_SCORE: [number 1-100]

SCORE_BREAKDOWN:
[2-3 sentences explaining the score - consider trend potential, hook strength, shareability, her niche fit, and competition]

AI_REVIEW:
[2-3 sentences of strategic advice - what would make this perform well, any concerns, timing considerations]

HOOK_1:
[A curiosity-driven hook that creates intrigue - 1-2 sentences max]

HOOK_2:
[A relatable/POV hook that viewers identify with - 1-2 sentences max]

HOOK_3:
[A bold/contrarian hook that stands out - 1-2 sentences max]

BEST_FORMAT: [Choose ONE primary format: TikTok | YouTube Short | YouTube Long | Instagram Reel | Instagram Story | Instagram Carousel | Blog Post]

ADDITIONAL_FORMATS: [List other formats this would work well for, comma-separated, or "None" if only one format fits]

SIMILAR_CONTENT:
[If she's covered something similar, mention it. Otherwise say "This appears to be a fresh topic for your channel." Include slug if relevant for linking]

CONTENT_GAP:
[1-2 sentences on what makes this different from her existing content or competitors - the unique angle]

TRENDING_RELEVANCE:
[1 sentence on any current trends, seasons, or timing factors that affect this idea]

## SCORING GUIDELINES
- 80-100: Extremely high viral potential, perfect timing, strong hook potential
- 60-79: Good potential, solid idea that fits her brand
- 40-59: Decent idea but may need refinement or better timing
- 20-39: Weak potential, oversaturated topic, or poor brand fit
- 1-19: Not recommended, off-brand or problematic

## HOOK GUIDELINES
- Keep hooks under 15 words
- Hook 1 (Curiosity): Create a knowledge gap or tease a revelation
- Hook 2 (Relatable): Start with "POV:" or describe a common experience
- Hook 3 (Bold): Take a stance, be controversial, or challenge assumptions

## FORMAT OPTIONS
Primary formats to choose from:
- TikTok (short, trendy, sound-driven)
- YouTube Short (short vertical, discoverable)
- YouTube Long (in-depth, 8+ minutes)
- Instagram Reel (short, aesthetic, shareable)
- Instagram Story (casual, behind-the-scenes)
- Instagram Carousel (educational, swipeable)
- Blog Post (SEO, detailed, evergreen)

Be specific to Kyndall's voice - she's warm, authentic, and speaks like a friend giving advice. Avoid generic influencer speak.`
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
    bestFormat: 'TikTok',
    additionalFormats: [],
    similarContent: '',
    contentGap: '',
    trendingRelevance: ''
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
    analysis.hook1 = extractSection(text, 'HOOK_1')
    analysis.hook2 = extractSection(text, 'HOOK_2')
    analysis.hook3 = extractSection(text, 'HOOK_3')
    
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
          .filter(f => f && f !== analysis.bestFormat) // Remove duplicates of best format
      }
    }

    analysis.similarContent = extractSection(text, 'SIMILAR_CONTENT')
    analysis.contentGap = extractSection(text, 'CONTENT_GAP')
    analysis.trendingRelevance = extractSection(text, 'TRENDING_RELEVANCE')

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
function extractSection(text, sectionName) {
  // Match section name followed by content until the next section or end
  const regex = new RegExp(`${sectionName}:\\s*\\n?([\\s\\S]*?)(?=\\n[A-Z_]+:|$)`, 'i')
  const match = text.match(regex)
  if (match) {
    return match[1].trim()
  }
  return ''
}
