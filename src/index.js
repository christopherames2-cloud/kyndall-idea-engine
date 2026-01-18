// kyndall-idea-engine/src/index.js
// Kyndall Idea Engine
// Monitors Notion for new content ideas and enriches them with AI analysis
// Writes virality scores, hooks, and insights back to Notion
// Now includes Analytics module for performance tracking!

import cron from 'node-cron'
import http from 'http'
import { initNotion, getIdeasNeedingAnalysis, writeAnalysisToNotion, createIdeaInNotion, archivePage } from './notion.js'
import { initSanity, getContentContextForClaude } from './sanity.js'
import { initClaude, analyzeIdea, isHelpRequest, extractHelpTopic, brainstormIdeas } from './claude.js'
import { 
  initAnalytics, 
  runAnalyticsCycle, 
  runWeeklyReport, 
  previewWeeklyReport,
  getSummary,
  isSunday,
  getAnalyticsStatus 
} from './analytics/index.js'

// Configuration from environment
const config = {
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_IDEAS_DATABASE_ID,
    analyticsDbId: process.env.NOTION_ANALYTICS_DATABASE_ID
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID || 'f9drkp1w',
    dataset: process.env.SANITY_DATASET || 'production',
    token: process.env.SANITY_API_TOKEN  // Needed for TikTok token access
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY,
    channelId: process.env.YOUTUBE_CHANNEL_ID
  },
  tiktok: {
    clientKey: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET
    // Tokens now fetched from Sanity (shared with kyndall-site)
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    recipientEmail: process.env.REPORT_EMAIL || 'hello@kyndallames.com'
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15,
  analyticsInterval: parseInt(process.env.ANALYTICS_INTERVAL_HOURS) || 4,
  port: parseInt(process.env.PORT) || 8080
}

// Stats tracking
const stats = {
  totalAnalyzed: 0,
  totalBrainstormed: 0,
  lastIdeaRun: null,
  lastAnalyticsRun: null,
  lastWeeklyReport: null,
  errors: 0,
  isRunning: false,
  analyticsRunning: false
}

/**
 * Validate required configuration
 */
function validateConfig() {
  const required = [
    ['NOTION_API_KEY', config.notion.apiKey],
    ['NOTION_IDEAS_DATABASE_ID', config.notion.databaseId],
    ['ANTHROPIC_API_KEY', config.anthropic.apiKey]
  ]

  const missing = required.filter(([name, value]) => !value)
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:')
    missing.forEach(([name]) => console.error(`   - ${name}`))
    process.exit(1)
  }
}

/**
 * Process a help request - brainstorm high-viral ideas
 */
async function processHelpRequest(idea, existingContent) {
  const topic = extractHelpTopic(idea)
  console.log(`\n🆘 Help request detected: "${topic}"`)
  console.log(`   Brainstorming 5 high-viral ideas...`)

  const ideas = await brainstormIdeas(topic, existingContent)
  
  if (ideas.length === 0) {
    console.log('   ❌ No ideas generated')
    return { created: 0, archived: false }
  }

  console.log(`   ✅ Generated ${ideas.length} ideas`)
  
  // Create each idea in Notion
  let created = 0
  for (const newIdea of ideas) {
    console.log(`   📝 Creating: "🤖 ${newIdea.title}" (Score: ${newIdea.viralityScore})`)
    const pageId = await createIdeaInNotion(newIdea)
    if (pageId) {
      created++
    }
  }

  // Archive the original help request
  console.log(`   🗑️  Archiving help request...`)
  const archived = await archivePage(idea.id)
  
  if (archived) {
    console.log(`   ✅ Help request archived`)
  }

  stats.totalBrainstormed += created
  return { created, archived }
}

/**
 * Process new ideas - main workflow
 */
