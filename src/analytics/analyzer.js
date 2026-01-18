// kyndall-idea-engine/src/analytics/analyzer.js
// Claude-powered performance analysis for video milestones

import Anthropic from '@anthropic-ai/sdk'
import { 
  getAllTrackedVideos, 
  saveMilestoneAnalysis, 
  createFollowUpIdea,
  markFollowUpCreated,
  updateIdeaViralityFromPerformance
} from './notion-analytics.js'

let anthropic = null

/**
 * Initialize Claude for analytics
 */
export function initAnalyzer(apiKey) {
  anthropic = new Anthropic({ apiKey })
  console.log('✅ Analytics Analyzer initialized')
}

/**
 * Run analysis for all videos needing milestone analysis
 */
export async function runMilestoneAnalysis() {
  console.log('\n🧠 Running milestone analysis...')
  
  const videos = await getAllTrackedVideos()
  const results = { d1: 0, d7: 0, d30: 0, d90: 0 }

  for (const video of videos) {
    // D1 Analysis - recorded but not analyzed
    if (video.d1Recorded && !video.analysisD1) {
      console.log(`   🔍 D1 Analysis: ${video.title.substring(0, 40)}...`)
      const analysis = await analyzeD1(video)
      if (analysis) {
        await saveMilestoneAnalysis(video.id, 1, analysis)
        results.d1++
      }
    }

    // D7 Analysis
    if (video.d7Recorded && !video.analysisD7) {
      console.log(`   🔍 D7 Analysis: ${video.title.substring(0, 40)}...`)
      const analysis = await analyzeD7(video)
      if (analysis) {
        await saveMilestoneAnalysis(video.id, 7, analysis)
        
        // Create follow-up idea if suggested
        if (analysis.suggestedFollowUp && video.createFollowUp) {
          const ideaId = await createFollowUpIdea(analysis.suggestedFollowUp, video)
          if (ideaId) {
            await markFollowUpCreated(video.id, ideaId)
            console.log(`   💡 Created follow-up idea`)
          }
        }
        results.d7++
      }
    }

    // D30 Analysis
    if (video.d30Recorded && !video.analysisD30) {
      console.log(`   🔍 D30 Analysis: ${video.title.substring(0, 40)}...`)
      const analysis = await analyzeD30(video)
      if (analysis) {
        await saveMilestoneAnalysis(video.id, 30, analysis)
        
        // Update linked idea's virality score based on actual performance
        if (video.linkedIdeaId && analysis.performanceScore) {
          await updateIdeaViralityFromPerformance(
            video.linkedIdeaId, 
            analysis.performanceScore,
            video.viewsCurrent
          )
        }
        results.d30++
      }
    }

    // D90 Analysis
    if (video.d90Recorded && !video.analysisD90) {
      console.log(`   🔍 D90 Analysis: ${video.title.substring(0, 40)}...`)
      const analysis = await analyzeD90(video)
      if (analysis) {
        await saveMilestoneAnalysis(video.id, 90, analysis)
        results.d90++
      }
    }
  }

  console.log(`   Completed: D1=${results.d1}, D7=${results.d7}, D30=${results.d30}, D90=${results.d90}`)
  return results
}

/**
 * Day 1 Analysis - Early Signal
 */
async function analyzeD1(video) {
  const prompt = buildD1Prompt(video)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })

    return parseD1Response(response.content[0].text)
  } catch (error) {
    console.error('Error in D1 analysis:', error.message)
    return null
  }
}

function buildD1Prompt(video) {
  return `You are analyzing early performance (24 hours) for a content creator's video.

VIDEO: "${video.title}"
PLATFORM: ${video.platform}
POSTED: ${video.postedDate}

DAY 1 STATS:
- Views: ${video.viewsD1?.toLocaleString() || 0}
- Likes: ${video.likesD1?.toLocaleString() || 0}
- Comments: ${video.commentsD1?.toLocaleString() || 0}
- Shares: ${video.sharesD1?.toLocaleString() || 0}
${video.retentionD1 ? `- Retention: ${video.retentionD1}%` : ''}

Provide a brief early signal analysis in this format:

SIGNAL: [🔥 Hot Start | ✅ Good Start | ⚠️ Slow Start | ❄️ Cold Start]

SUMMARY:
[2-3 sentences about the early performance. Is this above/below average? What does the engagement rate suggest? Any early patterns?]

EARLY_RECOMMENDATION:
[One specific, actionable tip based on the early data - e.g., "Reply to comments to boost engagement" or "Consider boosting this post"]`
}

