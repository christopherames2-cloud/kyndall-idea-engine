// kyndall-idea-engine/src/analytics/tiktok.js
// TikTok API integration for fetching video analytics
// Fetches tokens from Sanity (shared with kyndall-site)

import { createClient } from '@sanity/client'

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2'
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/'

let sanityClient = null
let clientKey = null
let clientSecret = null
let cachedCredentials = null

/**
 * Initialize TikTok API with Sanity connection
 */
export function initTikTok(config) {
  clientKey = config.clientKey
  clientSecret = config.clientSecret
  
  if (config.sanityProjectId && config.sanityToken) {
    sanityClient = createClient({
      projectId: config.sanityProjectId,
      dataset: config.sanityDataset || 'production',
      apiVersion: '2024-01-01',
      token: config.sanityToken,
      useCdn: false,
    })
    console.log('✅ TikTok API initialized (using Sanity for tokens)')
  } else {
    console.log('⚠️ TikTok: Sanity not configured - cannot fetch tokens')
  }
}

/**
 * Get TikTok credentials from Sanity
 */
async function getCredentials() {
  if (!sanityClient) {
    throw new Error('TikTok Sanity client not initialized')
  }

  try {
    const credentials = await sanityClient.fetch(
      `*[_id == "tiktok-credentials"][0]`
    )
    
    if (!credentials) {
      console.log('   ⚠️ TikTok: No credentials found in Sanity - connect at /admin/tiktok')
      return null
    }
    
    cachedCredentials = credentials
    return credentials
  } catch (error) {
    console.error('Error fetching TikTok credentials from Sanity:', error.message)
    return null
  }
}

/**
 * Get valid access token, refreshing if needed
 */
async function getValidAccessToken(forceRefresh = false) {
  const credentials = await getCredentials()
  if (!credentials) return null

  const now = Date.now()
  const accessExpiry = new Date(credentials.accessTokenExpiry).getTime()
  
  console.log(`   🔍 TikTok: Token expires at ${new Date(accessExpiry).toISOString()}`)
  console.log(`   🔍 TikTok: Current time is ${new Date(now).toISOString()}`)
  
  // If token is still valid (with 5 min buffer) and not forcing refresh, return it
  if (!forceRefresh && now < accessExpiry - 5 * 60 * 1000) {
    console.log('   ✅ TikTok: Token still valid')
    return credentials.accessToken
  }

  console.log('   ⚠️ TikTok: Token expired or force refresh requested')

  // Check if refresh token is still valid
  const refreshExpiry = new Date(credentials.refreshTokenExpiry).getTime()
  if (now >= refreshExpiry) {
    console.log('   ❌ TikTok: Refresh token expired - reconnect at /admin/tiktok')
    return null
  }

  // Refresh the token
  return await refreshAccessToken(credentials.refreshToken)
}

/**
 * Refresh the access token and update Sanity
 */
