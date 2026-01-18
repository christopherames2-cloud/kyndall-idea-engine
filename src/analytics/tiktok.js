// kyndall-idea-engine/src/analytics/tiktok.js
// TikTok API integration for fetching video analytics

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'

let accessToken = null
let refreshToken = null
let clientKey = null
let clientSecret = null

/**
 * Initialize TikTok API
 */
export function initTikTok(key, secret, access, refresh) {
  clientKey = key
  clientSecret = secret
  accessToken = access
  refreshToken = refresh
  console.log('✅ TikTok API initialized')
}

/**
 * Update tokens (after refresh)
 */
export function updateTokens(access, refresh) {
  accessToken = access
  refreshToken = refresh
}

/**
 * Get current tokens (for persistence)
 */
export function getTokens() {
  return { accessToken, refreshToken }
}

/**
 * Refresh the access token
 */
export async function refreshAccessToken() {
  if (!clientKey || !clientSecret || !refreshToken) {
    throw new Error('TikTok not initialized or missing refresh token')
  }

  try {
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (data.error) {
      throw new Error(data.error_description || data.error)
    }

    accessToken = data.access_token
    refreshToken = data.refresh_token
    
    console.log('✅ TikTok token refreshed')
    return { accessToken, refreshToken }
  } catch (error) {
    console.error('Error refreshing TikTok token:', error.message)
    throw error
  }
}

/**
 * Make authenticated request to TikTok API
 */
async function tiktokRequest(endpoint, options = {}) {
  if (!accessToken) {
    throw new Error('TikTok not initialized')
  }

  const url = `${TIKTOK_API_BASE}${endpoint}`
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const data = await response.json()

  // If token expired, try to refresh and retry
  if (data.error?.code === 'access_token_invalid' || response.status === 401) {
    console.log('🔄 TikTok token expired, refreshing...')
    await refreshAccessToken()
    
    // Retry the request with new token
    const retryResponse = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    
    return await retryResponse.json()
  }

  return data
}

/**
 * Get user info
 */
export async function getUserInfo() {
  try {
    const data = await tiktokRequest('/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count')
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    const user = data.data?.user
    if (!user) return null
    
    return {
      openId: user.open_id,
      displayName: user.display_name,
      avatar: user.avatar_url,
      followers: user.follower_count,
      following: user.following_count,
      totalLikes: user.likes_count,
      videoCount: user.video_count
    }
  } catch (error) {
    console.error('Error fetching TikTok user info:', error.message)
    return null
  }
}

/**
 * Get user's videos
 */
export async function getUserVideos(maxCount = 20, cursor = null) {
  try {
    const fields = 'id,title,video_description,create_time,cover_image_url,share_url,duration,height,width'
    let endpoint = `/video/list/?fields=${fields}&max_count=${maxCount}`
    
    if (cursor) {
      endpoint += `&cursor=${cursor}`
    }
    
    const data = await tiktokRequest(endpoint, { method: 'POST' })
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    const videos = (data.data?.videos || []).map(video => ({
      videoId: video.id,
      title: video.title || video.video_description?.substring(0, 100) || 'Untitled',
      description: video.video_description,
      publishedAt: new Date(video.create_time * 1000).toISOString(),
      thumbnail: video.cover_image_url,
      shareUrl: video.share_url,
      duration: video.duration, // in seconds
    }))
    
    return {
      videos,
      cursor: data.data?.cursor,
      hasMore: data.data?.has_more
    }
  } catch (error) {
    console.error('Error fetching TikTok videos:', error.message)
    return { videos: [], cursor: null, hasMore: false }
  }
}

/**
 * Get all user videos (paginated)
 */
export async function getAllUserVideos(maxVideos = 100) {
  const allVideos = []
  let cursor = null
  let hasMore = true
  
  while (hasMore && allVideos.length < maxVideos) {
    const result = await getUserVideos(20, cursor)
    allVideos.push(...result.videos)
    cursor = result.cursor
    hasMore = result.hasMore
    
    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  return allVideos.slice(0, maxVideos)
}

/**
 * Get video stats by video IDs
 * Note: TikTok API requires video IDs in a specific format
 */
export async function getVideoStats(videoIds) {
  if (!Array.isArray(videoIds)) {
    videoIds = [videoIds]
  }
  
  try {
    const fields = 'id,title,video_description,create_time,cover_image_url,share_url,view_count,like_count,comment_count,share_count,duration'
    
    const data = await tiktokRequest('/video/query/?fields=' + fields, {
      method: 'POST',
      body: JSON.stringify({
        filters: {
          video_ids: videoIds
        }
      })
    })
    
    if (data.error) {
      throw new Error(data.error.message)
    }
    
    return (data.data?.videos || []).map(video => ({
      videoId: video.id,
      title: video.title || video.video_description?.substring(0, 100) || 'Untitled',
      description: video.video_description,
      publishedAt: new Date(video.create_time * 1000).toISOString(),
      thumbnail: video.cover_image_url,
      shareUrl: video.share_url,
      duration: video.duration,
      views: video.view_count || 0,
      likes: video.like_count || 0,
      comments: video.comment_count || 0,
      shares: video.share_count || 0,
      // TikTok doesn't provide these
      watchTimeHours: null,
      avgViewDuration: null,
      retentionPercent: null
    }))
  } catch (error) {
    console.error('Error fetching TikTok video stats:', error.message)
    return []
  }
}

/**
 * Get stats for a single video
 */
export async function getSingleVideoStats(videoId) {
  const stats = await getVideoStats([videoId])
  return stats.length > 0 ? stats[0] : null
}

/**
 * Format duration to readable string
 */
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}