function parseD1Response(text) {
  const signalMatch = text.match(/SIGNAL:\s*(.+?)(?:\n|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n(?:EARLY_RECOMMENDATION|$))/i)
  const recMatch = text.match(/EARLY_RECOMMENDATION:\s*\n?([\s\S]*?)$/i)

  return {
    summary: [
      signalMatch ? signalMatch[1].trim() : '',
      summaryMatch ? summaryMatch[1].trim() : '',
      recMatch ? `\n\nRecommendation: ${recMatch[1].trim()}` : ''
    ].filter(Boolean).join('\n\n')
  }
}

/**
 * Day 7 Analysis - Growth Trajectory
 */
async function analyzeD7(video) {
  const prompt = buildD7Prompt(video)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    return parseD7Response(response.content[0].text)
  } catch (error) {
    console.error('Error in D7 analysis:', error.message)
    return null
  }
}

function buildD7Prompt(video) {
  const d1Views = video.viewsD1 || 0
  const d7Views = video.viewsD7 || 0
  const growthRate = d1Views > 0 ? ((d7Views - d1Views) / d1Views * 100).toFixed(1) : 0

  return `You are analyzing week 1 performance for a content creator's video.

VIDEO: "${video.title}"
PLATFORM: ${video.platform}
URL: ${video.url}

PERFORMANCE COMPARISON:
Day 1 → Day 7
- Views: ${d1Views.toLocaleString()} → ${d7Views.toLocaleString()} (${growthRate}% growth)
- Likes: ${(video.likesD1 || 0).toLocaleString()} → ${(video.likesD7 || 0).toLocaleString()}
- Comments: ${(video.commentsD1 || 0).toLocaleString()} → ${(video.commentsD7 || 0).toLocaleString()}
- Shares: ${(video.sharesD1 || 0).toLocaleString()} → ${(video.sharesD7 || 0).toLocaleString()}
${video.retentionD7 ? `- Retention: ${video.retentionD7}%` : ''}

ENGAGEMENT RATE: ${video.engagementRate?.toFixed(2) || 'N/A'}%

Analyze the growth trajectory and provide:

TREND: [📈 Viral Growth | ✅ Steady Growth | 📊 Plateauing | 📉 Declining]

SUMMARY:
[3-4 sentences analyzing the growth pattern. Is the algorithm pushing this? How does engagement compare to views? What's driving performance?]

FOLLOW_UP_IDEA:
[If this video is performing well, suggest ONE specific follow-up content idea. Format as a clear title and brief reason why. If performance is poor, write "None - focus on different content direction"]

Example follow-up format:
Title: "Part 2: [Specific angle]"
Reason: [Why this would capitalize on the momentum]`
}

