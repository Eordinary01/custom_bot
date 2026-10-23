/**
 * JARVIS Conversational AI - Browser & YouTube Context Inspector
 * 
 * Safely inspects browser state and active tabs using read-only SQLite copies via SystemObserver.
 * Provides YouTube video detection and metadata extraction.
 */

import fs from 'fs';
import path from 'path';
import { SystemObserver } from './system-observer.js';

export class BrowsingInspector {
  /**
   * @param {object} [options={}]
   */
  constructor(options = {}) {
    this.observer = options.observer || new SystemObserver();
    const localAppData = process.env.LOCALAPPDATA || '';

    this.historyPaths = [
      path.join(localAppData, 'Microsoft', 'Edge', 'User Data', 'Default', 'History'),
      path.join(localAppData, 'Google', 'Chrome', 'User Data', 'Default', 'History')
    ];
  }

  /**
   * Safely query recent browser history/tabs from Edge and Chrome
   * @param {number} [limit=10]
   * @returns {Array<{title: string, url: string, lastVisitTime: number}>}
   */
  getRecentTabs(limit = 10) {
    const allRecords = [];

    for (const historyPath of this.historyPaths) {
      if (!fs.existsSync(historyPath)) continue;

      try {
        const records = this.observer.readDatabaseSafely(historyPath, (db) => {
          const stmt = db.prepare(`
            SELECT title, url, last_visit_time
            FROM urls
            WHERE title != '' AND url != ''
            ORDER BY last_visit_time DESC
            LIMIT ?
          `);
          return stmt.all(limit);
        });

        if (Array.isArray(records)) {
          allRecords.push(...records);
        }
      } catch (_) {}
    }

    // Sort combined records by last visit time
    allRecords.sort((a, b) => (b.last_visit_time || 0) - (a.last_visit_time || 0));

    // Filter and sanitize via SystemObserver (removes banking, medical, credentials, incognito)
    const sanitized = this.observer.filterObservedItems(allRecords.map(r => ({
      title: r.title,
      url: r.url,
      lastVisitTime: r.last_visit_time
    })));

    return sanitized.slice(0, limit);
  }

  /**
   * Check if user is currently watching YouTube and extract video title
   * @returns {{isYouTube: boolean, videoTitle: string|null, url: string|null, videoId: string|null}}
   */
  getCurrentYouTubeContext() {
    const tabs = this.getRecentTabs(15);
    
    for (const tab of tabs) {
      const url = tab.url || '';
      const title = tab.title || '';

      const isYtUrl = url.includes('youtube.com/watch') || url.includes('youtu.be/');
      const isYtTitle = title.toLowerCase().includes('youtube');

      if (isYtUrl || isYtTitle) {
        let cleanTitle = title
          .replace(/\s*-\s*YouTube\s*$/i, '')
          .replace(/^\(\d+\)\s*/, '') // Remove "(1) " unread notification prefix
          .trim();

        let videoId = null;
        try {
          const parsed = new URL(url);
          videoId = parsed.searchParams.get('v') || null;
        } catch (_) {}

        return {
          isYouTube: true,
          videoTitle: cleanTitle || 'YouTube Video',
          url: url || null,
          videoId
        };
      }
    }

    return {
      isYouTube: false,
      videoTitle: null,
      url: null,
      videoId: null
    };
  }

  /**
   * Get overall browsing summary for prompt context
   * @returns {{summary: string, youtube: object, recentTabs: Array}}
   */
  getBrowsingSummary() {
    const youtube = this.getCurrentYouTubeContext();
    const tabs = this.getRecentTabs(5);

    let summary = '';
    if (youtube.isYouTube && youtube.videoTitle) {
      summary = `The user is currently watching YouTube: "${youtube.videoTitle}"`;
    } else if (tabs.length > 0) {
      const topTab = tabs[0];
      summary = `Active tab appears to be: "${topTab.title}"`;
    } else {
      summary = 'No active browser tabs observed.';
    }

    return {
      summary,
      youtube,
      recentTabs: tabs
    };
  }
}

export default BrowsingInspector;
