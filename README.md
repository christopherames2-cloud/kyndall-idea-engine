# 💡 Kyndall Idea Engine

AI-powered content idea analyzer that enriches Notion ideas with virality scores, hooks, and strategic insights.

## What It Does

```
Kyndall adds idea to Notion
         ↓
   Engine detects it (every 15 min)
         ↓
   Pulls existing content from Sanity (for context)
         ↓
   Claude analyzes the idea
   - Calculates virality score
   - Generates 3 hook options
   - Suggests best format
   - Identifies similar content
   - Notes content gaps & trends
         ↓
   Writes analysis back to Notion
         ↓
   Kyndall sees enriched idea ✨
```

## Kyndall's Workflow

1. **Add an idea** to Notion (just a title is enough!)
2. **Wait 15 minutes** (engine runs automatically)
3. **See the analysis** appear in your Notion database:
   - 📊 Virality Score (1-100)
   - 🎣 Three hook options
   - 📱 Best format recommendation
   - 🔗 Links to similar content you've made
   - 💡 Strategic advice

## What Gets Analyzed

| Field | What Claude Provides |
|-------|---------------------|
| **Virality Score** | 1-100 rating based on trend potential, hook strength, shareability |
| **Score Breakdown** | Why this score - what's working, what's not |
| **AI Review** | Strategic advice for making this content perform |
| **Hook 1** | Curiosity-driven hook (creates intrigue) |
| **Hook 2** | Relatable hook (POV style, viewers identify) |
| **Hook 3** | Bold/contrarian hook (stands out) |
| **Best Format** | TikTok, YouTube Short, YouTube Long, Reel, Blog, or Carousel |
| **Similar Content** | Links to your existing content on this topic |
| **Content Gap** | What makes this different from what you've done |
| **Trending Relevance** | Current trends or timing factors |

## Setup Instructions

### 1. Create Your Notion Database

Create a database in Notion with these properties:

**You fill in:**
| Property | Type | Required |
|----------|------|----------|
| Idea | Title | ✅ |
| Category | Select | Optional |
| Notes | Text | Optional |
| Status | Select | Optional |
| Priority | Select | Optional |

**AI fills in (create these as empty):**
| Property | Type |
|----------|------|
| Virality Score | Number |
| Score Breakdown | Text |
| AI Review | Text |
| Hook 1 | Text |
| Hook 2 | Text |
| Hook 3 | Text |
| Best Format | Select (options: TikTok, YouTube Short, YouTube Long, Instagram Reel, Blog Post, Carousel) |
| Similar Content | Text |
| Content Gap | Text |
| Trending Relevance | Text |
| Last Analyzed | Date |
| Needs Reanalysis | Checkbox |

### 2. Get Your Notion API Key

1. Go to [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Click **"New integration"**
3. Name it "Kyndall Idea Engine"
4. Copy the **Internal Integration Token**

### 3. Connect Notion to Your Database

1. Open your Ideas database in Notion
2. Click **"..."** menu → **"Connections"**
3. Add your "Kyndall Idea Engine" integration

### 4. Get Your Database ID

1. Open your database in Notion
2. Look at the URL: `notion.so/YOUR_DATABASE_ID?v=...`
3. Copy the ID (32 characters, before the `?`)

### 5. Deploy to DigitalOcean

**Option A: As a Worker (Recommended)**

1. Create new App in DigitalOcean
2. Select your repo
3. Choose **Worker** (not Web Service)
4. Add environment variables (see below)
5. Deploy

**Option B: Add to Existing App**

1. Go to your existing kyndall-site app
2. Click Create → Create Resources
3. Add a Worker component
4. Point to this folder
5. Add environment variables

### 6. Set Environment Variables

```
NOTION_API_KEY=secret_xxxxx
NOTION_IDEAS_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxx
SANITY_PROJECT_ID=f9drkp1w
SANITY_DATASET=production
CHECK_INTERVAL_MINUTES=15
```

## Local Development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env with your values

# Run once (for testing)
npm run run-once

# Run once AND save results to Notion
npm run run-once -- --save

# Run continuously
npm start
```

## How It Uses Your Existing Content

The engine reads your published content from Sanity to:

1. **Avoid duplicates** - "You already covered this in [Post Name]"
2. **Suggest series** - "This could be Part 2 of your foundation reviews"
3. **Balance categories** - Notes if you're heavy on makeup but light on skincare
4. **Match your voice** - Uses your recent titles to stay on-brand

## Scoring Guidelines

| Score | Meaning |
|-------|---------|
| 80-100 | 🔥 Extremely high viral potential, perfect timing |
| 60-79 | ✅ Good potential, solid idea that fits your brand |
| 40-59 | ⚠️ Decent but needs refinement or better timing |
| 20-39 | 🤔 Weak potential, oversaturated or poor fit |
| 1-19 | ❌ Not recommended |

## Re-Analyzing Ideas

To re-analyze an idea after editing it:

1. Check the **"Needs Reanalysis"** checkbox in Notion
2. Wait for the next check (or run manually)
3. Fresh analysis will be generated

## Troubleshooting

### Engine not detecting new ideas?

- Verify Notion API key is valid
- Check that the integration is connected to your database
- Confirm database ID is correct
- Look at logs in DigitalOcean

### Analysis not saving to Notion?

- Make sure all the required properties exist in your database
- Check that property names match exactly (case-sensitive)
- Verify the integration has write access

### "Best Format" not saving?

- Create the "Best Format" property as a **Select** type
- Add these options: TikTok, YouTube Short, YouTube Long, Instagram Reel, Blog Post, Carousel

## Future Enhancements

- [ ] Trending topic suggestions (not just analysis)
- [ ] Performance tracking (after content is posted)
- [ ] Competitor content scanning
- [ ] Seasonal content calendar
- [ ] Slack/email notifications for high-score ideas

---

Built with 💕 for Kyndall Ames