async function processNewIdeas() {
  if (stats.isRunning) {
    console.log('⏳ Already running, skipping...')
    return { skipped: true }
  }

  stats.isRunning = true
  
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`💡 Checking for new ideas - ${new Date().toLocaleString()}`)
  console.log('═'.repeat(50))

  let analyzed = 0
  let errors = 0

  try {
    // Get ideas that need analysis
    const ideas = await getIdeasNeedingAnalysis()
    
    if (ideas.length === 0) {
      console.log('   No new ideas to analyze')
      stats.lastIdeaRun = new Date()
      stats.isRunning = false
      return { analyzed: 0, errors: 0 }
    }

    console.log(`   Found ${ideas.length} idea(s) to analyze\n`)

    // Get existing content context from Sanity (for Claude to reference)
    console.log('📚 Fetching existing content for context...')
    const existingContent = await getContentContextForClaude()
    console.log(`   ${existingContent.stats?.totalPosts || 0} posts, ${existingContent.stats?.totalArticles || 0} articles loaded\n`)

    // Process each idea
    for (const idea of ideas) {
      try {
        // Check if this is a help request
        if (isHelpRequest(idea)) {
          await processHelpRequest(idea, existingContent)
          continue
        }

        // Normal analysis mode
        console.log(`\n💭 Analyzing: "${idea.title}"`)
        console.log(`   Platform: ${Array.isArray(idea.platform) ? idea.platform.join(', ') : 'Not set'}`)
        console.log(`   Status: ${idea.status || 'Not set'}`)

        console.log('   🤖 Running AI analysis...')
        const analysis = await analyzeIdea(idea, existingContent)

        if (analysis) {
          console.log(`   ✅ Virality Score: ${analysis.viralityScore}/100`)
          console.log(`   📱 Best Format: ${analysis.bestFormat}`)
          if (analysis.additionalFormats.length > 0) {
            console.log(`   📱 Also works for: ${analysis.additionalFormats.join(', ')}`)
          }

          console.log('   📝 Writing to Notion...')
          const success = await writeAnalysisToNotion(idea.id, analysis)
          
          if (success) {
            console.log('   ✅ Analysis saved to Notion')
            analyzed++
            stats.totalAnalyzed++
          } else {
            console.log('   ❌ Failed to save analysis')
            errors++
          }
        } else {
          console.log('   ❌ Analysis failed')
          errors++
        }
      } catch (ideaError) {
        console.error(`   ❌ Error processing idea: ${ideaError.message}`)
        errors++
      }
    }

    console.log(`\n✨ Analysis complete!`)
    console.log(`   Ideas analyzed: ${analyzed}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total analyzed (all time): ${stats.totalAnalyzed}`)

  } catch (error) {
    console.error('❌ Error processing ideas:', error.message)
    stats.errors++
    errors++
  }

  stats.lastIdeaRun = new Date()
  stats.isRunning = false
  return { analyzed, errors }
}

/**
 * Create HTTP server for health checks and manual triggers
 */
function createServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${config.port}`)
    
    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'healthy',
        service: 'kyndall-idea-engine',
        isRunning: stats.isRunning,
        analyticsRunning: stats.analyticsRunning,
        totalAnalyzed: stats.totalAnalyzed,
        totalBrainstormed: stats.totalBrainstormed,
        lastIdeaRun: stats.lastIdeaRun,
        lastAnalyticsRun: stats.lastAnalyticsRun,
        lastWeeklyReport: stats.lastWeeklyReport,
        errors: stats.errors
      }))
      return
    }

    // Status endpoint
    if (url.pathname === '/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        ...stats,
        checkInterval: config.checkInterval,
        uptime: process.uptime()
      }))
      return
    }

    // Manual trigger endpoint
    if (url.pathname === '/analyze' && req.method === 'POST') {
      console.log('🔄 Manual analysis triggered via API')
      
      // Run async, respond immediately
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        message: 'Analysis started',
        isRunning: stats.isRunning 
      }))
      
      // Process in background
      processNewIdeas().catch(console.error)
      return
    }

    // Analytics trigger endpoint
    if (url.pathname === '/analytics' && req.method === 'POST') {
      console.log('🔄 Manual analytics triggered via API')
      
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ 
        message: 'Analytics cycle started',
        analyticsRunning: stats.analyticsRunning 
      }))
      
      // Process in background
      runAnalytics().catch(console.error)
      return
    }

    // Analytics summary endpoint
    if (url.pathname === '/analytics/summary' && req.method === 'GET') {
      try {
        const summary = await getSummary()
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(summary))
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      }
      return
    }

    // Weekly report preview endpoint
    if (url.pathname === '/report/preview' && req.method === 'GET') {
      try {
        const html = await previewWeeklyReport()
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message }))
      }
      return
    }

    // Send weekly report manually
    if (url.pathname === '/report/send' && req.method === 'POST') {
      console.log('📧 Manual weekly report triggered')
      
      res.writeHead(202, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'Weekly report sending...' }))
      
      runWeeklyReport().then(success => {
        if (success) stats.lastWeeklyReport = new Date()
      }).catch(console.error)
      return
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      error: 'Not found',
      endpoints: [
        'GET /', 
        'GET /health', 
        'GET /status', 
        'POST /analyze',
        'POST /analytics',
        'GET /analytics/summary',
        'GET /report/preview',
        'POST /report/send'
      ]
    }))
  })

  server.listen(config.port, () => {
    console.log(`🌐 HTTP server listening on port ${config.port}`)
    console.log(`   Health: http://localhost:${config.port}/health`)
    console.log(`   Status: http://localhost:${config.port}/status`)
    console.log(`   Trigger: POST http://localhost:${config.port}/analyze`)
  })

  return server
}

