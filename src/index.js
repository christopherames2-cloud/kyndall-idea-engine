// kyndall-idea-engine/src/index.js
// Kyndall Idea Engine
// Monitors Notion for new content ideas and enriches them with AI analysis
// Writes virality scores, hooks, and insights back to Notion

import cron from 'node-cron'
import http from 'http'
import { initNotion, getIdeasNeedingAnalysis, writeAnalysisToNotion, createIdeaInNotion, archivePage } from './notion.js'
import { initSanity, getContentContextForClaude } from './sanity.js'
import { initClaude, analyzeIdea, isHelpRequest, extractHelpTopic, brainstormIdeas } from './claude.js'

// Configuration from environment
const config = {
  notion: {
    apiKey: process.env.NOTION_API_KEY,
    databaseId: process.env.NOTION_IDEAS_DATABASE_ID
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY
  },
  sanity: {
    projectId: process.env.SANITY_PROJECT_ID || 'f9drkp1w',
    dataset: process.env.SANITY_DATASET || 'production'
  },
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15,
  port: parseInt(process.env.PORT) || 8080
}

// Stats tracking
const stats = {
  totalAnalyzed: 0,
  totalBrainstormed: 0,
  lastRun: null,
  errors: 0,
  isRunning: false
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
      stats.lastRun = new Date()
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

  stats.lastRun = new Date()
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
        totalAnalyzed: stats.totalAnalyzed,
        totalBrainstormed: stats.totalBrainstormed,
        lastRun: stats.lastRun,
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

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ 
      error: 'Not found',
      endpoints: ['GET /', 'GET /health', 'GET /status', 'POST /analyze']
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
 * Initialize and start the engine
 */
async function main() {
  console.log('🚀 Kyndall Idea Engine Starting...\n')
  console.log('💡 Monitors Notion for new content ideas')
  console.log('🤖 Enriches ideas with AI-powered insights')
  console.log('📊 Virality scores, hooks, and strategic advice')
  console.log('🆘 "help [topic]" - Brainstorms 5 high-viral ideas')
  console.log('')

  validateConfig()

  // Initialize services
  initNotion(config.notion.apiKey, config.notion.databaseId)
  initSanity(config.sanity.projectId, config.sanity.dataset)
  initClaude(config.anthropic.apiKey)

  console.log('✅ All services initialized')
  console.log(`⏰ Checking for new ideas every ${config.checkInterval} minutes\n`)

  // Start HTTP server for health checks
  createServer()

  // Run immediately on start
  await processNewIdeas()

  // Schedule recurring checks
  const cronExpression = `*/${config.checkInterval} * * * *`
  cron.schedule(cronExpression, processNewIdeas)

  console.log('\n🎯 Idea Engine running.')
  console.log('   New Notion ideas → AI analysis → Enriched back to Notion')
  console.log('   "help [topic]" → 5 high-viral AI ideas → New Notion pages')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
