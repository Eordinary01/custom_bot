/**
 * JARVIS Conversational AI - Local-First Web Search & Content Fetcher
 * 
 * Provides local-first internet access with zero third-party commercial API keys:
 * - Uses self-hosted SearxNG meta-search aggregator (Docker / localhost:8080)
 * - Direct HTTP fetch with Readability-style text extraction
 * - Grounding rule: time-sensitive queries (news, prices, 'latest') must be grounded or honestly decline
 * - Untrusted content prompt fencing: <observed_data source="web_search">
 * - Strict domain exclusion list (banking, medical, authentication)
 * - Explicit offline toggle (default: offline)
 * - Rate limiting to protect local and upstream IP reputation
 * 
 * Requirements: Master Instructions Section 0, Section 5, Section 6
 */

import { SystemObserver } from './system-observer.js';

export class WebSearchProvider {
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.online=false] Explicit online toggle (default: false / offline)
   * @param {string} [options.searxngUrl='http://localhost:8080'] Local SearxNG URL
   * @param {number} [options.rateLimitMs=1500] Minimum ms between outgoing queries
   * @param {number} [options.timeoutMs=5000] Network timeout
   */
  constructor(options = {}) {
    this.online = options.online ?? false;
    this.searxngUrl = options.searxngUrl || 'http://localhost:8080';
    this.rateLimitMs = options.rateLimitMs || 1500;
    this.timeoutMs = options.timeoutMs || 5000;
    this.lastQueryTime = 0;
    this.observer = new SystemObserver();

    // Time-sensitive intent patterns (news, current events, live prices)
    this.timeSensitivePatterns = [
      /\b(?:news|headlines|breaking\s+news|current\s+events|today'?s\s+news)\b/i,
      /\b(?:latest|recent|current|today'?s|yesterday'?s)\s+(?:update|price|market|election|weather|scores|developments)\b/i,
      /\b(?:what\s+happened\s+today|what'?s\s+happening\s+(?:now|today))\b/i
    ];
  }

  /**
   * Set online/offline mode
   * @param {boolean} status
   */
  setOnline(status) {
    this.online = Boolean(status);
  }

  /**
   * Check if user query is time-sensitive (requiring live search grounding)
   * @param {string} query
   * @returns {boolean}
   */
  isTimeSensitive(query) {
    if (!query || typeof query !== 'string') return false;
    return this.timeSensitivePatterns.some(p => p.test(query));
  }

  /**
   * Perform local meta-search via self-hosted SearxNG
   * @param {string} query
   * @param {number} [maxResults=3]
   * @returns {Promise<{success: boolean, offline?: boolean, fencedContent?: string, results: Array, message?: string}>}
   */
  async search(query, maxResults = 3) {
    if (!query || typeof query !== 'string') {
      return { success: false, results: [], message: 'Empty search query.' };
    }

    // Grounding rule: Offline mode strictly declines rather than hallucinating
    if (!this.online) {
      return {
        success: false,
        offline: true,
        results: [],
        message: "I am currently in 100% offline mode and do not have live access to current web data, Sir. You can enable live search by starting with the --online flag."
      };
    }

    // Rate-limiting check
    const now = Date.now();
    const elapsed = now - this.lastQueryTime;
    if (elapsed < this.rateLimitMs) {
      await new Promise(r => setTimeout(r, this.rateLimitMs - elapsed));
    }
    this.lastQueryTime = Date.now();

    try {
      const url = new URL('/search', this.searxngUrl);
      url.searchParams.set('q', query);
      url.searchParams.set('format', 'json');

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(url.toString(), {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timer);

      if (!res.ok) {
        // Fallback to DuckDuckGo if SearxNG returns error status
        const fallback = await this._searchDuckDuckGoFallback(query, maxResults);
        if (fallback.success) return fallback;

        return {
          success: false,
          results: [],
          message: `Local SearxNG search failed with status ${res.status}.`
        };
      }

      const data = await res.json();
      const rawResults = Array.isArray(data.results) ? data.results : [];

      // Filter against high-security exclusion list (banking, medical, auth)
      const filtered = [];
      for (const item of rawResults) {
        const text = `${item.title || ''} ${item.url || ''} ${item.content || ''}`;
        if (!this.observer.isBlocked(text)) {
          filtered.push({
            title: item.title,
            url: item.url,
            snippet: item.content
          });
        }
        if (filtered.length >= maxResults) break;
      }

      if (filtered.length === 0) {
        // Fallback to DuckDuckGo if SearxNG returned empty
        const fallback = await this._searchDuckDuckGoFallback(query, maxResults);
        if (fallback.success) return fallback;

        return {
          success: false,
          results: [],
          message: "No public, non-excluded search results found."
        };
      }

      // XML Prompt Fencing: treat all returned web snippets as untrusted observed data
      const textBlock = filtered.map((f, i) =>
        `[${i + 1}] ${f.title}\nURL: ${f.url}\nSummary: ${f.snippet}`
      ).join('\n\n');

      const fencedContent = this.observer.formatForPrompt('searxng_search', textBlock);

      return {
        success: true,
        results: filtered,
        fencedContent,
        message: `Retrieved ${filtered.length} grounded search results.`
      };

    } catch (err) {
      // Fallback to DuckDuckGo if SearxNG is unreachable
      try {
        const fallback = await this._searchDuckDuckGoFallback(query, maxResults);
        if (fallback.success) return fallback;
      } catch (_) {}

      return {
        success: false,
        results: [],
        message: `Live search connection to ${this.searxngUrl} failed: ${err.message}`
      };
    }
  }

  /**
   * Fallback search using DuckDuckGo Instant API & HTML Search
   * @private
   * @param {string} query
   * @param {number} [maxResults=3]
   * @returns {Promise<{success: boolean, results: Array, fencedContent?: string, message?: string}>}
   */
  async _searchDuckDuckGoFallback(query, maxResults = 3) {
    try {
      const apiUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(apiUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      clearTimeout(timer);

      const results = [];

      if (res.ok) {
        const data = await res.json();
        if (data.AbstractText) {
          results.push({
            title: data.Heading || query,
            url: data.AbstractURL || 'https://duckduckgo.com/?q=' + encodeURIComponent(query),
            snippet: data.AbstractText
          });
        }

        if (Array.isArray(data.RelatedTopics)) {
          for (const topic of data.RelatedTopics) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(' - ')[0] || query,
                url: topic.FirstURL,
                snippet: topic.Text
              });
            }
            if (results.length >= maxResults) break;
          }
        }
      }

      // If instant answer API returned no items, try HTML scrape
      if (results.length === 0) {
        const htmlUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const htmlController = new AbortController();
        const htmlTimer = setTimeout(() => htmlController.abort(), this.timeoutMs);

        const htmlRes = await fetch(htmlUrl, {
          signal: htmlController.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
        clearTimeout(htmlTimer);

        if (htmlRes.ok) {
          const html = await htmlRes.text();
          const resultRegex = /<a[^>]+class="[^"]*result__url[^"]*"[^>]+href="([^"]+)"[^>]*>[\s\S]*?<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
          let match;
          while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
            const rawUrl = match[1];
            const cleanSnippet = match[2].replace(/<[^>]+>/g, '').trim();
            if (rawUrl && cleanSnippet) {
              let actualUrl = rawUrl;
              try {
                const parsed = new URL(rawUrl, 'https://html.duckduckgo.com');
                const uddg = parsed.searchParams.get('uddg');
                if (uddg) actualUrl = decodeURIComponent(uddg);
              } catch (_) {}
              results.push({
                title: query,
                url: actualUrl,
                snippet: cleanSnippet
              });
            }
          }
        }
      }

      const filtered = results.filter(item => {
        const text = `${item.title || ''} ${item.url || ''} ${item.snippet || ''}`;
        return !this.observer.isBlocked(text);
      }).slice(0, maxResults);

      if (filtered.length === 0) {
        return { success: false, results: [], message: 'DuckDuckGo fallback search returned no results.' };
      }

      const textBlock = filtered.map((f, i) =>
        `[${i + 1}] ${f.title}\nURL: ${f.url}\nSummary: ${f.snippet}`
      ).join('\n\n');

      const fencedContent = this.observer.formatForPrompt('duckduckgo_fallback_search', textBlock);

      return {
        success: true,
        results: filtered,
        fencedContent,
        message: `Retrieved ${filtered.length} grounded search results via DuckDuckGo fallback.`
      };
    } catch (e) {
      return { success: false, results: [], message: `DuckDuckGo fallback failed: ${e.message}` };
    }
  }

  /**
   * Directly fetch and extract plain text from a URL (Readability-style extraction)
   * @param {string} targetUrl
   * @returns {Promise<{success: boolean, fencedContent?: string, text?: string, message?: string}>}
   */
  async fetchPage(targetUrl) {
    if (!this.online) {
      return {
        success: false,
        offline: true,
        message: "Live web page fetching is disabled in offline mode, Sir."
      };
    }

    if (this.observer.isBlocked(targetUrl)) {
      return {
        success: false,
        message: "Access to this domain is restricted under safety policy."
      };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': 'JARVIS-LocalAssistant/3.0' }
      });
      clearTimeout(timer);

      if (!res.ok) {
        return { success: false, message: `HTTP fetch failed with code ${res.status}.` };
      }

      const html = await res.text();

      // Lightweight Readability-style HTML text cleaner: strip scripts, styles, tags
      let cleanText = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
        .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      // Enforce 1500 char snippet ceiling
      if (cleanText.length > 1500) {
        cleanText = cleanText.slice(0, 1500) + '...';
      }

      const fencedContent = this.observer.formatForPrompt('web_page_extract', cleanText);

      return {
        success: true,
        text: cleanText,
        fencedContent
      };
    } catch (err) {
      return {
        success: false,
        message: `Failed to fetch URL: ${err.message}`
      };
    }
  }
}

export default WebSearchProvider;
