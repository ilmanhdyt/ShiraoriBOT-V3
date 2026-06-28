/**
 * lib/tiktok.js — Scraper ssstik.io
 * 
 * Flow:
 *  1. GET ssstik.io/id  → ambil token `tt` dari HTML source
 *  2. POST ssstik.io/abc?url=dl  → kirim { id, locale, tt }
 *  3. Parse HTML response → ekstrak URL video (nowm/wm), audio, slides
 * 
 * Return: { type, videoUrl, audioUrl, slideImages, author, title, duration, views, likes }
 * type: 'video' | 'slide'
 */

const fetch  = require('node-fetch')
const { JSDOM } = require('jsdom')

// ── Konstanta ──────────────────────────────────────────────────────────────────

const BASE_URL   = 'https://ssstik.io'
const PAGE_URL   = `${BASE_URL}/id`
const API_URL    = `${BASE_URL}/abc?url=dl`

const UA = 'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Fetch dengan AbortController timeout-safe (node-fetch v2 tidak support timeout option).
 * Node 18+ punya AbortController built-in.
 */
function fetchWithTimeout(url, opts = {}, ms = 30000) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), ms)
    return fetch(url, { ...opts, signal: controller.signal })
        .finally(() => clearTimeout(timer))
}

/**
 * Ambil token `tt` dari HTML source ssstik.io
 * Token ada di script inline: tt:'XXXXXXXXXX'
 */
async function extractToken() {
    const res = await fetchWithTimeout(PAGE_URL, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8',
        }
    }, 15000)

    if (!res.ok) throw new Error(`Gagal akses ssstik.io: HTTP ${res.status}`)

    const html = await res.text()

    // Token ada di: tt:'abcdef123' atau tt: 'abcdef123'
    const match = html.match(/tt\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/)
    if (!match) throw new Error('Token tt tidak ditemukan di halaman ssstik.io')

    return match[1]
}

/**
 * Parse teks angka dengan suffix (K, M) → string bersih
 * misal: "1.2M" → "1.2M", "123K" → "123K"
 */
function cleanNum(str) {
    if (!str) return ''
    return str.replace(/[^\d.,KMB]/g, '').trim()
}

/**
 * Ambil attr href/src dari elemen DOM, filter yang valid URL
 */
function getAttr(el, ...attrs) {
    if (!el) return null
    for (const attr of attrs) {
        const v = el.getAttribute(attr)
        if (v && v.startsWith('http')) return v
    }
    return null
}

// ── Core scraper ───────────────────────────────────────────────────────────────

/**
 * Download info TikTok via ssstik.io
 * @param {string} tiktokUrl - URL TikTok (vt.tiktok.com, vm.tiktok.com, www.tiktok.com/...)
 * @returns {Promise<Object>} hasil scrape
 */
async function scrapeSsstik(tiktokUrl) {
    // Step 1: Ambil token
    const tt = await extractToken()

    // Step 2: POST ke API
    const body = new URLSearchParams({
        id    : tiktokUrl,
        locale: 'id',
        tt    : tt,
    })

    const res = await fetchWithTimeout(API_URL, {
        method : 'POST',
        headers: {
            'Content-Type'    : 'application/x-www-form-urlencoded',
            'User-Agent'      : UA,
            'Referer'         : PAGE_URL,
            'Origin'          : BASE_URL,
            'HX-Current-URL'  : PAGE_URL,
            'HX-Request'      : 'true',
            'HX-Target'       : 'target',
            'HX-Trigger'      : '_gcaptcha_pt',
            'Accept'          : '*/*',
            'Accept-Language' : 'id-ID,id;q=0.9,en;q=0.8',
        },
        body: body.toString(),
    }, 30000)

    if (!res.ok) throw new Error(`ssstik API error: HTTP ${res.status}`)

    const html = await res.text()

    // Step 3: Parse HTML response
    return parseResult(html)
}

/**
 * Parse HTML response dari ssstik.io → ekstrak semua field yang dibutuhkan
 */
