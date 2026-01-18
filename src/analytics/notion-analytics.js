// kyndall-idea-engine/src/analytics/notion-analytics.js
// Notion API integration for the Analytics database

import { Client } from '@notionhq/client'

let notion = null
let analyticsDbId = null
let ideasDbId = null

/**
 * Initialize Notion client for analytics
 */
export function initNotionAnalytics(apiKey, analyticsDb, ideasDb) {
  notion = new Client({ auth: apiKey })
  analyticsDbId = analyticsDb
  ideasDbId = ideasDb
  console.log('✅ Notion Analytics initialized')
}

/**
 * Get all tracked videos from Analytics database
 */
export async function getAllTrackedVideos() {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  try {
    const response = await notion.databases.query({
      database_id: analyticsDbId,
      filter: {
        property: 'Status',
        status: {
          does_not_equal: 'Archived'
        }
      },
      sorts: [
        { property: 'Posted Date', direction: 'descending' }
      ]
    })

    return response.results.map(page => parseAnalyticsPage(page))
  } catch (error) {
    console.error('Error fetching tracked videos:', error.message)
    return []
  }
}

/**
 * Get videos needing milestone analysis
 */
export async function getVideosNeedingAnalysis(milestone) {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  const recordedProperty = `D${milestone} Recorded`
  
  try {
    const response = await notion.databases.query({
      database_id: analyticsDbId,
      filter: {
        and: [
          {
            property: recordedProperty,
            date: { is_empty: true }
          },
          {
            property: 'Status',
            status: { does_not_equal: 'Archived' }
          }
        ]
      }
    })

    return response.results.map(page => parseAnalyticsPage(page))
  } catch (error) {
    console.error(`Error fetching videos needing D${milestone} analysis:`, error.message)
    return []
  }
}

/**
 * Find video by Video ID and Platform
 */
export async function findVideoByPlatformId(videoId, platform) {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  try {
    const response = await notion.databases.query({
      database_id: analyticsDbId,
      filter: {
        and: [
          { property: 'Video ID', rich_text: { equals: videoId } },
          { property: 'Platform', select: { equals: platform } }
        ]
      }
    })

    if (response.results.length > 0) {
      return parseAnalyticsPage(response.results[0])
    }
    return null
  } catch (error) {
    console.error('Error finding video:', error.message)
    return null
  }
}

/**
 * Create a new video entry in Analytics database
 * Checks for duplicates first to prevent race conditions
 */
export async function createVideoEntry(video) {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  try {
    // Check if video already exists (prevents duplicates from race conditions)
    const existing = await findVideoByPlatformId(video.videoId, video.platform)
    if (existing) {
      console.log(`   ⏭️  Skipping duplicate: ${video.title?.substring(0, 40)}...`)
      return existing.id // Return existing ID instead of creating duplicate
    }

    const properties = {
      'Name': {
        title: [{ text: { content: video.title } }]
      },
      'Platform': {
        select: { name: video.platform }
      },
      'Video ID': {
        rich_text: [{ text: { content: video.videoId } }]
      },
      'URL': {
        url: video.url
      },
      'Posted Date': {
        date: { start: video.publishedAt }
      },
      'Status': {
        status: { name: 'New' }
      }
    }

    // Add thumbnail if available
    if (video.thumbnail) {
      properties['Thumbnail'] = {
        files: [{ type: 'external', name: 'thumbnail', external: { url: video.thumbnail } }]
      }
    }

    // Link to Ideas database if provided
    if (video.linkedIdeaId) {
      properties['Linked Idea'] = {
        relation: [{ id: video.linkedIdeaId }]
      }
    }

    const response = await notion.pages.create({
      parent: { database_id: analyticsDbId },
      properties
    })

    return response.id
  } catch (error) {
    console.error('Error creating video entry:', error.message)
    return null
  }
}

/**
 * Update current stats for a video
 */