function parseD7Response(text) {
  const trendMatch = text.match(/TREND:\s*(.+?)(?:\n|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n(?:FOLLOW_UP_IDEA|$))/i)
  const followUpMatch = text.match(/FOLLOW_UP_IDEA:\s*\n?([\s\S]*?)$/i)

  let suggestedFollowUp = null
  if (followUpMatch) {
    const followUpText = followUpMatch[1].trim()
    if (!followUpText.toLowerCase().includes('none')) {
      const titleMatch = followUpText.match(/Title:\s*["']?(.+?)["']?(?:\n|$)/i)
      const reasonMatch = followUpText.match(/Reason:\s*(.+?)(?:\n|$)/i)
      if (titleMatch) {
        suggestedFollowUp = {
          title: titleMatch[1].trim().replace(/^["']|["']$/g, ''),
          reason: reasonMatch ? reasonMatch[1].trim() : followUpText
        }
      }
    }
  }

  return {
    summary: [
      trendMatch ? trendMatch[1].trim() : '',
      summaryMatch ? summaryMatch[1].trim() : ''
    ].filter(Boolean).join('\n\n'),
    suggestedFollowUp
  }
}

/**
 * Day 30 Analysis - Full Performance Review
 */
async function analyzeD30(video) {
  const prompt = buildD30Prompt(video)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    })

    return parseD30Response(response.content[0].text)
  } catch (error) {
    console.error('Error in D30 analysis:', error.message)
    return null
  }
}

function buildD30Prompt(video) {
  return `You are conducting a full 30-day performance review for a content creator's video.

VIDEO: "${video.title}"
PLATFORM: ${video.platform}
URL: ${video.url}

FULL PERFORMANCE DATA:
| Metric | Day 1 | Day 7 | Day 30 |
|--------|-------|-------|--------|
| Views | ${(video.viewsD1 || 0).toLocaleString()} | ${(video.viewsD7 || 0).toLocaleString()} | ${(video.viewsD30 || 0).toLocaleString()} |
| Likes | ${(video.likesD1 || 0).toLocaleString()} | ${(video.likesD7 || 0).toLocaleString()} | ${(video.likesD30 || 0).toLocaleString()} |
| Comments | ${(video.commentsD1 || 0).toLocaleString()} | ${(video.commentsD7 || 0).toLocaleString()} | ${(video.commentsD30 || 0).toLocaleString()} |
| Shares | ${(video.sharesD1 || 0).toLocaleString()} | ${(video.sharesD7 || 0).toLocaleString()} | ${(video.sharesD30 || 0).toLocaleString()} |
${video.retentionD30 ? `| Retention | ${video.retentionD1 || 'N/A'}% | ${video.retentionD7 || 'N/A'}% | ${video.retentionD30}% |` : ''}

ENGAGEMENT RATE: ${video.engagementRate?.toFixed(2) || 'N/A'}%

Provide a comprehensive performance review:

PERFORMANCE_SCORE: [1-100 based on overall success]

PERFORMANCE_TREND: [🔥 Viral | 📈 Growing | 📊 Steady | 📉 Declining | 💀 Flopped]

SUMMARY:
[2-3 sentences summarizing the overall performance]

WHY_IT_WORKED:
[3-4 bullet points about what made this content successful (or why it didn't work). Be specific about the hook, format, timing, topic, etc.]

WHAT_COULD_IMPROVE:
[2-3 specific, actionable suggestions for future similar content]

PATTERN_DETECTED:
[Any patterns you notice that could inform future content strategy - e.g., "Tutorial content outperforms reviews", "Morning posts get more engagement"]`
}

function parseD30Response(text) {
  const scoreMatch = text.match(/PERFORMANCE_SCORE:\s*(\d+)/i)
  const trendMatch = text.match(/PERFORMANCE_TREND:\s*(.+?)(?:\n|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n(?:WHY_IT_WORKED|$))/i)
  const whyMatch = text.match(/WHY_IT_WORKED:\s*\n?([\s\S]*?)(?=\n(?:WHAT_COULD_IMPROVE|$))/i)
  const improveMatch = text.match(/WHAT_COULD_IMPROVE:\s*\n?([\s\S]*?)(?=\n(?:PATTERN_DETECTED|$))/i)
  const patternMatch = text.match(/PATTERN_DETECTED:\s*\n?([\s\S]*?)$/i)

  return {
    summary: [
      trendMatch ? trendMatch[1].trim() : '',
      summaryMatch ? summaryMatch[1].trim() : ''
    ].filter(Boolean).join('\n\n'),
    performanceScore: scoreMatch ? parseInt(scoreMatch[1]) : null,
    performanceTrend: trendMatch ? mapTrendToSelect(trendMatch[1].trim()) : null,
    whyItWorked: whyMatch ? whyMatch[1].trim() : null,
    whatCouldImprove: improveMatch ? improveMatch[1].trim() : null,
    patternDetected: patternMatch ? patternMatch[1].trim() : null
  }
}

/**
 * Day 90 Analysis - Evergreen Check
 */
async function analyzeD90(video) {
  const prompt = buildD90Prompt(video)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    return parseD90Response(response.content[0].text)
  } catch (error) {
    console.error('Error in D90 analysis:', error.message)
    return null
  }
}

