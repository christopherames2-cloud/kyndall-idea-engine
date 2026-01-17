// kyndall-idea-engine/src/sanity.js
// Sanity client - READ ONLY - fetches existing content for context

import { createClient } from '@sanity/client'

let client = null

/**
 * Initialize the Sanity client (read-only, no token needed)
 */
export function initSanity(projectId, dataset) {
  client = createClient({
    projectId,
    dataset,
    apiVersion: '2024-01-01',
    useCdn: true, // Read-only, CDN is fine
  })
  console.log('✅ Sanity client initialized (read-only)')
}

/**
 * Get all published blog posts for context
 * Returns titles, categories, excerpts, and products mentioned
 */
export async function getExistingBlogPosts() {
  if (!client) {
    throw new Error('Sanity not initialized')
  }

  try {
    const posts = await client.fetch(`
      *[_type == "blogPost" && (showInBlog == true || showInVideos == true)] | order(publishedAt desc) {
        _id,
        title,
        "slug": slug.current,
        category,
        excerpt,
        platform,
        publishedAt,
        "products": productLinks[].name
      }
    `)
    return posts
  } catch (error) {
    console.error('Error fetching blog posts:', error.message)
    return []
  }
}

/**
 * Get all published articles for context
 */
export async function getExistingArticles() {
  if (!client) {
    throw new Error('Sanity not initialized')
  }

  try {
    const articles = await client.fetch(`
      *[_type == "article" && showOnSite == true] | order(publishedAt desc) {
        _id,
        title,
        "slug": slug.current,
        category,
        excerpt,
        publishedAt,
        "faqs": faqSection[].question
      }
    `)
    return articles
  } catch (error) {
    console.error('Error fetching articles:', error.message)
    return []
  }
}

/**
 * Get content summary statistics
 */
export async function getContentStats() {
  if (!client) {
    throw new Error('Sanity not initialized')
  }

  try {
    const stats = await client.fetch(`{
      "totalPosts": count(*[_type == "blogPost" && (showInBlog == true || showInVideos == true)]),
      "totalArticles": count(*[_type == "article" && showOnSite == true]),
      "categories": {
        "makeup": count(*[_type == "blogPost" && category == "makeup"]),
        "skincare": count(*[_type == "blogPost" && category == "skincare"]),
        "fashion": count(*[_type == "blogPost" && category == "fashion"]),
        "lifestyle": count(*[_type == "blogPost" && category == "lifestyle"]),
        "travel": count(*[_type == "blogPost" && category == "travel"])
      },
      "recentPosts": *[_type == "blogPost"] | order(publishedAt desc)[0...5] {
        title,
        category,
        publishedAt
      }
    }`)
    return stats
  } catch (error) {
    console.error('Error fetching stats:', error.message)
    return null
  }
}

/**
 * Search for similar content based on keywords
 */
export async function searchSimilarContent(keywords) {
  if (!client) {
    throw new Error('Sanity not initialized')
  }

  try {
    // Create a simple search query
    const searchTerms = keywords.toLowerCase().split(' ').filter(k => k.length > 2)
    
    if (searchTerms.length === 0) return []

    const posts = await client.fetch(`
      *[_type == "blogPost" && (showInBlog == true || showInVideos == true)] {
        _id,
        title,
        "slug": slug.current,
        category,
        excerpt
      }
    `)

    // Simple relevance scoring
    const scored = posts.map(post => {
      const titleLower = (post.title || '').toLowerCase()
      const excerptLower = (post.excerpt || '').toLowerCase()
      
      let score = 0
      searchTerms.forEach(term => {
        if (titleLower.includes(term)) score += 3
        if (excerptLower.includes(term)) score += 1
      })
      
      return { ...post, relevanceScore: score }
    })

    // Return top matches
    return scored
      .filter(p => p.relevanceScore > 0)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5)
  } catch (error) {
    console.error('Error searching content:', error.message)
    return []
  }
}

/**
 * Get a formatted summary of all existing content for Claude
 */
export async function getContentContextForClaude() {
  const [posts, articles, stats] = await Promise.all([
    getExistingBlogPosts(),
    getExistingArticles(),
    getContentStats()
  ])

  // Format posts by category
  const postsByCategory = {}
  posts.forEach(post => {
    const cat = post.category || 'uncategorized'
    if (!postsByCategory[cat]) postsByCategory[cat] = []
    postsByCategory[cat].push({
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt?.substring(0, 100)
    })
  })

  return {
    stats,
    postsByCategory,
    articles: articles.map(a => ({
      title: a.title,
      slug: a.slug,
      category: a.category
    })),
    recentTopics: posts.slice(0, 10).map(p => p.title)
  }
}
