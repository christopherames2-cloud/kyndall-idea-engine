// kyndall-idea-engine/src/index.js
// Kyndall Idea Engine
// Monitors Notion for new content ideas and enriches them with AI analysis
// Writes virality scores, hooks, and insights back to Notion

import cron from 'node-cron'
import { initNotion, getIdeasNeedingAnalysis, writeAnalysisToNotion } from './notion.js'
import { initSanity, getContentContextForClaude } from './sanity.js'
import { initClaude, analyzeIdea } from './claude.js'

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
  checkInterval: parseInt(process.env.CHECK_INTERVAL_MINUTES) || 15
}

// Stats tracking
const stats = {
  totalAnalyzed: 0,
  lastRun: null,
  errors: 0
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
 * Process new ideas - main workflow
 */
async function processNewIdeas() {
  console.log(`\n${'═'.repeat(50)}`)
  console.log(`💡 Checking for new ideas - ${new Date().toLocaleString()}`)
  console.log('═'.repeat(50))

  try {
    // Get ideas that need analysis
    const ideas = await getIdeasNeedingAnalysis()
    
    if (ideas.length === 0) {
      console.log('   No new ideas to analyze')
      stats.lastRun = new Date()
      return
    }

    console.log(`   Found ${ideas.length} idea(s) to analyze\n`)

    // Get existing content context from Sanity (for Claude to reference)
    console.log('📚 Fetching existing content for context...')
    const existingContent = await getContentContextForClaude()
    console.log(`   ${existingContent.stats?.totalPosts || 0} posts, ${existingContent.stats?.totalArticles || 0} articles loaded\n`)

    let analyzed = 0
    let errors = 0

    // Process each idea
    for (const idea of ideas) {
      console.log(`\n💭 Analyzing: "${idea.title}"`)
      console.log(`   Category: ${idea.category || 'Not set'}`)
      console.log(`   Priority: ${idea.priority || 'Not set'}`)

      try {
        // Analyze with Claude
        console.log('   🤖 Running AI analysis...')
        const analysis = await analyzeIdea(idea, existingContent)

        if (!analysis) {
          console.log('   ❌ Analysis failed')
          errors++
          continue
        }

        console.log(`   ✅ Virality Score: ${analysis.viralityScore}/100`)
        console.log(`   📱 Best Format: ${analysis.bestFormat}`)
        if (analysis.additionalFormats && analysis.additionalFormats.length > 0) {
          console.log(`   📱 Also works for: ${analysis.additionalFormats.join(', ')}`)
        }

        // Write back to Notion
        console.log('   📝 Writing to Notion...')
        const success = await writeAnalysisToNotion(idea.id, analysis)

        if (success) {
          console.log('   ✅ Analysis saved to Notion')
          analyzed++
        } else {
          console.log('   ⚠️  Failed to save to Notion')
          errors++
        }

        // Small delay to avoid rate limits
        if (ideas.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`)
        errors++
      }
    }

    // Update stats
    stats.totalAnalyzed += analyzed
    stats.errors += errors
    stats.lastRun = new Date()

    console.log(`\n✨ Analysis complete!`)
    console.log(`   Ideas analyzed: ${analyzed}`)
    console.log(`   Errors: ${errors}`)
    console.log(`   Total analyzed (all time): ${stats.totalAnalyzed}`)

  } catch (error) {
    console.error('❌ Error processing ideas:', error.message)
    stats.errors++
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
  console.log('')

  validateConfig()

  // Initialize services
  initNotion(config.notion.apiKey, config.notion.databaseId)
  initSanity(config.sanity.projectId, config.sanity.dataset)
  initClaude(config.anthropic.apiKey)

  console.log('✅ All services initialized')
  console.log(`⏰ Checking for new ideas every ${config.checkInterval} minutes\n`)

  // Run immediately on start
  await processNewIdeas()

  // Schedule recurring checks
  const cronExpression = `*/${config.checkInterval} * * * *`
  cron.schedule(cronExpression, processNewIdeas)

  console.log('\n🎯 Idea Engine running.')
  console.log('   New Notion ideas → AI analysis → Enriched back to Notion')
  console.log('   Press Ctrl+C to stop')
}

main().catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})
