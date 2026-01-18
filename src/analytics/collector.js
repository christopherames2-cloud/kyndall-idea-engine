// kyndall-idea-engine/src/analytics/collector.js
// Analytics collector - fetches data from platforms and syncs to Notion

import { getRecentVideos, getVideoStats, getMultipleVideoStats, getChannelStats } from './youtube.js'
import { getUserVideos, getAllUserVideos, getVideoStats as getTikTokVideoStats, getUserInfo } from './tiktok.js'
import { 
  getAllTrackedVideos, 
  findVideoByPlatformId, 
  createVideoEntry, 
  updateCurrentStats,
  saveMilestoneStats 
} from './notion-analytics.js'

/**
 * Sync all platforms - fetch new videos and update stats
 */
export async function syncAllPlatforms() {
  console.log('\n📊 Starting analytics sync...')
  
  const results = {
    youtube: { new: 0, updated: 0, errors: 0 },
    tiktok: { new: 0, updated: 0, errors: 0 },
    instagram: { new: 0, updated: 0, errors: 0 }
  }

  // Sync YouTube
  try {
    const ytResult = await syncYouTube()
    results.youtube = ytResult
  } catch (error) {
    console.error('❌ YouTube sync failed:', error.message)
    results.youtube.errors++
  }

  // Sync TikTok
  try {
    const ttResult = await syncTikTok()
    results.tiktok = ttResult
  } catch (error) {
    console.error('❌ TikTok sync failed:', error.message)
    results.tiktok.errors++
  }

  // Instagram placeholder
  console.log('⏳ Instagram sync skipped (not yet implemented)')

  console.log('\n✅ Analytics sync complete!')
  console.log(`   YouTube: ${results.youtube.new} new, ${results.youtube.updated} updated`)
  console.log(`   TikTok: ${results.tiktok.new} new, ${results.tiktok.updated} updated`)
  
  return results
}

/**
 * Sync YouTube videos
 */
export async function syncYouTube() {
  console.log('\n🎬 Syncing YouTube...')
  
  const result = { new: 0, updated: 0, errors: 0 }

  try {
    // Get channel stats first
    const channelStats = await getChannelStats()
    if (channelStats) {
      console.log(`   Channel: ${channelStats.title}`)
      console.log(`   Subscribers: ${channelStats.subscriberCount.toLocaleString()}`)
    }

    // Get recent videos from YouTube
    const recentVideos = await getRecentVideos(50)
    console.log(`   Found ${recentVideos.length} videos on YouTube`)

    // Get existing tracked videos from Notion
    const trackedVideos = await getAllTrackedVideos()
    const trackedIds = new Set(
      trackedVideos
        .filter(v => v.platform === 'YouTube')
        .map(v => v.videoId)
    )

    // Find new videos to add
    const newVideos = recentVideos.filter(v => !trackedIds.has(v.videoId))
    console.log(`   New videos to add: ${newVideos.length}`)

    // Add new videos to Notion
    for (const video of newVideos) {
      const pageId = await createVideoEntry({
        title: video.title,
        platform: 'YouTube',
        videoId: video.videoId,
        url: `https://www.youtube.com/watch?v=${video.videoId}`,
        publishedAt: video.publishedAt,
        thumbnail: video.thumbnail
      })

      if (pageId) {
        result.new++
        console.log(`   ✅ Added: ${video.title.substring(0, 50)}...`)
      } else {
        result.errors++
      }
    }

    // Update stats for all tracked YouTube videos
    const youtubeTracked = trackedVideos.filter(v => v.platform === 'YouTube')
    if (youtubeTracked.length > 0) {
      console.log(`   Updating stats for ${youtubeTracked.length} tracked videos...`)
      
      const videoIds = youtubeTracked.map(v => v.videoId)
      const allStats = await getMultipleVideoStats(videoIds)
      
      for (const stats of allStats) {
        const tracked = youtubeTracked.find(v => v.videoId === stats.videoId)
        if (tracked) {
          const success = await updateCurrentStats(tracked.id, {
            views: stats.views,
            likes: stats.likes,
            comments: stats.comments,
            shares: stats.shares,
            watchTimeHours: stats.watchTimeHours,
            avgViewDuration: stats.avgViewDuration,
            retentionPercent: stats.retentionPercent
          })
          
          if (success) {
            result.updated++
          } else {
            result.errors++
          }
        }
      }
    }

  } catch (error) {
    console.error('   Error syncing YouTube:', error.message)
    result.errors++
  }

  return result
}