function buildD90Prompt(video) {
  const viewsPerDay = video.viewsD90 && video.viewsD30 
    ? Math.round((video.viewsD90 - video.viewsD30) / 60) 
    : 0

  return `You are analyzing the long-term (90-day) performance and evergreen potential of content.

VIDEO: "${video.title}"
PLATFORM: ${video.platform}
URL: ${video.url}

LONG-TERM DATA:
| Metric | Day 30 | Day 90 | Daily Avg (D30-D90) |
|--------|--------|--------|---------------------|
| Views | ${(video.viewsD30 || 0).toLocaleString()} | ${(video.viewsD90 || 0).toLocaleString()} | ~${viewsPerDay}/day |
| Likes | ${(video.likesD30 || 0).toLocaleString()} | ${(video.likesD90 || 0).toLocaleString()} | |
| Comments | ${(video.commentsD30 || 0).toLocaleString()} | ${(video.commentsD90 || 0).toLocaleString()} | |

Analyze the evergreen potential:

EVERGREEN_STATUS: [🌲 Evergreen | 📅 Timely | ⏳ Fading]

SUMMARY:
[2-3 sentences about the long-term performance. Is this still getting discovered? What's driving continued views?]

LONGTAIL_VALUE:
[Is this content valuable for SEO/search? Would it make a good blog post? Any repurposing opportunities?]

RECOMMENDATION:
[One specific recommendation for maximizing long-term value - e.g., "Convert to blog post", "Update and repost", "Create evergreen version"]`
}

function parseD90Response(text) {
  const evergreenMatch = text.match(/EVERGREEN_STATUS:\s*(.+?)(?:\n|$)/i)
  const summaryMatch = text.match(/SUMMARY:\s*\n?([\s\S]*?)(?=\n(?:LONGTAIL_VALUE|$))/i)
  const longtailMatch = text.match(/LONGTAIL_VALUE:\s*\n?([\s\S]*?)(?=\n(?:RECOMMENDATION|$))/i)
  const recMatch = text.match(/RECOMMENDATION:\s*\n?([\s\S]*?)$/i)

  return {
    summary: [
      evergreenMatch ? evergreenMatch[1].trim() : '',
      summaryMatch ? summaryMatch[1].trim() : '',
      longtailMatch ? `\nLongtail Value: ${longtailMatch[1].trim()}` : '',
      recMatch ? `\nRecommendation: ${recMatch[1].trim()}` : ''
    ].filter(Boolean).join('\n\n'),
    evergreenStatus: evergreenMatch ? mapEvergreenToSelect(evergreenMatch[1].trim()) : null
  }
}

/**
 * Map trend text to Notion select options
 */
function mapTrendToSelect(trend) {
  if (trend.includes('Viral') || trend.includes('🔥')) return '🔥 Viral'
  if (trend.includes('Growing') || trend.includes('📈')) return '📈 Growing'
  if (trend.includes('Steady') || trend.includes('📊')) return '📊 Steady'
  if (trend.includes('Declining') || trend.includes('📉')) return '📉 Declining'
  if (trend.includes('Flopped') || trend.includes('💀')) return '💀 Flopped'
  return '📊 Steady'
}

/**
 * Map evergreen text to Notion select options
 */
function mapEvergreenToSelect(status) {
  if (status.includes('Evergreen') || status.includes('🌲')) return '🌲 Evergreen'
  if (status.includes('Timely') || status.includes('📅')) return '📅 Timely'
  if (status.includes('Fading') || status.includes('⏳')) return '⏳ Fading'
  return '📅 Timely'
}

/**
 * Generate insights from all video data for weekly report
 */
export async function generateWeeklyInsights(videos, summary) {
  const prompt = buildWeeklyInsightsPrompt(videos, summary)
  
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    })

    return response.content[0].text
  } catch (error) {
    console.error('Error generating weekly insights:', error.message)
    return null
  }
}

function buildWeeklyInsightsPrompt(videos, summary) {
  const videoList = videos.map(v => 
    `- "${v.title}" (${v.platform}): ${(v.viewsCurrent || 0).toLocaleString()} views, ${(v.likesCurrent || 0).toLocaleString()} likes`
  ).join('\n')

  return `You are writing a positive, encouraging weekly performance summary for Kyndall, a beauty/lifestyle content creator.

THIS WEEK'S CONTENT:
${videoList || 'No new content this week'}

OVERALL STATS:
- Total Views: ${summary.overall.totalViews.toLocaleString()}
- Total Likes: ${summary.overall.totalLikes.toLocaleString()}
- YouTube Videos: ${summary.youtube.totalVideos}
- TikTok Videos: ${summary.tiktok.totalVideos}

Write a warm, encouraging weekly summary that:
1. Celebrates what went well (be specific!)
2. Highlights the top performer and why it worked
3. Notes any patterns or insights
4. Gives ONE focused suggestion for next week
5. Ends with encouragement

Keep it positive and actionable. Use her voice - warm, friendly, like a supportive friend. About 200-300 words.`
}
