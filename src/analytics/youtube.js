// kyndall-idea-engine/src/analytics/youtube.js
// YouTube Data API integration for fetching video analytics

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

let apiKey = null
let channelId = null

/**
 * Initialize YouTube API
 */
export function initYouTube(key, channel) {
  apiKey = key
  channelId = channel
  console.log('✅ YouTube API initialized')
}

/**
 * Get channel statistics
 */
export async function getChannelStats() {
  if (!apiKey || !channelId) {
    throw new Error('YouTube not initialized')
  }

  const url = `${YOUTUBE_API_BASE}/channels?part=statistics,snippet&id=${channelId}&key=${apiKey}`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    if (!data.items || data.items.length === 0) {
      throw new Error('Channel not found')
    }
    
    const channel = data.items[0]
    return {
      title: channel.snippet.title,
      subscriberCount: parseInt(channel.statistics.subscriberCount),
      videoCount: parseInt(channel.statistics.videoCount),
      viewCount: parseInt(channel.statistics.viewCount),
      thumbnail: channel.snippet.thumbnails?.default?.url
    }
  } catch (error) {
    console.error('Error fetching YouTube channel stats:', error.message)
    return null
  }
}

/**
 * Get recent videos from channel
 */
export async function getRecentVideos(maxResults = 50) {
  if (!apiKey || !channelId) {
    throw new Error('YouTube not initialized')
  }

  // First, get the uploads playlist ID
  const channelUrl = `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`
  
  try {
    const channelResponse = await fetch(channelUrl)
    const channelData = await channelResponse.json()
    
    if (!channelData.items || channelData.items.length === 0) {
      throw new Error('Channel not found')
    }
    
    const uploadsPlaylistId = channelData.items[0].contentDetails.relatedPlaylists.uploads
    
    // Get videos from uploads playlist
    const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`
    
    const playlistResponse = await fetch(playlistUrl)
    const playlistData = await playlistResponse.json()
    
    if (playlistData.error) {
      throw new Error(playlistData.error.message)
    }
    
    const videos = playlistData.items.map(item => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url
    }))
    
    return videos
  } catch (error) {
    console.error('Error fetching YouTube videos:', error.message)
    return []
  }
}

/**
 * Get detailed stats for a specific video
 */
export async function getVideoStats(videoId) {
  if (!apiKey) {
    throw new Error('YouTube not initialized')
  }

  const url = `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${videoId}&key=${apiKey}`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    if (!data.items || data.items.length === 0) {
      return null
    }
    
    const video = data.items[0]
    const stats = video.statistics
    const duration = parseDuration(video.contentDetails.duration)
    
    return {
      videoId,
      title: video.snippet.title,
      publishedAt: video.snippet.publishedAt,
      thumbnail: video.snippet.thumbnails?.high?.url,
      duration, // in seconds
      views: parseInt(stats.viewCount) || 0,
      likes: parseInt(stats.likeCount) || 0,
      comments: parseInt(stats.commentCount) || 0,
      // YouTube API v3 doesn't provide shares directly
      shares: 0,
      // These require YouTube Analytics API (separate OAuth)
      watchTimeHours: null,
      avgViewDuration: null,
      retentionPercent: null
    }
  } catch (error) {
    console.error(`Error fetching stats for video ${videoId}:`, error.message)
    return null
  }
}

/**
 * Get stats for multiple videos at once (more efficient)
 */
export async function getMultipleVideoStats(videoIds) {
  if (!apiKey) {
    throw new Error('YouTube not initialized')
  }

  if (videoIds.length === 0) return []
  
  // YouTube API allows up to 50 video IDs per request
  const chunks = []
  for (let i = 0; i < videoIds.length; i += 50) {
    chunks.push(videoIds.slice(i, i + 50))
  }
  
  const allStats = []
  
  for (const chunk of chunks) {
    const ids = chunk.join(',')
    const url = `${YOUTUBE_API_BASE}/videos?part=statistics,contentDetails,snippet&id=${ids}&key=${apiKey}`
    
    try {
      const response = await fetch(url)
      const data = await response.json()
      
      if (data.error) {
        console.error('YouTube API error:', data.error.message)
        continue
      }
      
      for (const video of data.items || []) {
        const stats = video.statistics
        allStats.push({
          videoId: video.id,
          title: video.snippet.title,
          publishedAt: video.snippet.publishedAt,
          thumbnail: video.snippet.thumbnails?.high?.url,
          duration: parseDuration(video.contentDetails.duration),
          views: parseInt(stats.viewCount) || 0,
          likes: parseInt(stats.likeCount) || 0,
          comments: parseInt(stats.commentCount) || 0,
          shares: 0,
          watchTimeHours: null,
          avgViewDuration: null,
          retentionPercent: null
        })
      }
    } catch (error) {
      console.error('Error fetching multiple video stats:', error.message)
    }
  }
  
  return allStats
}

/**
 * Search for a video by title (to find videos we might have missed)
 */
export async function searchVideos(query, maxResults = 10) {
  if (!apiKey || !channelId) {
    throw new Error('YouTube not initialized')
  }

  const url = `${YOUTUBE_API_BASE}/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(query)}&type=video&maxResults=${maxResults}&key=${apiKey}`
  
  try {
    const response = await fetch(url)
    const data = await response.json()
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    return (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.high?.url
    }))
  } catch (error) {
    console.error('Error searching YouTube videos:', error.message)
    return []
  }
}

/**
 * Parse ISO 8601 duration to seconds
 * e.g., "PT4M13S" -> 253
 */
function parseDuration(duration) {
  if (!duration) return 0
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
  if (!match) return 0
  
  const hours = parseInt(match[1]) || 0
  const minutes = parseInt(match[2]) || 0
  const seconds = parseInt(match[3]) || 0
  
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Format seconds to readable duration
 */
export function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = seconds % 60
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