/**
 * Sync TikTok videos
 */
export async function syncTikTok() {
  console.log('\n📱 Syncing TikTok...')
  
  const result = { new: 0, updated: 0, errors: 0 }

  try {
    // Get user info first
    const userInfo = await getUserInfo()
    if (userInfo) {
      console.log(`   Account: ${userInfo.displayName}`)
      console.log(`   Followers: ${userInfo.followers?.toLocaleString() || 'N/A'}`)
    }

    // Get recent videos from TikTok
    const recentVideos = await getAllUserVideos(50)
    console.log(`   Found ${recentVideos.length} videos on TikTok`)

    // Get existing tracked videos from Notion
    const trackedVideos = await getAllTrackedVideos()
    const trackedIds = new Set(
      trackedVideos
        .filter(v => v.platform === 'TikTok')
        .map(v => v.videoId)
    )

    // Find new videos to add
    const newVideos = recentVideos.filter(v => !trackedIds.has(v.videoId))
    console.log(`   New videos to add: ${newVideos.length}`)

    // Add new videos to Notion
    for (const video of newVideos) {
      const pageId = await createVideoEntry({
        title: video.title || 'Untitled TikTok',
        platform: 'TikTok',
        videoId: video.videoId,
        url: video.shareUrl || `https://www.tiktok.com/@kyndallames/video/${video.videoId}`,
        publishedAt: video.publishedAt,
        thumbnail: video.thumbnail
      })

      if (pageId) {
        result.new++
        console.log(`   ✅ Added: ${(video.title || 'Untitled').substring(0, 50)}...`)
      } else {
        result.errors++
      }
    }

    // Update stats for all tracked TikTok videos
    const tiktokTracked = trackedVideos.filter(v => v.platform === 'TikTok')
    if (tiktokTracked.length > 0) {
      console.log(`   Updating stats for ${tiktokTracked.length} tracked videos...`)
      
      // TikTok API requires fetching stats in batches
      const batchSize = 20
      for (let i = 0; i < tiktokTracked.length; i += batchSize) {
        const batch = tiktokTracked.slice(i, i + batchSize)
        const videoIds = batch.map(v => v.videoId)
        
        const allStats = await getTikTokVideoStats(videoIds)
        
        for (const stats of allStats) {
          const tracked = batch.find(v => v.videoId === stats.videoId)
          if (tracked) {
            const success = await updateCurrentStats(tracked.id, {
              views: stats.views,
              likes: stats.likes,
              comments: stats.comments,
              shares: stats.shares,
              watchTimeHours: null,
              avgViewDuration: null,
              retentionPercent: null
            })
            
            if (success) {
              result.updated++
            } else {
              result.errors++
            }
          }
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

  } catch (error) {
    console.error('   Error syncing TikTok:', error.message)
    result.errors++
  }

  return result
}

/**
 * Check and record milestone stats
 */
export async function checkMilestones() {
  console.log('\n🎯 Checking milestones...')
  
  const trackedVideos = await getAllTrackedVideos()
  const now = new Date()
  
  const results = {
    d1: { recorded: 0, analyzed: 0 },
    d7: { recorded: 0, analyzed: 0 },
    d30: { recorded: 0, analyzed: 0 },
    d90: { recorded: 0, analyzed: 0 }
  }

  for (const video of trackedVideos) {
    if (!video.postedDate) continue
    
    const postedDate = new Date(video.postedDate)
    const daysSincePost = Math.floor((now - postedDate) / (1000 * 60 * 60 * 24))

    // Check D1 milestone (24+ hours)
    if (daysSincePost >= 1 && !video.d1Recorded) {
      console.log(`   📊 Recording D1 for: ${video.title.substring(0, 40)}...`)
      const success = await saveMilestoneStats(video.id, 1, {
        views: video.viewsCurrent,
        likes: video.likesCurrent,
        comments: video.commentsCurrent,
        shares: video.sharesCurrent,
        watchTimeHours: video.watchTimeCurrent,
        retentionPercent: video.retentionCurrent
      })
      if (success) results.d1.recorded++
    }

    // Check D7 milestone (7+ days)
    if (daysSincePost >= 7 && !video.d7Recorded && video.d1Recorded) {
      console.log(`   📊 Recording D7 for: ${video.title.substring(0, 40)}...`)
      const success = await saveMilestoneStats(video.id, 7, {
        views: video.viewsCurrent,
        likes: video.likesCurrent,
        comments: video.commentsCurrent,
        shares: video.sharesCurrent,
        watchTimeHours: video.watchTimeCurrent,
        retentionPercent: video.retentionCurrent
      })
      if (success) results.d7.recorded++
    }

    // Check D30 milestone (30+ days)
    if (daysSincePost >= 30 && !video.d30Recorded && video.d7Recorded) {
      console.log(`   📊 Recording D30 for: ${video.title.substring(0, 40)}...`)
      const success = await saveMilestoneStats(video.id, 30, {
        views: video.viewsCurrent,
        likes: video.likesCurrent,
        comments: video.commentsCurrent,
        shares: video.sharesCurrent,
        watchTimeHours: video.watchTimeCurrent,
        retentionPercent: video.retentionCurrent
      })
      if (success) results.d30.recorded++
    }

    // Check D90 milestone (90+ days)
    if (daysSincePost >= 90 && !video.d90Recorded && video.d30Recorded) {
      console.log(`   📊 Recording D90 for: ${video.title.substring(0, 40)}...`)
      const success = await saveMilestoneStats(video.id, 90, {
        views: video.viewsCurrent,
        likes: video.likesCurrent,
        comments: video.commentsCurrent,
        shares: video.sharesCurrent,
        watchTimeHours: video.watchTimeCurrent,
        retentionPercent: video.retentionCurrent
      })
      if (success) results.d90.recorded++
    }
  }

  console.log(`   D1: ${results.d1.recorded} recorded`)
  console.log(`   D7: ${results.d7.recorded} recorded`)
  console.log(`   D30: ${results.d30.recorded} recorded`)
  console.log(`   D90: ${results.d90.recorded} recorded`)

  return results
}

/**
 * Get platform stats summary for reporting
 */
export async function getPlatformSummary() {
  const trackedVideos = await getAllTrackedVideos()
  
  const summary = {
    youtube: {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgEngagement: 0
    },
    tiktok: {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgEngagement: 0
    },
    overall: {
      totalVideos: trackedVideos.length,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0
    }
  }

  for (const video of trackedVideos) {
    const platform = video.platform?.toLowerCase()
    if (platform === 'youtube' || platform === 'tiktok') {
      summary[platform].totalVideos++
      summary[platform].totalViews += video.viewsCurrent || 0
      summary[platform].totalLikes += video.likesCurrent || 0
      summary[platform].totalComments += video.commentsCurrent || 0
    }
    
    summary.overall.totalViews += video.viewsCurrent || 0
    summary.overall.totalLikes += video.likesCurrent || 0
    summary.overall.totalComments += video.commentsCurrent || 0
  }

  // Calculate average engagement rates
  if (summary.youtube.totalViews > 0) {
    summary.youtube.avgEngagement = 
      ((summary.youtube.totalLikes + summary.youtube.totalComments) / summary.youtube.totalViews) * 100
  }
  if (summary.tiktok.totalViews > 0) {
    summary.tiktok.avgEngagement = 
      ((summary.tiktok.totalLikes + summary.tiktok.totalComments) / summary.tiktok.totalViews) * 100
  }

  return summary
}
