try {
  let isExtracting = false;
  console.log("[LeadScraper] Content script loaded on:", window.location.href);

  const getBodyText = () =>
    document.body?.textContent || document.documentElement?.textContent || "";

  // ── Message listener ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((req: any, _sender, sendResponse: any) => {
    try {
      if (req.action === "PING") {
        sendResponse({ alive: true, url: window.location.href });
        return true;
      }
      if (req.action === "START_SCRAPING") {
        if (isExtracting) { sendResponse({ status: "already_running" }); return true; }
        isExtracting = true;
        startScrapeProcess()
          .catch((err) => {
            console.error("[LeadScraper] Error:", err);
            chrome.runtime.sendMessage({ type: "EXTRACTION_ERROR", message: String(err?.message || err) }, () => { chrome.runtime.lastError; });
          })
          .finally(() => {
            isExtracting = false;
            chrome.runtime.sendMessage({ type: "EXTRACTION_DONE" }, () => { chrome.runtime.lastError; });
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

  // ── Helpers ────────────────────────────────────────────────────────────────
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  async function waitFor(selector: string, timeout = 12000): Promise<Element | null> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const el = document.querySelector(selector);
      if (el) return el;
      await sleep(300);
    }
    return null;
  }

  // Wait for h1 to change to a DIFFERENT value than prevText (means panel updated)
  async function waitForPanelUpdate(prevH1Text: string, timeout = 5000): Promise<void> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const h1 = getDetailPanelH1();
      if (h1 && h1 !== prevH1Text) return; // panel updated!
      await sleep(150);
    }
    // fallback
    await sleep(800);
  }

  // Get the h1 from the detail panel only (not the search results title)
  function getDetailPanelH1(): string {
    // Google Maps detail panel is inside these containers
    const panel =
      document.querySelector('div[role="main"] div.m6QEdf') ||
      document.querySelector('div.bJ2h1d') ||
      document.querySelector('div[data-section-id="ap"]') ||
      document.querySelector('div[jsaction*="pane"]');

    if (panel) {
      const h1 = panel.querySelector('h1');
      if (h1?.textContent?.trim()) return h1.textContent.trim();
    }

    // Broader fallback
    const h1 = document.querySelector('h1.DUwDvf, h1.fontTitleLarge');
    return h1?.textContent?.trim() || '';
  }

  const PHONE_REGEX = /(?:\+?[\d]{1,4}[-.\s]?)?\(?[\d]{2,5}\)?[-.\s]?[\d]{3,5}[-.\s]?[\d]{3,5}/g;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

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
      // Single place view
      const singleLead = extractFromDetailPanel();
      if (singleLead?.name) {
        saveLead(singleLead);
        return;
      }
      chrome.runtime.sendMessage({
        type: "EXTRACTION_ERROR",
        message: "Google Maps search results not found. Please open a search page first.",
      }, () => { chrome.runtime.lastError; });
      return;
    }

    await sleep(1200);

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

      if (newAnchors.length === 0) {
        // Scroll feed to load more
        const currentScroll = feed.scrollTop;
        feed.scrollTop += 600;
        await sleep(2000);

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

        // ── Step 1: Get name from aria-label (most reliable, no click needed) ──
        const cardName =
          anchor.getAttribute("aria-label")?.split("·")[0].split("·")[0].trim() ||
          anchor.textContent?.trim() ||
          "";

        // ── Step 2: Get card-level data without clicking ──
        const cardContainer =
          anchor.closest('div.Nv251d, div[jsaction*="mouseover"], div[role="article"]') ||
          anchor.parentElement?.parentElement ||
          anchor.parentElement;

        const cardPhone = cardContainer ? extractPhoneFromCard(cardContainer as HTMLElement) : "";
        const cardWebsite = cardContainer ? extractWebsiteFromCard(cardContainer as HTMLElement) : "";

        // ── Step 3: Click card and wait for detail panel to update ──
        try {
          anchor.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {}
        await sleep(400);

        // Capture current h1 BEFORE clicking
        const prevH1 = getDetailPanelH1();

        // Click the card
        anchor.click();

        // Wait until h1 CHANGES (means detail panel updated with new place)
        await waitForPanelUpdate(prevH1);

        // ── Step 4: Extract detail panel data ──
        const detail = extractFromDetailPanel();

        // ── Step 5: Build final lead (prefer card name, detail panel for contact) ──
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

        await sleep(300);
      }
    }

    console.log("[LeadScraper] Done. Total processed:", processedIds.size);
  }

  // Extract place ID from Google Maps URL for reliable deduplication
  function getPlaceId(href: string): string {
    try {
      // Extract the place name segment from /maps/place/NAME/...
      const match = href.match(/\/maps\/place\/([^/]+)/);
      if (match) return decodeURIComponent(match[1]);
    } catch {}
    return href; // fallback to full href
  }

  // Save lead to background with proper error handling
  function saveLead(lead: object) {
    chrome.runtime.sendMessage({ type: "SAVE_LEAD", payload: lead }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[LeadScraper] SAVE_LEAD error:", chrome.runtime.lastError.message);
      } else {
        console.log("[LeadScraper] Saved. Total:", res?.count);
      }
    });
  }

  // ── Extract phone from card element ───────────────────────────────────────
  function extractPhoneFromCard(card: HTMLElement): string {
    const text = card.textContent || "";
    const matches = text.match(PHONE_REGEX);
    if (!matches) return "";
    const valid = matches.find(
      (p) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15
    );
    return valid?.trim() || "";
  }

  // ── Extract website from card element ─────────────────────────────────────
  function extractWebsiteFromCard(card: HTMLElement): string {
    const webLink = card.querySelector<HTMLAnchorElement>(
      'a[aria-label*="website" i], a[aria-label*="ওয়েবসাইট" i], a[data-value="Website"]'
    );
    if (webLink?.href && !webLink.href.includes("google.com")) return webLink.href;
    return "";
  }

  // ── Extract full lead from detail panel ───────────────────────────────────
  function extractFromDetailPanel() {
    const lead = { source: "Google Maps", name: "", phone: "", email: "", website: "", address: "" };

    // Find the detail panel container — check multiple possible selectors
    const detailPane =
      document.querySelector('div[role="main"] div.m6QEdf') ||
      document.querySelector('div.bJ2h1d') ||
      document.querySelector('div[role="main"]') ||
      document;

    // Name
    const titleEl = detailPane.querySelector("h1.DUwDvf, h1.fontTitleLarge, h1");
    lead.name = titleEl?.textContent?.trim() || "";

    // Phone — Google Maps stores phone in data-item-id="phone:tel:NUMBER"
    const phoneEl =
      detailPane.querySelector('[data-item-id^="phone:tel:"]') ||
      detailPane.querySelector('button[data-tooltip*="phone" i]') ||
      detailPane.querySelector('button[aria-label*="phone" i], button[aria-label*="Phone" i]') ||
      detailPane.querySelector('button[aria-label*="ফোন" i]') ||
      detailPane.querySelector('[data-item-id*="phone"]');

    if (phoneEl) {
      const itemId = phoneEl.getAttribute("data-item-id") || "";
      if (itemId.startsWith("phone:tel:")) {
        lead.phone = itemId.replace("phone:tel:", "").trim();
      } else {
        const label = phoneEl.getAttribute("aria-label") || phoneEl.textContent || "";
        const m = label.match(/[\d][\d\s\-().+]{6,}/);
        if (m) lead.phone = m[0].trim();
      }
    }

    // Fallback phone from text
    if (!lead.phone) {
      const paneText = detailPane.textContent || "";
      const matches = paneText.match(PHONE_REGEX);
      if (matches) {
        const valid = matches.find(
          (p) => p.replace(/\D/g, "").length >= 7 && p.replace(/\D/g, "").length <= 15
        );
        if (valid) lead.phone = valid.trim();
      }
    }

    // Website
    const webEl = detailPane.querySelector<HTMLAnchorElement>(
      'a[data-item-id="authority"], a[aria-label*="website" i], a[data-tooltip*="website" i], a[aria-label*="ওয়েবসাইট" i]'
    );
    if (webEl?.href && !webEl.href.includes("google.com")) {
      lead.website = webEl.href;
    } else {
      const external = Array.from(
        detailPane.querySelectorAll<HTMLAnchorElement>("a[href^='http']")
      ).find(
        (a) =>
          a.href &&
          !a.href.includes("google.com") &&
          !a.href.includes("gstatic.com") &&
          !a.href.includes("ggpht.com")
      );
      if (external) lead.website = external.href;
    }

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

    // Email
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
