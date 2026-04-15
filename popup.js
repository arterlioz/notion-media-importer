// Global state
let currentUrl = '';
let currentTitle = '';
let currentAuthor = '';

// ─── Content Script: injected into the active tab ───
// This is the single source of truth for metadata extraction.
// It runs inside the page's DOM context via chrome.scripting.executeScript.
function pageExtractor(mediaType) {
    const getMeta = (property) => {
        const meta = document.querySelector(`meta[property="${property}"]`) || 
                    document.querySelector(`meta[name="${property}"]`);
        return meta ? meta.getAttribute('content')?.trim() : '';
    };

    // ── Title ──
    let title = getMeta('og:title') || 
               getMeta('twitter:title') || 
               document.querySelector('h1')?.textContent?.trim() ||
               document.title;

    // ── Author (type-specific) ──
    let author = '';

    if (mediaType.startsWith('Video')) {
        author = document.querySelector('ytd-channel-name a')?.textContent ||
                document.querySelector('[itemprop="author"] link[itemprop="name"]')?.getAttribute('content') ||
                getMeta('og:video:creator') ||
                getMeta('author');
    } else if (mediaType.startsWith('Podcast')) {
        author = getMeta('podcast:host') ||
                document.querySelector('[class*="host-name"]')?.textContent ||
                document.querySelector('[class*="show-host"]')?.textContent ||
                getMeta('author');
    } else {
        author = getMeta('author') || 
                getMeta('article:author') ||
                getMeta('twitter:creator') ||
                document.querySelector('[rel="author"]')?.textContent ||
                document.querySelector('.author-name')?.textContent ||
                document.querySelector('[class*="byline"]')?.textContent ||
                document.querySelector('[class*="author"]')?.textContent ||
                '';
    }

    // ── Summary extraction ──
    let summary = '';

    // Junk patterns: text that looks like CTAs, cookie notices, nav, boilerplate
    const junkPatterns = [
        /subscribe/i, /sign up/i, /sign in/i, /log in/i, /create an account/i,
        /cookie/i, /privacy policy/i, /terms of (use|service)/i,
        /newsletter/i, /get (unlimited|full) access/i,
        /already a (member|subscriber)/i, /continue reading/i,
        /share this/i, /follow us/i, /download the app/i,
        /advertisement/i, /sponsored/i,
        /^\d+ min read$/i, /^\d+ likes?$/i, /^\d+ comments?$/i,
        /read more$/i, /see more$/i, /show more$/i,
        /unlock this/i, /start your free/i, /become a member/i,
    ];

    function isJunk(text) {
        if (!text || text.length < 30) return true;
        if (text.length > 2000) return true; // grabbed too much DOM text
        return junkPatterns.some(p => p.test(text));
    }

    // Truncate at sentence boundary near the limit
    function truncateAtSentence(text, limit = 500) {
        if (text.length <= limit) return text;
        
        // Find the last sentence-ending punctuation before the limit
        const truncated = text.substring(0, limit);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('. '),
            truncated.lastIndexOf('! '),
            truncated.lastIndexOf('? '),
            truncated.lastIndexOf('."'),
            truncated.lastIndexOf('."')
        );
        
        if (lastSentenceEnd > limit * 0.4) {
            // Found a reasonable sentence break
            return text.substring(0, lastSentenceEnd + 1).trim();
        }
        
        // No good sentence break — fall back to word boundary
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > limit * 0.6) {
            return text.substring(0, lastSpace).trim() + '...';
        }
        
        return truncated.trim() + '...';
    }

    // Clean extracted text
    function cleanText(text) {
        return text
            .replace(/\s+/g, ' ')       // collapse whitespace
            .replace(/\n+/g, ' ')        // newlines to spaces
            .replace(/\t+/g, ' ')        // tabs to spaces
            .replace(/\s{2,}/g, ' ')     // double spaces
            .trim();
    }

    // ── VIDEO: skip summary unless there's a real description ──
    if (mediaType.startsWith('Video')) {
        const ogDesc = getMeta('og:description');
        
        // YouTube og:description is usually junk — check if it's real content
        const youtubeJunk = [
            /enjoy the videos and music/i,
            /share your videos/i,
            /subscribe/i,
            /^\s*$/,
        ];
        
        if (ogDesc && ogDesc.length > 60 && !youtubeJunk.some(p => p.test(ogDesc))) {
            summary = cleanText(ogDesc);
        }
        // Otherwise: leave summary blank for videos (per design decision)

    // ── PODCAST: episode descriptions are usually good ──
    } else if (mediaType.startsWith('Podcast')) {
        // Spotify and Apple Podcasts put good descriptions in og:description
        const ogDesc = getMeta('og:description');
        const desc = getMeta('description');
        
        const candidate = ogDesc || desc || '';
        if (!isJunk(candidate)) {
            summary = cleanText(candidate);
        }
        
        // Fallback: look for episode description elements
        if (!summary) {
            const episodeDesc = 
                document.querySelector('[data-testid="episode-description"]')?.textContent ||
                document.querySelector('.episode-description')?.textContent ||
                document.querySelector('[class*="episode"] [class*="description"]')?.textContent ||
                '';
            if (!isJunk(episodeDesc)) {
                summary = cleanText(episodeDesc);
            }
        }

    // ── ESSAYS, ARTICLES, GUIDES, BOOKS ──
    } else {
        // Tier 1: Meta tags (usually the best source for professional sites)
        const metaCandidates = [
            getMeta('og:description'),
            getMeta('twitter:description'),
            getMeta('description'),
        ];
        
        for (const candidate of metaCandidates) {
            if (candidate && !isJunk(candidate)) {
                summary = cleanText(candidate);
                break;
            }
        }

        // Tier 2: Structured excerpt/summary elements
        if (!summary) {
            const excerptSelectors = [
                '.post-excerpt',
                '.article-excerpt',
                '.entry-summary',
                '[class*="excerpt"]',
                '[class*="dek"]',          // journalism subheading
                '[class*="standfirst"]',    // UK journalism term
                '.subtitle',
                '.article-subtitle',
                '.post-subtitle',
            ];
            
            for (const sel of excerptSelectors) {
                const el = document.querySelector(sel);
                if (el) {
                    const text = cleanText(el.textContent);
                    if (!isJunk(text)) {
                        summary = text;
                        break;
                    }
                }
            }
        }

        // Tier 3: Platform-specific selectors
        if (!summary) {
            const hostname = window.location.hostname;
            
            // Substack: article preview text
            if (hostname.includes('substack.com')) {
                const substackDesc = 
                    document.querySelector('.subtitle')?.textContent ||
                    document.querySelector('.post-preview-description')?.textContent ||
                    '';
                if (!isJunk(substackDesc)) summary = cleanText(substackDesc);
            }
            
            // Medium: look for the actual article paragraphs
            if (hostname.includes('medium.com')) {
                const mediumParas = Array.from(document.querySelectorAll('article p'))
                    .map(p => p.textContent.trim())
                    .filter(t => t.length > 60 && !isJunk(t));
                if (mediumParas.length > 0) {
                    summary = cleanText(mediumParas.slice(0, 2).join(' '));
                }
            }
        }

        // Tier 4: First meaningful paragraphs from the article body
        if (!summary) {
            const bodySelectors = [
                'article p',
                '[role="article"] p',
                '.post-content p',
                '.article-content p',
                '.article-body p',
                '.entry-content p',
                '.story-body p',
                '.post-body p',
                '.content-body p',
                '#article-body p',
                'main p',
                '.prose p',
            ];
            
            let paragraphs = [];
            for (const sel of bodySelectors) {
                const found = Array.from(document.querySelectorAll(sel));
                if (found.length > 0) {
                    paragraphs = found;
                    break;  // use the first matching selector
                }
            }
            
            // Filter to real content paragraphs
            const goodParas = paragraphs
                .map(p => p.textContent.trim())
                .filter(text => {
                    if (text.length < 60) return false;   // too short
                    if (isJunk(text)) return false;        // CTA/boilerplate
                    // Must look like prose: has spaces (multiple words) and punctuation
                    if ((text.match(/ /g) || []).length < 5) return false;
                    return true;
                })
                .slice(0, 3);  // take up to 3 paragraphs
            
            if (goodParas.length > 0) {
                summary = cleanText(goodParas.join(' '));
            }
        }
    }

    // ── Final cleanup: truncate at sentence boundary ──
    if (summary) {
        summary = truncateAtSentence(summary, 500);
    }

    return { title, author, summary };
}