async function refreshAccessToken(refreshToken) {
  if (!clientKey || !clientSecret) {
    console.log('   ❌ TikTok: Missing TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET')
    return null
  }

  console.log('   🔄 TikTok: Refreshing access token...')

  try {
    const response = await fetch(TIKTOK_TOKEN_URL, {
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
    console.log('   🔍 TikTok refresh response:', JSON.stringify(data).substring(0, 200))

    if (data.error) {
      console.log(`   ❌ TikTok: Refresh failed - ${data.error}: ${data.error_description}`)
      return null
    }

    // Update tokens in Sanity
    const newAccessExpiry = Date.now() + (data.expires_in * 1000)
    const newRefreshExpiry = Date.now() + (data.refresh_expires_in * 1000)

    await sanityClient.patch('tiktok-credentials')
      .set({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessTokenExpiry: new Date(newAccessExpiry).toISOString(),
        refreshTokenExpiry: new Date(newRefreshExpiry).toISOString(),
        lastRefreshed: new Date().toISOString(),
      })
      .commit()

    console.log('   ✅ TikTok: Token refreshed and saved to Sanity')
    cachedCredentials = null // Clear cache to force re-fetch
    return data.access_token
  } catch (error) {
    console.error('   ❌ TikTok refresh error:', error.message)
    return null
  }
}

/**
 * Make authenticated request to TikTok API
 */
async function tiktokRequest(endpoint, options = {}, isRetry = false) {
  const accessToken = await getValidAccessToken()
  if (!accessToken) {
    throw new Error('TikTok not authenticated')
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

  // If token is invalid and we haven't retried yet, force refresh and retry
  if ((data.error?.code === 'access_token_invalid' || response.status === 401) && !isRetry) {
    console.log('   🔄 TikTok: Token rejected by API, forcing refresh...')
    const newToken = await getValidAccessToken(true) // Force refresh
    if (newToken) {
      return tiktokRequest(endpoint, options, true) // Retry with new token
    }
    throw new Error('TikTok token invalid and refresh failed')
  }

  return data
}

/**
 * Check if TikTok is connected
 */
export async function isConnected() {
  try {
    const credentials = await getCredentials()
    if (!credentials) return false
    
    const refreshExpiry = new Date(credentials.refreshTokenExpiry).getTime()
    return Date.now() < refreshExpiry
  } catch {
    return false
  }
}

/**
 * Get user info
 */
export async function getUserInfo() {
  try {
    const connected = await isConnected()
    if (!connected) {
      console.log('   ⚠️ TikTok: Not connected')
      return null
    }

    const data = await tiktokRequest('/user/info/?fields=open_id,display_name,avatar_url,follower_count,following_count,likes_count,video_count')
    
    console.log('   🔍 TikTok user info response:', JSON.stringify(data).substring(0, 300))
    
    // TikTok returns error.code = "ok" for success, so check for actual errors
    if (data.error && data.error.code && data.error.code !== 'ok') {
      throw new Error(data.error.message || data.error.code)
    }
    
    const user = data.data?.user
    if (!user) {
      console.log('   ⚠️ TikTok: No user data in response')
      return null
    }
    
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
    console.error('Error fetching TikTok user info:', error.message || error)
    return null
  }
}

/**
 * Get user's videos
 */
export async function getUserVideos(maxCount = 20, cursor = null) {
  try {
    const connected = await isConnected()
    if (!connected) {
      return { videos: [], cursor: null, hasMore: false }
    }

    const fields = 'id,title,video_description,create_time,cover_image_url,share_url,duration,height,width'
    let endpoint = `/video/list/?fields=${fields}&max_count=${maxCount}`
    
    if (cursor) {
      endpoint += `&cursor=${cursor}`
    }
    
    const data = await tiktokRequest(endpoint, { method: 'POST' })
    
    console.log('   🔍 TikTok videos response:', JSON.stringify(data).substring(0, 300))
    
    // TikTok returns error.code = "ok" for success, so check for actual errors
    if (data.error && data.error.code && data.error.code !== 'ok') {
      throw new Error(data.error.message || data.error.code)
    }
    
    const videos = (data.data?.videos || []).map(video => ({
      videoId: video.id,
      title: video.title || video.video_description?.substring(0, 100) || 'Untitled',
      description: video.video_description,
      publishedAt: new Date(video.create_time * 1000).toISOString(),
      thumbnail: video.cover_image_url,
      shareUrl: video.share_url,
      duration: video.duration,
    }))
    
    return {
      videos,
      cursor: data.data?.cursor,
      hasMore: data.data?.has_more
    }
  } catch (error) {
    console.error('Error fetching TikTok videos:', error.message || error)
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
 */
export async function getVideoStats(videoIds) {
  if (!Array.isArray(videoIds)) {
    videoIds = [videoIds]
  }
  
  try {
    const connected = await isConnected()
    if (!connected) {
      return []
    }

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
