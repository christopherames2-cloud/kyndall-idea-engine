// kyndall-idea-engine/src/analytics/index.js
// Analytics module - main orchestrator

import { initYouTube } from './youtube.js'
import { initTikTok } from './tiktok.js'
import { initInstagram } from './instagram.js'
import { initNotionAnalytics } from './notion-analytics.js'
import { initAnalyzer, runMilestoneAnalysis } from './analyzer.js'
import { initReporter, sendWeeklyReport, generateTestReport } from './reporter.js'
import { syncAllPlatforms, checkMilestones, getPlatformSummary } from './collector.js'

// Export all sub-modules for direct access if needed
export * from './youtube.js'
export * from './tiktok.js'
export * from './instagram.js'
export * from './notion-analytics.js'
export * from './analyzer.js'
export * from './reporter.js'
export * from './collector.js'

/**
 * Initialize all analytics services
 */
export function initAnalytics(config) {
  console.log('\n📊 Initializing Analytics Module...')

  // YouTube
  if (config.youtube?.apiKey && config.youtube?.channelId) {
    initYouTube(config.youtube.apiKey, config.youtube.channelId)
  } else {
    console.log('⚠️  YouTube not configured (missing API key or channel ID)')
  }

  // TikTok (uses Sanity for token storage - shared with kyndall-site)
  if (config.tiktok?.clientKey && config.sanity?.token) {
    initTikTok({
      clientKey: config.tiktok.clientKey,
      clientSecret: config.tiktok.clientSecret,
      sanityProjectId: config.sanity.projectId,
      sanityDataset: config.sanity.dataset,
      sanityToken: config.sanity.token,
    })
  } else {
    console.log('⚠️  TikTok not configured (need client key + Sanity token)')
  }

  // Instagram (placeholder)
  if (config.instagram?.accessToken) {
    initInstagram(config.instagram.accessToken, config.instagram.userId)
  } else {
    console.log('⏳ Instagram not configured (placeholder)')
  }

  // Notion Analytics
  if (config.notion?.apiKey && config.notion?.analyticsDbId) {
    initNotionAnalytics(
      config.notion.apiKey,
      config.notion.analyticsDbId,
      config.notion.ideasDbId
    )
  } else {
    console.log('⚠️  Notion Analytics not configured')
  }

  // Claude Analyzer
  if (config.anthropic?.apiKey) {
    initAnalyzer(config.anthropic.apiKey)
  } else {
    console.log('⚠️  Analyzer not configured (missing Anthropic API key)')
  }

  // Weekly Reporter
  if (config.resend?.apiKey && config.resend?.recipientEmail) {
    initReporter(config.resend.apiKey, config.resend.recipientEmail)
  } else {
    console.log('⚠️  Weekly Reporter not configured')
  }

  console.log('✅ Analytics Module initialized\n')
}

/**
 * Run full analytics cycle
 * - Sync all platforms (fetch new videos, update stats)
 * - Check and record milestones
 * - Run AI analysis on milestones
 */
export async function runAnalyticsCycle() {
  console.log('\n' + '═'.repeat(50))
  console.log('📊 ANALYTICS CYCLE - ' + new Date().toLocaleString())
  console.log('═'.repeat(50))

  const results = {
    sync: null,
    milestones: null,
    analysis: null,
    errors: []
  }

  try {
    // Step 1: Sync all platforms
    results.sync = await syncAllPlatforms()
  } catch (error) {
    console.error('❌ Sync failed:', error.message)
    results.errors.push({ step: 'sync', error: error.message })
  }

  try {
    // Step 2: Check and record milestones
    results.milestones = await checkMilestones()
  } catch (error) {
    console.error('❌ Milestone check failed:', error.message)
    results.errors.push({ step: 'milestones', error: error.message })
  }

  try {
    // Step 3: Run AI analysis
    results.analysis = await runMilestoneAnalysis()
  } catch (error) {
    console.error('❌ Analysis failed:', error.message)
    results.errors.push({ step: 'analysis', error: error.message })
  }

  console.log('\n✅ Analytics cycle complete!')
  if (results.errors.length > 0) {
    console.log(`⚠️  ${results.errors.length} error(s) occurred`)
  }

  return results
}

/**
 * Run weekly report
 */
export async function runWeeklyReport() {
  console.log('\n📧 Running weekly report...')
  return await sendWeeklyReport()
}

/**
 * Get a test/preview of the weekly report
 */
export async function previewWeeklyReport() {
  return await generateTestReport()
}

/**
 * Get current platform summary
 */
export async function getSummary() {
  return await getPlatformSummary()
}

/**
 * Check if today is Sunday (for weekly report)
 */
export function isSunday() {
  return new Date().getDay() === 0
}

/**
 * Get analytics status for health check
 */
export function getAnalyticsStatus() {
  return {
    module: 'analytics',
    initialized: true,
    features: {
      youtube: true,
      tiktok: true,
      instagram: false, // placeholder
      milestoneAnalysis: true,
      weeklyReports: true
    }
  }
}