// ─── Initialize on load ───
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('saveSetupBtn').addEventListener('click', saveSetup);
    document.getElementById('showSettingsLink').addEventListener('click', (e) => {
        e.preventDefault();
        showSetup();
    });
    document.getElementById('importBtn').addEventListener('click', importToNotion);
    document.getElementById('regenerateSummaryBtn').addEventListener('click', extractMetadata);
    document.getElementById('type').addEventListener('change', updateAuthorLabel);
    
    const settings = await chrome.storage.sync.get(['notionToken', 'databaseId']);
    
    if (!settings.notionToken || !settings.databaseId) {
        showSetup();
    } else {
        loadCurrentPage();
    }
});


// ─── UI Helpers ───

function updateAuthorLabel() {
    const type = document.getElementById('type').value;
    const label = document.getElementById('authorLabel');
    const input = document.getElementById('author');
    
    const labels = {
        'Essay 📄': 'Author',
        'Article 📑': 'Author',
        'Guide 📝': 'Author',
        'Video 🎥': 'Channel/Creator',
        'Podcast 🎙️': 'Host',
        'Book 📖': 'Author',
        'Movie & Show 🎬': 'Director/Creator'
    };
    
    const placeholders = {
        'Essay 📄': 'Auto-detected if available',
        'Article 📑': 'Auto-detected if available',
        'Guide 📝': 'Auto-detected if available',
        'Video 🎥': 'Channel name',
        'Podcast 🎙️': 'Podcast host',
        'Book 📖': 'Book author',
        'Movie & Show 🎬': 'Director or creator'
    };
    
    label.textContent = labels[type] || 'Author';
    input.placeholder = placeholders[type] || 'Auto-detected if available';
}