/**
 * Run analytics cycle
 */
async function runAnalytics() {
  if (stats.analyticsRunning) {
    console.log('⏳ Analytics already running, skipping...')
    return
  }

  stats.analyticsRunning = true
  
  try {
    await runAnalyticsCycle()
    stats.lastAnalyticsRun = new Date()
  } catch (error) {
    console.error('❌ Analytics error:', error.message)
    stats.errors++
  }
  
  stats.analyticsRunning = false
}

/**
 * Check and send weekly report (Sundays at 9am)
 */
async function checkWeeklyReport() {
  if (isSunday()) {
    console.log('📧 Sunday detected - sending weekly report...')
    const success = await runWeeklyReport()
    if (success) {
      stats.lastWeeklyReport = new Date()
    }
  }
}

/**
 * Initialize and start the engine
 */
async function main() {
  console.log('🚀 Kyndall Idea Engine Starting...\n')
  console.log('💡 Monitors Notion for new content ideas')
  console.log('🤖 Enriches ideas with AI-powered insights')
  console.log('📊 Virality scores, hooks, and strategic advice')
  console.log('🆘 "help [topic]" - Brainstorms 5 high-viral ideas')
  console.log('📈 Analytics tracking for YouTube & TikTok')
  console.log('📧 Weekly performance reports')
  console.log('')

  validateConfig()

  // Initialize core services
  initNotion(config.notion.apiKey, config.notion.databaseId)
  initSanity(config.sanity.projectId, config.sanity.dataset)
  initClaude(config.anthropic.apiKey)

  // Initialize analytics module
  initAnalytics({
    youtube: config.youtube,
    tiktok: config.tiktok,
    sanity: config.sanity,  // For TikTok token access
    notion: {
      apiKey: config.notion.apiKey,
      analyticsDbId: config.notion.analyticsDbId,
      ideasDbId: config.notion.databaseId
    },
    anthropic: config.anthropic,
    resend: config.resend
  })

  console.log('✅ All services initialized')
  console.log(`⏰ Ideas check: every ${config.checkInterval} minutes`)
  console.log(`📊 Analytics sync: every ${config.analyticsInterval} hours`)
  console.log(`📧 Weekly report: Sundays at 9am\n`)

  // Start HTTP server for health checks
  createServer()

  // Run immediately on start
  await processNewIdeas()
  
  // Run analytics on start (if configured)
  if (config.notion.analyticsDbId) {
    await runAnalytics()
  }

  // Schedule idea checks (every 15 minutes)
  const ideaCron = `*/${config.checkInterval} * * * *`
  cron.schedule(ideaCron, processNewIdeas)

  // Schedule analytics (every 4 hours)
  const analyticsCron = `0 */${config.analyticsInterval} * * *`
  cron.schedule(analyticsCron, runAnalytics)

  // Schedule weekly report check (every day at 9am, but only sends on Sunday)
  cron.schedule('0 9 * * *', checkWeeklyReport)

  console.log('\n🎯 Idea Engine running.')
  console.log('   New Notion ideas → AI analysis → Enriched back to Notion')
  console.log('   "help [topic]" → 5 high-viral AI ideas → New Notion pages')
  console.log('   Video stats → Milestone analysis → Performance insights')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
