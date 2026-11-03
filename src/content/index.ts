try {
  let isExtracting = false;
  console.log("[LeadScraper] Content script loaded on:", window.location.href);

  const getBodyText = () =>
    document.body?.textContent || document.documentElement?.textContent || "";

  // ── Helpers & Anti-Bot Protection ──────────────────────────────────────────
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const jitter = (min: number, max: number) =>
    sleep(Math.floor(Math.random() * (max - min + 1) + min));

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {
    try {
      if (req.action === "PING") {
        sendResponse({ alive: true, url: window.location.href });
        return true;
      }
      if (req.action === "START_SCRAPING") {
        if (isExtracting) {
          sendResponse({ status: "already_running" });
          return true;
        }
        isExtracting = true;
        startScrapeProcess()
          .catch((err) => {
            console.error("[LeadScraper] Error:", err);
            chrome.runtime.sendMessage(
              { type: "EXTRACTION_ERROR", message: String(err?.message || err) },
              () => {
                if (chrome.runtime.lastError) {
                  /* ignore */
                }
              }
            );
          })
          .finally(() => {
            isExtracting = false;
            chrome.runtime.sendMessage({ type: "EXTRACTION_DONE" }, () => {
              if (chrome.runtime.lastError) {
                /* ignore */
              }
            });
          });
        sendResponse({ status: "started" });
        return true;
      }
      if (req.action === "STOP_EXTRACTION") {
        isExtracting = false;
        sendResponse({ status: "stopped" });
        return true;
      }
    } catch (e) {
      console.warn("[LeadScraper] Listener error:", e);
    }
  });

  async function waitFor(selector: string, timeout = 12000): Promise<Element | null> {
    const end = Date.now() + timeout;
    while (Date.now() < end && isExtracting) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(300);
    }
    return null;
  }

  // Wait for h1 to change to a DIFFERENT value than prevText (means panel updated)
  async function waitForPanelUpdate(prevH1Text: string, timeout = 5000): Promise<void> {
    const end = Date.now() + timeout;
    while (Date.now() < end && isExtracting) {
      const h1 = getDetailPanelH1();
      if (h1 && h1 !== prevH1Text) return;
      await sleep(150);
    }
  }

  // Get the h1 from the detail panel only (not the search results title)
  function getDetailPanelH1(): string {
    const panel =
      document.querySelector('div[role="main"] div.m6QEdf') ||
      document.querySelector('div.bJ2h1d') ||
      document.querySelector('div[data-section-id="ap"]') ||
      document.querySelector('div[jsaction*="pane"]');

    if (panel) {
      const h1 = panel.querySelector('h1');
      if (h1?.textContent?.trim()) return h1.textContent.trim();
    }

    const h1 = document.querySelector('h1.DUwDvf, h1.fontTitleLarge');
    return h1?.textContent?.trim() || '';
  }

  const PHONE_REGEX = /(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/g;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  // ── Clean Name Parser (replaces broken double split) ──────────────────────
  function parseCardName(rawText: string): string {
    if (!rawText) return "";
    // Google Maps separates card title from rating/category with middle dot, bullet, or pipe
    const firstChunk = rawText.split(/[·•|\n]/)[0].trim();

    // Strip ratings, review counts, stars if present in the chunk
    const cleaned = firstChunk
      .replace(/★\s*[\d.]+/g, "")
      .replace(/\b\d\.\d\s*(\([\d,]+\))?/g, "")
      .replace(/\([\d,]+\)/g, "")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || firstChunk;
  }

  // ── Google Domain Filter ──────────────────────────────────────────────────
  function isInternalGoogleDomain(url: string): boolean {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      return (
        host === "google.com" ||
        host.endsWith(".google.com") ||
        host.includes(".google.") ||
        host.endsWith("gstatic.com") ||
        host.endsWith("ggpht.com") ||
        host.endsWith("googleusercontent.com") ||
        host.endsWith("goo.gl")
      );
    } catch {
      return (
        url.includes("google.com") ||
        url.includes("gstatic.com") ||
        url.includes("ggpht.com")
      );
    }
  }

  // ── Main orchestrator ──────────────────────────────────────────────────────
  async function startScrapeProcess() {
    const isMaps =
      window.location.hostname.includes("google.com") &&
      window.location.pathname.includes("/maps");
    if (isMaps) await scrapeGoogleMaps();
    else await scrapeGenericPage();
  }

  // ── Google Maps Scraper ────────────────────────────────────────────────────
  async function scrapeGoogleMaps() {
    console.log("[LeadScraper] Starting Google Maps extraction...");

    // Wait for results feed
    let feed: Element | null = await waitFor('div[role="feed"]', 12000);
    if (!feed) {
      feed =
        document.querySelector('div[aria-label*="Results" i]') ||
        document.querySelector('div[aria-label*="ফলাফল" i]') ||
        document.querySelector("div.m6QEdf[aria-label]") ||
        document.querySelector("div.m6QEdf");
    }

    if (!feed) {
      // Single place view fallback
      const singleLead = extractFromDetailPanel();
      if (singleLead?.name) {
        saveLead(singleLead);
        return;
      }
      chrome.runtime.sendMessage(
        {
          type: "EXTRACTION_ERROR",
          message: "Google Maps search results not found. Please open a search page first.",
        },
        () => {
          if (chrome.runtime.lastError) {
            /* ignore */
          }
        }
      );
      return;
    }

    await jitter(1000, 1500);

    // Track processed places by their unique place-ID in href
    const processedIds = new Set<string>();
    let stuckCount = 0;
    let lastScrollTop = -1;

    while (isExtracting) {
      // Collect unprocessed result cards
      const allAnchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('a[href*="/maps/place/"]')
      );

      // Deduplicate by extracting the place CID/ID from the URL
      const newAnchors = allAnchors.filter((a) => {
        const id = getPlaceId(a.href);
        return id && !processedIds.has(id);
      });

      if (!isExtracting) break;

      if (newAnchors.length === 0) {
        // Humanized dynamic scroll increment (400px–750px)
        const currentScroll = feed.scrollTop;
        const scrollDelta = Math.floor(Math.random() * (750 - 400 + 1)) + 400;
        feed.scrollTop += scrollDelta;
        await jitter(1500, 2200);

        if (!isExtracting) break;

        if (Math.abs(feed.scrollTop - currentScroll) < 10 || feed.scrollTop === lastScrollTop) {
          stuckCount++;
          const endText = feed.textContent || "";
          if (
            endText.includes("You've reached the end") ||
            endText.includes("তালিকায় আর কোনো স্থান নেই") ||
            stuckCount >= 5
          ) {
            console.log("[LeadScraper] Reached end of list.");
            break;
          }
        } else {
          stuckCount = 0;
        }
        lastScrollTop = feed.scrollTop;
        continue;
      }

      stuckCount = 0;

      for (const anchor of newAnchors) {
        if (!isExtracting) break;

        const placeId = getPlaceId(anchor.href);
        if (!placeId || processedIds.has(placeId)) continue;
        processedIds.add(placeId);

        // ── Step 1: Resilient Name Parsing (clean parser, no broken double-split) ──
        const rawLabel = anchor.getAttribute("aria-label") || "";
        const cardName = parseCardName(rawLabel) || parseCardName(anchor.textContent || "");

        // ── Step 2: Get card-level data without clicking ──
        const cardContainer =
          anchor.closest('div.Nv251d, div[jsaction*="mouseover"], div[role="article"]') ||
          anchor.parentElement?.parentElement ||
          anchor.parentElement;

        const cardPhone = cardContainer ? extractPhoneFromElement(cardContainer as HTMLElement) : "";
        const cardWebsite = cardContainer ? extractWebsiteFromElement(cardContainer as HTMLElement) : "";

        // ── Step 3: Scroll card into view ──
        try {
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          /* ignore scroll errors */
        }
        await jitter(300, 500);
        if (!isExtracting) break;

        // Capture current h1 BEFORE clicking
        const prevH1 = getDetailPanelH1();

        // Click the card
        anchor.click();

        // Wait until h1 changes (confirms detail panel updated with new place)
        await waitForPanelUpdate(prevH1);
        if (!isExtracting) break;

        // Anti-bot delay after opening detail panel (1200ms–2500ms)
        await jitter(1200, 2500);
        if (!isExtracting) break;

        // ── Step 4: Extract detail panel data ──
        const detail = extractFromDetailPanel();

        // ── Step 5: Build final lead ──
        const lead = {
          source: "Google Maps",
          name: cardName || detail.name || "",
          phone: detail.phone || cardPhone || "",
          email: detail.email || "",
          website: detail.website || cardWebsite || "",
          address: detail.address || "",
        };

        if (lead.name) {
          console.log("[LeadScraper] Lead:", lead.name, "| phone:", lead.phone, "| web:", lead.website);
          saveLead(lead);
        }

        await jitter(200, 400);
      }
    }

    console.log("[LeadScraper] Extraction finished. Total processed places:", processedIds.size);
  }

  // Extract place ID from Google Maps URL for reliable tracking
  function getPlaceId(href: string): string {
    try {
      const match = href.match(/\/maps\/place\/([^/]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch {
      /* ignore URI decode errors */
    }
    return href;
  }

  // Save lead to background queue with proper error handling
  function saveLead(lead: object) {
    chrome.runtime.sendMessage({ type: "SAVE_LEAD", payload: lead }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[LeadScraper] SAVE_LEAD error:", chrome.runtime.lastError.message);
      } else {
        console.log("[LeadScraper] Saved. Total:", res?.count);
      }
    });
  }

  // ── Extract phone from element (with clean phone:tel handling) ─────────────
  function extractPhoneFromElement(container: HTMLElement): string {
    const phoneEl =
      container.querySelector('[data-item-id^="phone:tel:"]') ||
      container.querySelector('button[data-item-id^="phone:tel:"]') ||
      container.querySelector('button[data-tooltip*="phone" i]') ||
      container.querySelector('button[aria-label*="phone" i], button[aria-label*="Phone" i]') ||
      container.querySelector('button[aria-label*="ফোন" i]') ||
      container.querySelector('[data-item-id*="phone"]');

    if (phoneEl) {
      const itemId = phoneEl.getAttribute("data-item-id") || "";
      if (itemId.startsWith("phone:tel:")) {
        return itemId.replace("phone:tel:", "").trim();
      }
      const label = phoneEl.getAttribute("aria-label") || phoneEl.textContent || "";
      const m = label.match(/(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/);
      if (m && m[0].replace(/\D/g, "").length >= 7) {
        return m[0].trim();
      }
    }

    const text = container.textContent || "";
    const matches = text.match(PHONE_REGEX);
    if (matches) {
      const valid = matches.find(
        (p) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15
      );
      if (valid) return valid.trim();
    }
    return "";
  }

  // ── Extract website from element (ignoring internal Google domains) ────────
  function extractWebsiteFromElement(container: HTMLElement): string {
    const webEl = container.querySelector<HTMLAnchorElement>(
      'a[data-item-id="authority"], a[aria-label*="website" i], a[data-tooltip*="website" i], a[aria-label*="ওয়েবসাইট" i], a[data-value="Website"]'
    );
    if (webEl?.href && !isInternalGoogleDomain(webEl.href)) {
      return webEl.href;
    }

    const allAnchors = Array.from(container.querySelectorAll<HTMLAnchorElement>("a[href^='http']"));
    for (const a of allAnchors) {
      if (a.href && !isInternalGoogleDomain(a.href)) {
        return a.href;
      }
    }
    return "";
  }

  // ── Extract full lead from detail panel ───────────────────────────────────
  function extractFromDetailPanel() {
    const lead = { source: "Google Maps", name: "", phone: "", email: "", website: "", address: "" };

    const detailPane =
      document.querySelector('div[role="main"] div.m6QEdf') ||
      document.querySelector('div.bJ2h1d') ||
      document.querySelector('div[role="main"]') ||
      document;

    // Name
    const titleEl = detailPane.querySelector("h1.DUwDvf, h1.fontTitleLarge, h1");
    lead.name = titleEl?.textContent?.trim() || "";

    // Phone — clean extraction from data-item-id="phone:tel:"
    lead.phone = extractPhoneFromElement(detailPane as HTMLElement);

    // Website — ignores internal Google domains
    lead.website = extractWebsiteFromElement(detailPane as HTMLElement);

    // Address
    const addrEl = detailPane.querySelector(
      'button[data-item-id="address"], button[aria-label*="address" i], button[aria-label*="ঠিকানা" i]'
    );
    if (addrEl) {
      const raw =
        addrEl.getAttribute("aria-label")?.replace(/^address:?\s*/i, "").replace(/^ঠিকানা:?\s*/i, "").trim() ||
        addrEl.textContent?.trim() ||
        "";
      lead.address = raw;
    }

    // Email on Maps panel (if listed)
    const paneText = detailPane.textContent || "";
    const emailMatches = paneText.match(EMAIL_REGEX);
    if (emailMatches) {
      const validEmail = emailMatches.find(
        (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".js") && !e.endsWith(".webp")
      );
      if (validEmail) lead.email = validEmail;
    }

    return lead;
  }

  // ── Generic page scraper (Facebook, LinkedIn, etc.) ───────────────────────
  async function scrapeGenericPage() {
    console.log("[LeadScraper] Generic scraper on:", window.location.href);
    const pageText = getBodyText();
    const title = document.title || document.querySelector("h1")?.textContent || "";
    const emails = Array.from(new Set(pageText.match(EMAIL_REGEX) || [])).filter(
      (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".svg")
    );
    const phones = Array.from(new Set(pageText.match(PHONE_REGEX) || [])).filter(
      (p) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15
    );
    let source = "Web Page";
    if (window.location.hostname.includes("facebook.com")) source = "Facebook";
    if (window.location.hostname.includes("linkedin.com")) source = "LinkedIn";
    const lead = {
      source,
      name: title.trim().substring(0, 100),
      phone: phones[0] || "",
      email: emails[0] || "",
      website: window.location.href,
      address: "",
    };
    if (lead.name && (lead.phone || lead.email)) saveLead(lead);
  }
} catch (globalErr) {
  console.warn("[LeadScraper] Init error:", globalErr);
}