export async function updateCurrentStats(pageId, stats) {
  if (!notion) {
    throw new Error('Notion Analytics not initialized')
  }

  try {
    const properties = {
      'Views Current': { number: stats.views },
      'Likes Current': { number: stats.likes },
      'Comments Current': { number: stats.comments },
      'Shares Current': { number: stats.shares },
      'Last Synced': { date: { start: new Date().toISOString() } },
      'Status': { status: { name: 'Tracking' } }
    }

    // YouTube-specific stats
    if (stats.watchTimeHours !== null) {
      properties['Watch Time Current'] = { number: stats.watchTimeHours }
    }
    if (stats.avgViewDuration !== null) {
      properties['Avg View Duration Current'] = { number: stats.avgViewDuration }
    }
    if (stats.retentionPercent !== null) {
      properties['Retention Current'] = { number: stats.retentionPercent }
    }

    // Calculate engagement rate
    if (stats.views > 0) {
      const engagementRate = ((stats.likes + stats.comments + stats.shares) / stats.views) * 100
      properties['Engagement Rate'] = { number: Math.round(engagementRate * 100) / 100 }
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    })

    return true
  } catch (error) {
    console.error('Error updating current stats:', error.message)
    return false
  }
}

/**
 * Save milestone stats (D1, D7, D30, D90)
 */
export async function saveMilestoneStats(pageId, milestone, stats) {
  if (!notion) {
    throw new Error('Notion Analytics not initialized')
  }

  const prefix = `D${milestone}`
  
  try {
    const properties = {
      [`Views ${prefix}`]: { number: stats.views },
      [`Likes ${prefix}`]: { number: stats.likes },
      [`Comments ${prefix}`]: { number: stats.comments },
      [`Shares ${prefix}`]: { number: stats.shares },
      [`${prefix} Recorded`]: { date: { start: new Date().toISOString() } }
    }

    // YouTube-specific stats
    if (stats.watchTimeHours !== null) {
      properties[`Watch Time ${prefix}`] = { number: stats.watchTimeHours }
    }
    if (stats.retentionPercent !== null) {
      properties[`Retention ${prefix}`] = { number: stats.retentionPercent }
    }

    // Update status based on milestone
    const statusMap = {
      1: 'D1 Complete',
      7: 'D7 Complete',
      30: 'D30 Complete',
      90: 'D90 Complete'
    }
    if (statusMap[milestone]) {
      properties['Status'] = { status: { name: statusMap[milestone] } }
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    })

    return true
  } catch (error) {
    console.error(`Error saving D${milestone} stats:`, error.message)
    return false
  }
}

/**
 * Save milestone analysis
 */
export async function saveMilestoneAnalysis(pageId, milestone, analysis) {
  if (!notion) {
    throw new Error('Notion Analytics not initialized')
  }

  try {
    const properties = {
      [`Analysis D${milestone}`]: {
        rich_text: [{ text: { content: truncate(analysis.summary, 2000) } }]
      }
    }

    // Save additional analysis fields for D30 (most complete analysis)
    if (milestone === 30 || milestone === 90) {
      if (analysis.whyItWorked) {
        properties['Why It Worked'] = {
          rich_text: [{ text: { content: truncate(analysis.whyItWorked, 2000) } }]
        }
      }
      if (analysis.whatCouldImprove) {
        properties['What Could Improve'] = {
          rich_text: [{ text: { content: truncate(analysis.whatCouldImprove, 2000) } }]
        }
      }
      if (analysis.performanceScore) {
        properties['Performance Score'] = { number: analysis.performanceScore }
      }
      if (analysis.performanceTrend) {
        properties['Performance Trend'] = { select: { name: analysis.performanceTrend } }
      }
      if (analysis.suggestedFollowUp) {
        properties['Suggested Follow-up'] = {
          rich_text: [{ text: { content: truncate(analysis.suggestedFollowUp, 2000) } }]
        }
      }
    }

    // Evergreen status for D90
    if (milestone === 90 && analysis.evergreenStatus) {
      properties['Evergreen Status'] = { select: { name: analysis.evergreenStatus } }
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    })

    return true
  } catch (error) {
    console.error(`Error saving D${milestone} analysis:`, error.message)
    return false
  }
}