function parseResult(html) {
    const dom  = new JSDOM(html)
    const doc  = dom.window.document

    // ── Deteksi error dari ssstik ──────────────────────────────────────────────
    const errEl = doc.querySelector('.error_page, .error-message, [class*="error"]')
    if (errEl) {
        const errMsg = errEl.textContent?.trim()
        if (errMsg && errMsg.length > 3) throw new Error(`ssstik: ${errMsg}`)
    }

    // ── Metadata ───────────────────────────────────────────────────────────────
    const authorEl   = doc.querySelector('.maintext, .profile a, [class*="author"], h2')
    const titleEl    = doc.querySelector('.maintext p, .video-title, [class*="title"]')
    const durationEl = doc.querySelector('[class*="duration"], .duration')

    // Stats: views / likes
    const statEls  = doc.querySelectorAll('[class*="stat"] span, .stats span, .detail-info span')
    let views = '', likes = ''
    statEls.forEach(el => {
        const txt = el.textContent?.trim() || ''
        if (/view|tonton/i.test(el.getAttribute('class') || '') || /^\d/.test(txt)) {
            if (!views) views = cleanNum(txt)
        }
        if (/like|suka/i.test(el.getAttribute('class') || '')) {
            likes = cleanNum(txt)
        }
    })

    // ── Link Video (no watermark / with watermark) ─────────────────────────────
    // ssstik menyediakan link download di <a> dengan teks tertentu
    const allLinks = [...doc.querySelectorAll('a[href]')]

    let videoNowm = null  // tanpa watermark (utama)
    let videoWm   = null  // dengan watermark (fallback)
    let audioUrl  = null
    const slideImages = []

    for (const a of allLinks) {
        const href = a.getAttribute('href') || ''
        if (!href.startsWith('http')) continue

        const text = a.textContent?.toLowerCase() || ''
        const cls  = (a.getAttribute('class') || '').toLowerCase()

        // Download tanpa watermark
        if (/without|no.?water|tanpa|nowm|hd|mp4/i.test(text) && !videoNowm) {
            videoNowm = href
        }
        // Download dengan watermark (fallback)
        else if (/watermark|dengan|wm|download/i.test(text) && !videoWm) {
            videoWm = href
        }
        // Audio / MP3
        if (/mp3|audio|musik|music/i.test(text) && !audioUrl) {
            audioUrl = href
        }
    }

    // Fallback: cari link download berdasarkan pola URL (muscdn, tiktok CDN, dll)
    if (!videoNowm) {
        for (const a of allLinks) {
            const href = a.getAttribute('href') || ''
            if (href.includes('tikcdn') || href.includes('muscdn') ||
                href.includes('tiktokcdn') || href.includes('v19') ||
                href.includes('api16') || href.includes('v26')) {
                if (!videoNowm) videoNowm = href
                else if (!videoWm) videoWm = href
            }
        }
    }

    // ── Slide Images ───────────────────────────────────────────────────────────
    // Ssstik menampilkan slide sebagai <img> dalam container slide/swiper
    const imgEls = doc.querySelectorAll(
        '.swiper-slide img, .slide img, [class*="slide"] img, .photos img, .carousel img, img[src*="tiktok"], img[src*="muscdn"]'
    )
    for (const img of imgEls) {
        const src = getAttr(img, 'src', 'data-src', 'data-lazy')
        if (src && !src.includes('avatar') && !src.includes('profile') && !slideImages.includes(src)) {
            slideImages.push(src)
        }
    }

    // ── Tentukan tipe konten ───────────────────────────────────────────────────
    const isSlide = slideImages.length > 0
    const videoUrl = videoNowm || videoWm || null

    if (!videoUrl && !isSlide) {
        // Debug: lempar sebagian HTML supaya owner bisa diagnosa
        const snippet = html.slice(0, 800).replace(/\s+/g, ' ')
        throw new Error(`Tidak ada URL ditemukan di response ssstik. Preview: ${snippet}`)
    }

    return {
        type       : isSlide ? 'slide' : 'video',
        videoUrl   : isSlide ? null : videoUrl,
        audioUrl   : audioUrl || null,
        slideImages: slideImages,
        author     : authorEl?.textContent?.trim() || '',
        title      : titleEl?.textContent?.trim() || '',
        duration   : durationEl?.textContent?.trim() || '',
        views,
        likes,
    }
}

// ── Export ─────────────────────────────────────────────────────────────────────

module.exports = { scrapeSsstik }
