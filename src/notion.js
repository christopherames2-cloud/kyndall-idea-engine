// kyndall-idea-engine/src/notion.js
// Notion API service - reads ideas, writes AI enrichments back

import { Client } from '@notionhq/client'

let notion = null
let databaseId = null

/**
 * Initialize the Notion client
 */
export function initNotion(apiKey, dbId) {
  notion = new Client({ auth: apiKey })
  databaseId = dbId
  console.log('✅ Notion client initialized')
}

/**
 * Get all ideas that need analysis
 * (ideas without a virality score or where content changed since last analysis)
 * Excludes items with "Posted" status
 */
export async function getIdeasNeedingAnalysis() {
  if (!notion || !databaseId) {
    throw new Error('Notion not initialized')
  }

  try {
    // Query for ideas that:
    // 1. Don't have a virality score yet, OR
    // 2. Have been updated since last analysis
    // AND exclude anything with "Posted" status
    const response = await notion.databases.query({
      database_id: databaseId,
      filter: {
        and: [
          {
            or: [
              {
                property: 'Virality Score',
                number: {
                  is_empty: true
                }
              },
              {
                property: 'Needs Reanalysis',
                checkbox: {
                  equals: true
                }
              }
            ]
          },
          {
            property: 'Status',
            select: {
              does_not_equal: 'Posted'
            }
          }
        ]
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'descending'
        }
      ]
    })

    const ideas = response.results.map(page => parseNotionPage(page))
    return ideas.filter(idea => idea.title) // Only return ideas with a title
  } catch (error) {
    console.error('Error fetching ideas from Notion:', error.message)
    return []
  }
}

/**
 * Get all ideas (for listing/debugging)
 */
export async function getAllIdeas() {
  if (!notion || !databaseId) {
    throw new Error('Notion not initialized')
  }

  const response = await notion.databases.query({
    database_id: databaseId,
    sorts: [
      {
        timestamp: 'created_time',
        direction: 'descending'
      }
    ]
  })

  return response.results.map(page => parseNotionPage(page))
}

/**
 * Parse a Notion page into a clean object
 */
function parseNotionPage(page) {
  const props = page.properties

  return {
    id: page.id,
    title: getTitle(props.Name || props.Idea || props.Title),
    platform: getMultiSelect(props.Platform),        // Multi-select: YouTube, TikTok, Instagram, UGC, Shorts
    status: getSelect(props.Status),            // Single-select: YouTube Idea, Film, Posted, etc.
    paidGifted: getMultiSelect(props['Paid/Gifted']), // Multi-select: Paid, Gifted
    dueDate: getDate(props['Due Date']),
    viralityScore: getNumber(props['Virality Score']),
    lastAnalyzed: getDate(props['Last Analyzed']),
    needsReanalysis: getCheckbox(props['Needs Reanalysis']),
    createdAt: page.created_time,
    updatedAt: page.last_edited_time,
  }
}

/**
 * Write AI analysis back to a Notion page
 */
export async function writeAnalysisToNotion(pageId, analysis) {
  if (!notion) {
    throw new Error('Notion not initialized')
  }

  try {
    // Build the properties object
    const properties = {
      'Virality Score': {
        number: analysis.viralityScore
      },
      'Score Breakdown': {
        rich_text: [{ text: { content: truncate(analysis.scoreBreakdown, 2000) } }]
      },
      'AI Review': {
        rich_text: [{ text: { content: truncate(analysis.aiReview, 2000) } }]
      },
      'Hook 1': {
        rich_text: [{ text: { content: truncate(analysis.hook1, 500) } }]
      },
      'Hook 2': {
        rich_text: [{ text: { content: truncate(analysis.hook2, 500) } }]
      },
      'Hook 3': {
        rich_text: [{ text: { content: truncate(analysis.hook3, 500) } }]
      },
      'Description': {
        rich_text: [{ text: { content: truncate(analysis.description, 2000) } }]
      },
      'Hashtags': {
        rich_text: [{ text: { content: truncate(analysis.hashtags, 2000) } }]
      },
      'Best Format': {
        select: { name: analysis.bestFormat }
      },
      'Similar Content': {
        rich_text: [{ text: { content: truncate(analysis.similarContent, 1000) } }]
      },
      'Content Gap': {
        rich_text: [{ text: { content: truncate(analysis.contentGap, 1000) } }]
      },
      'Trending Relevance': {
        rich_text: [{ text: { content: truncate(analysis.trendingRelevance, 500) } }]
      },
      'Posting Time': {
        rich_text: [{ text: { content: truncate(analysis.postingTime, 500) } }]
      },
      'Last Analyzed': {
        date: { start: new Date().toISOString() }
      },
      'Needs Reanalysis': {
        checkbox: false
      }
    }

    // Add Additional Formats if provided (multi-select)
    if (analysis.additionalFormats && analysis.additionalFormats.length > 0) {
      properties['Additional Formats'] = {
        multi_select: analysis.additionalFormats.map(format => ({ name: format }))
      }
    }

    await notion.pages.update({
      page_id: pageId,
      properties
    })

    return true
  } catch (error) {
    console.error('Error writing to Notion:', error.message)
    
    // If properties don't exist, provide helpful error
    if (error.code === 'validation_error') {
      console.error('\n⚠️  Some properties may not exist in your Notion database.')
      console.error('   Please ensure your database has these properties:')
      console.error('   - Virality Score (Number)')
      console.error('   - Score Breakdown (Text)')
      console.error('   - AI Review (Text)')
      console.error('   - Hook 1, Hook 2, Hook 3 (Text)')
      console.error('   - Description (Text)')
      console.error('   - Hashtags (Text)')
      console.error('   - Best Format (Select)')
      console.error('   - Additional Formats (Multi-select)')
      console.error('   - Similar Content (Text)')
      console.error('   - Content Gap (Text)')
      console.error('   - Trending Relevance (Text)')
      console.error('   - Posting Time (Text)')
      console.error('   - Last Analyzed (Date)')
      console.error('   - Needs Reanalysis (Checkbox)')
    }
    
    return false
  }
}

// ============ Helper functions to extract Notion property values ============

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

function getMultiSelect(prop) {
  if (!prop || prop.type !== 'multi_select') return []
  return prop.multi_select.map(item => item.name)
}

function getNumber(prop) {
  if (!prop || prop.type !== 'number') return null
  return prop.number
}

function getDate(prop) {
  if (!prop || prop.type !== 'date' || !prop.date) return null
  return prop.date.start
}

function getCheckbox(prop) {
  if (!prop || prop.type !== 'checkbox') return false
  return prop.checkbox
}

function truncate(str, maxLength) {
  if (!str) return ''
  if (str.length <= maxLength) return str
  return str.substring(0, maxLength - 3) + '...'
}