/**
 * Update the linked idea's virality score based on actual performance
 */
export async function updateIdeaViralityFromPerformance(ideaPageId, performanceScore, actualViews) {
  if (!notion || !ideasDbId) {
    throw new Error('Notion not initialized')
  }

  try {
    const properties = {
      'Actual Performance': { number: performanceScore },
      'Posted URL': { url: null } // Will be set separately if needed
    }

    await notion.pages.update({
      page_id: ideaPageId,
      properties
    })

    return true
  } catch (error) {
    console.error('Error updating idea virality:', error.message)
    return false
  }
}

/**
 * Create a follow-up idea in the Ideas database
 */
export async function createFollowUpIdea(suggestion, originalVideo) {
  if (!notion || !ideasDbId) {
    throw new Error('Notion not initialized')
  }

  try {
    const properties = {
      'Name': {
        title: [{ text: { content: `🤖 ${suggestion.title}` } }]
      },
      'AI Review': {
        rich_text: [{ text: { content: truncate(suggestion.reason, 2000) } }]
      }
    }

    // Link back to the original video's analytics
    if (originalVideo.id) {
      // Note: This would require a relation property in Ideas DB pointing to Analytics
    }

    const response = await notion.pages.create({
      parent: { database_id: ideasDbId },
      properties
    })

    return response.id
  } catch (error) {
    console.error('Error creating follow-up idea:', error.message)
    return null
  }
}

/**
 * Mark follow-up as created
 */
export async function markFollowUpCreated(pageId, followUpId) {
  if (!notion) {
    throw new Error('Notion not initialized')
  }

  try {
    const properties = {
      'Follow-up Created': { checkbox: true }
    }

    if (followUpId) {
      properties['Linked Follow-up'] = {
        relation: [{ id: followUpId }]
      }
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    })

    return true
  } catch (error) {
    console.error('Error marking follow-up created:', error.message)
    return false
  }
}

/**
 * Get top performing videos for reporting
 */
export async function getTopPerformers(limit = 10, days = 30) {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  try {
    const response = await notion.databases.query({
      database_id: analyticsDbId,
      filter: {
        and: [
          {
            property: 'Posted Date',
            date: { after: cutoffDate.toISOString() }
          },
          {
            property: 'Views Current',
            number: { is_not_empty: true }
          }
        ]
      },
      sorts: [
        { property: 'Views Current', direction: 'descending' }
      ],
      page_size: limit
    })

    return response.results.map(page => parseAnalyticsPage(page))
  } catch (error) {
    console.error('Error fetching top performers:', error.message)
    return []
  }
}

/**
 * Get videos posted this week for weekly report
 */
export async function getThisWeeksVideos() {
  if (!notion || !analyticsDbId) {
    throw new Error('Notion Analytics not initialized')
  }

  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)

  try {
    const response = await notion.databases.query({
      database_id: analyticsDbId,
      filter: {
        property: 'Posted Date',
        date: { after: weekAgo.toISOString() }
      },
      sorts: [
        { property: 'Views Current', direction: 'descending' }
      ]
    })

    return response.results.map(page => parseAnalyticsPage(page))
  } catch (error) {
    console.error('Error fetching this week\'s videos:', error.message)
    return []
  }
}

/**
 * Parse a Notion Analytics page into a clean object
 */
