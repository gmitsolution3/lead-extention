import assert from 'node:assert';

// Mock minimal DOM environment
class MockElement {
  constructor(tagName, attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parentElement = parent;
    this.textContent = attrs.textContent || '';
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, val) {
    this.attrs[name] = val;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  querySelector(selector) {
    const all = this.querySelectorAll(selector);
    return all[0] || null;
  }

  querySelectorAll(selector) {
    const results = [];
    const match = (el) => {
      if (selector === '[role="main"]' && el.getAttribute('role') === 'main') return true;
      if (selector === '[role="feed"]' && el.getAttribute('role') === 'feed') return true;
      if (selector === '[data-item-id]' && el.getAttribute('data-item-id') !== null) return true;
      if (selector === 'h1' && el.tagName === 'H1') return true;
      if (selector.includes('data-item-id="address"') && el.getAttribute('data-item-id') === 'address') return true;
      if (selector.includes('data-item-id="authority"') && el.getAttribute('data-item-id') === 'authority') return true;
      if (selector.includes('data-item-id^="phone:tel:"') && (el.getAttribute('data-item-id') || '').startsWith('phone:tel:')) return true;
      return false;
    };

    const traverse = (node) => {
      for (const c of node.children) {
        if (match(c)) results.push(c);
        traverse(c);
      }
    };
    traverse(this);
    return results;
  }

  checkVisibility() {
    return true;
  }

  getClientRects() {
    return [{ width: 100, height: 100 }];
  }
}

class MockDocument extends MockElement {
  constructor() {
    super('#document');
  }
}

const mockDoc = new MockDocument();
globalThis.document = mockDoc;
globalThis.location = {
  href: 'https://www.google.com/maps/place/Pet+Bangla/@23.807185,90.3686687,17z/data=!1s0x3755c129e0ef61e5:0x6a7eec6a7b7d6fa2',
};

// Populate the DOM exactly as verified on live Maps
// 1. Results pane: [role="main"], aria-label is null, contains [role="feed"]
const resultsPane = new MockElement('div', { role: 'main' });
const feed = new MockElement('div', { role: 'feed' });
resultsPane.appendChild(feed);
mockDoc.appendChild(resultsPane);

// 2. Detail pane: [role="main"], aria-label="Pet Bangla", no feed
const detailPane = new MockElement('div', { role: 'main', 'aria-label': 'Pet Bangla' });
const h1 = new MockElement('h1', { textContent: 'Pet Bangla' });
const addressBtn = new MockElement('button', {
  'data-item-id': 'address',
  'aria-label': 'Address: Road 10, Mirpur, Dhaka 1216',
});
const websiteLink = new MockElement('a', {
  'data-item-id': 'authority',
  href: 'http://www.petbangla.com/',
  'aria-label': 'Website: petbangla.com',
});
const phoneBtn = new MockElement('button', {
  'data-item-id': 'phone:tel:01784000999',
  'aria-label': 'Phone: 01784-000999',
});

detailPane.appendChild(h1);
detailPane.appendChild(addressBtn);
detailPane.appendChild(websiteLink);
detailPane.appendChild(phoneBtn);
mockDoc.appendChild(detailPane);

import { findDetailPane, waitForDetailReady } from '../src/content/domUtils.ts';
import { extractFromDetailPanel } from '../src/content/mapsScraper.ts';

console.log('Testing findDetailPane with verified live DOM...');
const foundPane = findDetailPane('Pet Bangla');
assert.ok(foundPane !== null, 'Should find detail pane');
assert.strictEqual(foundPane, detailPane, 'Should match detailPane, NOT resultsPane');

console.log('Testing waitForDetailReady...');
const anchorHref = 'https://www.google.com/maps/place/Pet+Bangla/@23.807185,90.3686687,17z/data=!1s0x3755c129e0ef61e5:0x6a7eec6a7b7d6fa2';
const ready = await waitForDetailReady('Pet Bangla', { anchorHref, timeout: 3000, settleMs: 300 });
assert.strictEqual(ready.titleMatched, true, 'titleMatched should be true');
assert.strictEqual(ready.urlMatched, true, 'urlMatched should be true');
assert.strictEqual(ready.pane, detailPane);
assert.ok(ready.rows.includes('address'));
assert.ok(ready.rows.includes('authority'));
assert.ok(ready.rows.includes('phone:tel:01784000999'));

console.log('Testing extractFromDetailPanel on found pane...');
const lead = extractFromDetailPanel(ready.pane);
assert.strictEqual(lead.name, 'Pet Bangla');
assert.strictEqual(lead.phone, '01784000999');
assert.strictEqual(lead.website, 'http://www.petbangla.com/');
assert.strictEqual(lead.address, 'Road 10, Mirpur, Dhaka 1216');

console.log('Testing extractFromDetailPanel on null pane (empty lead return, no body fallback)...');
const empty = extractFromDetailPanel(null);
assert.strictEqual(empty.name, '');
assert.strictEqual(empty.phone, '');
assert.strictEqual(empty.website, '');
assert.strictEqual(empty.address, '');

console.log('DOM simulation test passed successfully!');

