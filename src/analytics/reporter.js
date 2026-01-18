// kyndall-idea-engine/src/analytics/reporter.js
// Weekly email reports sent to Kyndall

import { getThisWeeksVideos, getTopPerformers } from './notion-analytics.js'
import { getPlatformSummary } from './collector.js'
import { generateWeeklyInsights } from './analyzer.js'

let resendApiKey = null
let recipientEmail = null

/**
 * Initialize the reporter
 */
export function initReporter(apiKey, email) {
  resendApiKey = apiKey
  recipientEmail = email
  console.log('✅ Weekly Reporter initialized')
}

/**
 * Send weekly performance report
 */
export async function sendWeeklyReport() {
  if (!resendApiKey || !recipientEmail) {
    console.error('Reporter not initialized')
    return false
  }

  console.log('\n📧 Generating weekly report...')

  try {
    // Gather data
    const thisWeeksVideos = await getThisWeeksVideos()
    const topPerformers = await getTopPerformers(5, 30)
    const summary = await getPlatformSummary()

    // Generate AI insights
    const insights = await generateWeeklyInsights(thisWeeksVideos, summary)

    // Build email HTML
    const html = buildEmailHTML({
      thisWeeksVideos,
      topPerformers,
      summary,
      insights
    })

    // Send via Resend
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Kyndall Analytics <analytics@kyndallames.com>',
        to: recipientEmail,
        subject: `✨ Your Weekly Content Report - ${getWeekDateRange()}`,
        html: html
      })
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || 'Failed to send email')
    }

    console.log(`✅ Weekly report sent to ${recipientEmail}`)
    return true

  } catch (error) {
    console.error('Error sending weekly report:', error.message)
    return false
  }
}

/**
 * Build the email HTML
 */