function parseAnalyticsPage(page) {
  const props = page.properties

  return {
    id: page.id,
    title: getTitle(props.Name),
    platform: getSelect(props.Platform),
    videoId: getRichText(props['Video ID']),
    url: getUrl(props.URL),
    postedDate: getDate(props['Posted Date']),
    linkedIdeaId: getRelation(props['Linked Idea']),
    status: getStatus(props.Status),
    
    // Current stats
    viewsCurrent: getNumber(props['Views Current']),
    likesCurrent: getNumber(props['Likes Current']),
    commentsCurrent: getNumber(props['Comments Current']),
    sharesCurrent: getNumber(props['Shares Current']),
    watchTimeCurrent: getNumber(props['Watch Time Current']),
    retentionCurrent: getNumber(props['Retention Current']),
    lastSynced: getDate(props['Last Synced']),
    
    // D1 stats
    viewsD1: getNumber(props['Views D1']),
    likesD1: getNumber(props['Likes D1']),
    commentsD1: getNumber(props['Comments D1']),
    sharesD1: getNumber(props['Shares D1']),
    analysisD1: getRichText(props['Analysis D1']),
    d1Recorded: getDate(props['D1 Recorded']),
    
    // D7 stats
    viewsD7: getNumber(props['Views D7']),
    likesD7: getNumber(props['Likes D7']),
    commentsD7: getNumber(props['Comments D7']),
    sharesD7: getNumber(props['Shares D7']),
    analysisD7: getRichText(props['Analysis D7']),
    d7Recorded: getDate(props['D7 Recorded']),
    
    // D30 stats
    viewsD30: getNumber(props['Views D30']),
    likesD30: getNumber(props['Likes D30']),
    commentsD30: getNumber(props['Comments D30']),
    sharesD30: getNumber(props['Shares D30']),
    analysisD30: getRichText(props['Analysis D30']),
    d30Recorded: getDate(props['D30 Recorded']),
    
    // D90 stats
    viewsD90: getNumber(props['Views D90']),
    likesD90: getNumber(props['Likes D90']),
    commentsD90: getNumber(props['Comments D90']),
    sharesD90: getNumber(props['Shares D90']),
    analysisD90: getRichText(props['Analysis D90']),
    d90Recorded: getDate(props['D90 Recorded']),
    
    // Analysis
    engagementRate: getNumber(props['Engagement Rate']),
    performanceScore: getNumber(props['Performance Score']),
    performanceTrend: getSelect(props['Performance Trend']),
    evergreenStatus: getSelect(props['Evergreen Status']),
    whyItWorked: getRichText(props['Why It Worked']),
    whatCouldImprove: getRichText(props['What Could Improve']),
    suggestedFollowUp: getRichText(props['Suggested Follow-up']),
    
    // Follow-up tracking
    createFollowUp: getCheckbox(props['Create Follow-up']),
    followUpCreated: getCheckbox(props['Follow-up Created']),
    
    // Meta
    createdAt: page.created_time,
    updatedAt: page.last_edited_time
  }
}

// Helper functions
function getTitle(prop) {
  if (!prop || prop.type !== 'title') return ''
  return prop.title.map(t => t.plain_text).join('')
}

function getRichText(prop) {
  if (!prop || prop.type !== 'rich_text') return ''
  return prop.rich_text.map(t => t.plain_text).join('')
}

function getSelect(prop) {
  if (!prop || prop.type !== 'select' || !prop.select) return null
  return prop.select.name
}

function getStatus(prop) {
  if (!prop || prop.type !== 'status' || !prop.status) return null
  return prop.status.name
}

function getNumber(prop) {
  if (!prop || prop.type !== 'number') return null
  return prop.number
}

function getDate(prop) {
  if (!prop || prop.type !== 'date' || !prop.date) return null
  return prop.date.start
}

function getUrl(prop) {
  if (!prop || prop.type !== 'url') return null
  return prop.url
}

function getCheckbox(prop) {
  if (!prop || prop.type !== 'checkbox') return false
  return prop.checkbox
}

function getRelation(prop) {
  if (!prop || prop.type !== 'relation' || !prop.relation || prop.relation.length === 0) return null
  return prop.relation[0].id
}

function truncate(str, maxLength) {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}