function showSetup() {
    document.getElementById('setupSection').classList.add('visible');
    document.getElementById('mainSection').classList.add('hidden');
    
    chrome.storage.sync.get(['notionToken', 'databaseId'], (data) => {
        if (data.notionToken) document.getElementById('setupToken').value = data.notionToken;
        if (data.databaseId) document.getElementById('setupDbId').value = data.databaseId;
    });
}

async function saveSetup() {
    const token = document.getElementById('setupToken').value.trim();
    const dbId = document.getElementById('setupDbId').value.trim();
    
    if (!token || !dbId) {
        showStatus('Please fill in both fields', 'error');
        return;
    }
    
    await chrome.storage.sync.set({
        notionToken: token,
        databaseId: dbId
    });
    
    document.getElementById('setupSection').classList.remove('visible');
    document.getElementById('mainSection').classList.remove('hidden');
    
    loadCurrentPage();
}

function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status visible ${type}`;
    
    if (type === 'success') {
        setTimeout(() => {
            status.classList.remove('visible');
        }, 3000);
    }
}

function cleanTitle(title) {
    return title
        .replace(/\s*[\|\-–—]\s*(Medium|Substack|YouTube|Spotify|Vimeo|The New York Times|WSJ|BBC|CNN|TechCrunch|Wired|The Atlantic|The New Yorker).*$/i, '')
        .replace(/\s*\(.*?\)\s*$/, '')
        .trim();
}


// ─── Page Loading & Metadata ───

function applyMetadata(metadata) {
    if (metadata.title) {
        document.getElementById('title').value = cleanTitle(metadata.title);
    }
    
    if (metadata.author) {
        const cleanedAuthor = metadata.author.trim()
            .replace(/^@/, '')
            .replace(/^by\s+/i, '')
            .replace(/\s+/g, ' ');
        document.getElementById('author').value = cleanedAuthor;
    }
    
    if (metadata.summary) {
        document.getElementById('summary').value = metadata.summary;
    }
}

async function runExtractor(tabId, mediaType) {
    const results = await chrome.scripting.executeScript({
        target: { tabId },
        function: pageExtractor,
        args: [mediaType]
    });
    
    if (results && results[0] && results[0].result) {
        return results[0].result;
    }
    return null;
}

async function loadCurrentPage() {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        currentUrl = tab.url;
        currentTitle = tab.title || '';
        
        document.getElementById('title').value = cleanTitle(currentTitle);
        
        const type = detectMediaType(currentUrl);
        document.getElementById('type').value = type;
        updateAuthorLabel();
        
        try {
            const metadata = await runExtractor(tab.id, type);
            if (metadata) {
                applyMetadata(metadata);
            }
        } catch (error) {
            console.log('Could not inject content script:', error);
        }
    } catch (error) {
        console.error('Error loading page:', error);
    }
}

async function extractMetadata() {
    showStatus('Extracting metadata and generating summary...', 'info');
    
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const type = document.getElementById('type').value;
        
        const metadata = await runExtractor(tab.id, type);
        if (metadata) {
            applyMetadata(metadata);
            showStatus('Metadata extracted successfully!', 'success');
        }
    } catch (error) {
        console.error('Extraction error:', error);
        showStatus('Could not extract metadata from page', 'error');
    }
}


// ─── Media Type Detection ───

function detectMediaType(url) {
    const urlLower = url.toLowerCase();
    
    // Podcasts
    if (urlLower.includes('spotify.com/episode') || 
        urlLower.includes('apple.com/podcast') ||
        urlLower.includes('podcasts.google.com') ||
        urlLower.includes('overcast.fm') ||
        urlLower.includes('podcast')) {
        return 'Podcast 🎙️';
    }
    
    // Videos
    if (urlLower.includes('youtube.com') || 
        urlLower.includes('youtu.be') ||
        urlLower.includes('vimeo.com')) {
        return 'Video 🎥';
    }
    
    // Books
    if (urlLower.includes('goodreads.com') || 
        urlLower.includes('/book')) {
        return 'Book 📖';
    }
    
    // Guide indicators
    const guideIndicators = [
        'twitter.com', 'x.com',
        '/tutorial/', '/how-to/', '/guide/', '/docs/', '/documentation/',
        'stackoverflow.com', 'github.com', 'dev.to', 'hashnode.dev',
        'freecodecamp.org', '/learn/', '/walkthrough/', '/instructions/'
    ];
    
    if (guideIndicators.some(indicator => urlLower.includes(indicator))) {
        return 'Guide 📝';
    }
    
    // Essay indicators
    const essayIndicators = [
        'substack.com', 'medium.com', '/blog/', '/essay/', '/opinion/',
        '/commentary/', '/reflection', 'wordpress.com', 'ghost.io',
        'beehiiv.com', 'buttondown.email'
    ];
    
    if (essayIndicators.some(indicator => urlLower.includes(indicator))) {
        return 'Essay 📄';
    }
    
    // Article indicators
    const articleIndicators = [
        'nytimes.com', 'wsj.com', 'reuters.com', 'bbc.com',
        'theguardian.com', 'cnn.com', 'wikipedia.org', '/news/',
        '/article/', '/press/', 'techcrunch.com', 'wired.com',
        'theatlantic.com', 'newyorker.com'
    ];
    
    if (articleIndicators.some(indicator => urlLower.includes(indicator))) {
        return 'Article 📑';
    }
    
    // Default to Essay
    return 'Essay 📄';
}


// ─── Notion Import ───

async function importToNotion() {
    const title = document.getElementById('title').value.trim();
    const author = document.getElementById('author').value.trim();
    const type = document.getElementById('type').value;
    const summary = document.getElementById('summary').value.trim();
    
    if (!title) {
        showStatus('Please enter a title', 'error');
        return;
    }
    
    const btn = document.getElementById('importBtn');
    const btnText = document.getElementById('btnText');
    btn.disabled = true;
    btnText.innerHTML = '<span class="loading-spinner"></span>Adding...';
    
    try {
        const settings = await chrome.storage.sync.get(['notionToken', 'databaseId']);
        
        const payload = {
            parent: { database_id: settings.databaseId },
            properties: {
                "Title": {
                    title: [{ text: { content: title } }]
                },
                "By": {
                    rich_text: author ? [{ text: { content: author } }] : []
                },
                "Media Type": {
                    select: { name: type }
                },
                "Link": {
                    url: currentUrl
                }
            }
        };
        
        // Add summary to Synopsis property AND as page content
        if (summary) {
            payload.properties["Synopsis"] = {
                rich_text: [{ text: { content: summary } }]
            };
            payload.children = [
                {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                        rich_text: [{ type: 'text', text: { content: summary } }]
                    }
                }
            ];
        }
        
        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${settings.notionToken}`,
                'Content-Type': 'application/json',
                'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showStatus('✓ Added to Notion successfully!', 'success');
            setTimeout(() => { window.close(); }, 1500);
        } else {
            console.error('Notion API error:', data);
            
            let errorMsg = 'Failed to add to Notion';
            
            if (data.code === 'unauthorized') {
                errorMsg = 'Integration not connected. Go to Notion → ••• → Add connections';
            } else if (data.code === 'validation_error') {
                errorMsg = 'Property names don\'t match database schema';
            } else if (data.message) {
                errorMsg = data.message;
            }
            
            showStatus(errorMsg, 'error');
        }
    } catch (error) {
        console.error('Import error:', error);
        showStatus('Import failed: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Add to Notion';
    }
}
