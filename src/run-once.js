// kyndall-idea-engine/src/run-once.js
// Run the idea engine once (for testing)

import { initNotion, getIdeasNeedingAnalysis, getAllIdeas, writeAnalysisToNotion } from './notion.js'
import { initSanity, getContentContextForClaude, getContentStats } from './sanity.js'
import { initClaude, analyzeIdea } from './claude.js'

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
  }
}

async function runOnce() {
  console.log('🚀 Running Idea Engine once (test mode)...\n')

  // Check config
  if (!config.notion.apiKey) {
    console.error('❌ Missing NOTION_API_KEY')
    process.exit(1)
  }
  if (!config.notion.databaseId) {
    console.error('❌ Missing NOTION_IDEAS_DATABASE_ID')
    process.exit(1)
  }
  if (!config.anthropic.apiKey) {
    console.error('❌ Missing ANTHROPIC_API_KEY')
    process.exit(1)
  }

  // Initialize
  console.log('Initializing services...')
  initNotion(config.notion.apiKey, config.notion.databaseId)
  initSanity(config.sanity.projectId, config.sanity.dataset)
  initClaude(config.anthropic.apiKey)
  console.log('')

  // Test 1: Fetch content stats from Sanity
  console.log('📊 Fetching content stats from Sanity...')
  const stats = await getContentStats()
  if (stats) {
    console.log(`   Total posts: ${stats.totalPosts}`)
    console.log(`   Total articles: ${stats.totalArticles}`)
    console.log(`   Categories:`)
    Object.entries(stats.categories || {}).forEach(([cat, count]) => {
      console.log(`      - ${cat}: ${count}`)
    })
  } else {
    console.log('   ⚠️  Could not fetch stats (Sanity may be empty)')
  }
  console.log('')

  // Test 2: List all ideas in Notion
  console.log('📋 Fetching all ideas from Notion...')
  const allIdeas = await getAllIdeas()
  console.log(`   Found ${allIdeas.length} total ideas\n`)

  if (allIdeas.length > 0) {
    console.log('   Recent ideas:')
    allIdeas.slice(0, 5).forEach(idea => {
      const score = idea.viralityScore ? `(Score: ${idea.viralityScore})` : '(Not analyzed)'
      console.log(`   - ${idea.title} ${score}`)
    })
    console.log('')
  }

  // Test 3: Get ideas needing analysis
  console.log('🔍 Checking for ideas needing analysis...')
  const needsAnalysis = await getIdeasNeedingAnalysis()
  console.log(`   Found ${needsAnalysis.length} ideas to analyze\n`)

  if (needsAnalysis.length === 0) {
    console.log('✅ All ideas are already analyzed!')
    console.log('   To re-analyze an idea, check "Needs Reanalysis" in Notion')
    return
  }

  // Test 4: Analyze the first idea (but don't save by default)
  const testIdea = needsAnalysis[0]
  console.log('═'.repeat(50))
  console.log(`💭 Test analyzing: "${testIdea.title}"`)
  console.log('═'.repeat(50))
  console.log(`   Category: ${testIdea.category || 'Not set'}`)
  console.log(`   Notes: ${testIdea.notes || 'None'}`)
  console.log('')

  // Get existing content for context
  console.log('📚 Loading existing content context...')
  const existingContent = await getContentContextForClaude()
  console.log(`   Loaded ${existingContent.recentTopics?.length || 0} recent topics for context\n`)

  // Run analysis
  console.log('🤖 Running Claude analysis...')
  const analysis = await analyzeIdea(testIdea, existingContent)

  if (analysis) {
    console.log('\n✅ Analysis Results:')
    console.log('─'.repeat(40))
    console.log(`Virality Score: ${analysis.viralityScore}/100`)
    console.log(`\nScore Breakdown:\n${analysis.scoreBreakdown}`)
    console.log(`\nAI Review:\n${analysis.aiReview}`)
    console.log(`\nHook 1 (Curiosity):\n${analysis.hook1}`)
    console.log(`\nHook 2 (Relatable):\n${analysis.hook2}`)
    console.log(`\nHook 3 (Bold):\n${analysis.hook3}`)
    console.log(`\nBest Format: ${analysis.bestFormat}`)
    console.log(`\nSimilar Content:\n${analysis.similarContent}`)
    console.log(`\nContent Gap:\n${analysis.contentGap}`)
    console.log(`\nTrending Relevance:\n${analysis.trendingRelevance}`)
    console.log('─'.repeat(40))

    // Ask to save (in interactive mode) or auto-save with flag
    const autoSave = process.argv.includes('--save')
    
    if (autoSave) {
      console.log('\n📝 Saving to Notion (--save flag detected)...')
      const success = await writeAnalysisToNotion(testIdea.id, analysis)
      if (success) {
        console.log('✅ Analysis saved to Notion!')
      } else {
        console.log('❌ Failed to save to Notion')
      }
    } else {
      console.log('\n💡 To save this analysis, run with --save flag:')
      console.log('   npm run run-once -- --save')
    }
  } else {
    console.log('❌ Analysis failed')
  }

  console.log('\n✅ Test complete!')
}

runOnce().catch(error => {
  console.error('Error:', error)
  process.exit(1)
})