function buildEmailHTML({ thisWeeksVideos, topPerformers, summary, insights }) {
  const topPerformersList = topPerformers.slice(0, 5).map((v, i) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0;">
        <span style="font-size: 18px; margin-right: 8px;">${getMedal(i)}</span>
        <strong>${escapeHtml(v.title?.substring(0, 40) || 'Untitled')}${v.title?.length > 40 ? '...' : ''}</strong>
        <br>
        <span style="color: #666; font-size: 14px;">${v.platform}</span>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #f0f0f0; text-align: right;">
        <strong style="color: #e91e63;">${formatNumber(v.viewsCurrent)} views</strong>
        <br>
        <span style="color: #666; font-size: 14px;">${formatNumber(v.likesCurrent)} likes</span>
      </td>
    </tr>
  `).join('')

  const thisWeeksList = thisWeeksVideos.length > 0 
    ? thisWeeksVideos.map(v => `
        <div style="padding: 12px; background: #fafafa; border-radius: 8px; margin-bottom: 8px;">
          <strong>${escapeHtml(v.title?.substring(0, 50) || 'Untitled')}</strong>
          <br>
          <span style="color: #666; font-size: 14px;">
            ${v.platform} • ${formatNumber(v.viewsCurrent || 0)} views • ${formatNumber(v.likesCurrent || 0)} likes
          </span>
        </div>
      `).join('')
    : '<p style="color: #666;">No new content posted this week - that\'s okay, rest is important too! 💕</p>'

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <!-- Header -->
  <div style="text-align: center; padding: 30px 0; background: linear-gradient(135deg, #fce4ec 0%, #f8bbd9 100%); border-radius: 16px; margin-bottom: 30px;">
    <h1 style="margin: 0; color: #c2185b; font-size: 28px;">✨ Weekly Report</h1>
    <p style="margin: 10px 0 0; color: #666;">${getWeekDateRange()}</p>
  </div>

  <!-- Quick Stats -->
  <div style="display: flex; gap: 12px; margin-bottom: 30px;">
    <div style="flex: 1; background: #fff3e0; padding: 20px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: bold; color: #e65100;">${formatNumber(summary.overall.totalViews)}</div>
      <div style="color: #666; font-size: 14px;">Total Views</div>
    </div>
    <div style="flex: 1; background: #fce4ec; padding: 20px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: bold; color: #c2185b;">${formatNumber(summary.overall.totalLikes)}</div>
      <div style="color: #666; font-size: 14px;">Total Likes</div>
    </div>
    <div style="flex: 1; background: #e8f5e9; padding: 20px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: bold; color: #2e7d32;">${summary.overall.totalVideos || 0}</div>
      <div style="color: #666; font-size: 14px;">Videos Tracked</div>
    </div>
  </div>

  <!-- AI Insights -->
  <div style="background: #f5f5f5; padding: 24px; border-radius: 12px; margin-bottom: 30px;">
    <h2 style="margin: 0 0 16px; color: #333; font-size: 18px;">🧠 This Week's Insights</h2>
    <div style="white-space: pre-wrap; color: #444; line-height: 1.8;">${escapeHtml(insights || 'Generating insights...')}</div>
  </div>

  <!-- This Week's Content -->
  <div style="margin-bottom: 30px;">
    <h2 style="margin: 0 0 16px; color: #333; font-size: 18px;">📱 Posted This Week</h2>
    ${thisWeeksList}
  </div>

  <!-- Top Performers -->
  <div style="margin-bottom: 30px;">
    <h2 style="margin: 0 0 16px; color: #333; font-size: 18px;">🏆 Top Performers (Last 30 Days)</h2>
    <table style="width: 100%; border-collapse: collapse;">
      ${topPerformersList || '<tr><td style="padding: 12px; color: #666;">No data yet - keep creating! 💪</td></tr>'}
    </table>
  </div>

  <!-- Platform Breakdown -->
  <div style="margin-bottom: 30px;">
    <h2 style="margin: 0 0 16px; color: #333; font-size: 18px;">📊 Platform Breakdown</h2>
    <table style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="padding: 12px; background: #ffebee; border-radius: 8px 0 0 8px;">
          <strong>🎬 YouTube</strong><br>
          <span style="color: #666; font-size: 14px;">${summary.youtube.totalVideos} videos</span>
        </td>
        <td style="padding: 12px; background: #ffebee; text-align: right; border-radius: 0 8px 8px 0;">
          <strong>${formatNumber(summary.youtube.totalViews)}</strong> views<br>
          <span style="color: #666; font-size: 14px;">${summary.youtube.avgEngagement.toFixed(1)}% engagement</span>
        </td>
      </tr>
      <tr><td colspan="2" style="height: 8px;"></td></tr>
      <tr>
        <td style="padding: 12px; background: #e3f2fd; border-radius: 8px 0 0 8px;">
          <strong>📱 TikTok</strong><br>
          <span style="color: #666; font-size: 14px;">${summary.tiktok.totalVideos} videos</span>
        </td>
        <td style="padding: 12px; background: #e3f2fd; text-align: right; border-radius: 0 8px 8px 0;">
          <strong>${formatNumber(summary.tiktok.totalViews)}</strong> views<br>
          <span style="color: #666; font-size: 14px;">${summary.tiktok.avgEngagement.toFixed(1)}% engagement</span>
        </td>
      </tr>
    </table>
  </div>

  <!-- Footer -->
  <div style="text-align: center; padding: 30px 0; border-top: 1px solid #eee; margin-top: 30px;">
    <p style="color: #999; font-size: 14px; margin: 0;">
      You're doing amazing! 💕<br>
      <a href="https://kyndallames.com" style="color: #e91e63;">kyndallames.com</a>
    </p>
  </div>

</body>
</html>
  `
}

/**
 * Get week date range string
 */
function getWeekDateRange() {
  const now = new Date()
  const weekAgo = new Date(now)
  weekAgo.setDate(weekAgo.getDate() - 7)
  
  const options = { month: 'short', day: 'numeric' }
  return `${weekAgo.toLocaleDateString('en-US', options)} - ${now.toLocaleDateString('en-US', options)}`
}

/**
 * Format number with commas
 */
function formatNumber(num) {
  if (!num) return '0'
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
  return num.toLocaleString()
}

/**
 * Get medal emoji for ranking
 */
function getMedal(index) {
  const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣']
  return medals[index] || '▪️'
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Generate a test report (for preview)
 */
export async function generateTestReport() {
  const thisWeeksVideos = await getThisWeeksVideos()
  const topPerformers = await getTopPerformers(5, 30)
  const summary = await getPlatformSummary()
  const insights = await generateWeeklyInsights(thisWeeksVideos, summary)

  return buildEmailHTML({
    thisWeeksVideos,
    topPerformers,
    summary,
    insights
  })
}
