// Minimal browser/chrome mocks for Node environment
let storage = {};
let sentMessages = [];

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (Array.isArray(keys)) {
          for (const k of keys) result[k] = storage[k];
        } else if (typeof keys === 'string') {
          result[keys] = storage[keys];
        } else {
          Object.assign(result, storage);
        }
        cb(JSON.parse(JSON.stringify(result)));
      },
      set: (data, cb) => {
        Object.assign(storage, JSON.parse(JSON.stringify(data)));
        cb?.();
      },
      remove: (keys, cb) => {
        if (Array.isArray(keys)) {
          for (const k of keys) delete storage[k];
        } else if (typeof keys === 'string') {
          delete storage[keys];
        }
        cb?.();
      },
    },
  },
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => {
      sentMessages.push(msg);
      cb?.({});
    },
    onMessage: { addListener: () => {} },
  },
  downloads: {
    download: (opts, cb) => cb?.(),
  },
};

import assert from 'node:assert';
import {
  normalizeUrl,
  isInternalGoogleDomain,
  unwrapGoogleRedirect,
  isSocialSharingOrExcluded,
  extractFacebook,
} from '../src/lib/url.ts';
import {
  normalizeName,
  namesMatch,
  getFtid,
  cleanAddressText,
  parseCardName,
} from '../src/content/domUtils.ts';
import {
  extractPhoneDigits,
  findDuplicateIndex,
  enqueueSaveLead,
  clearSearchGroups,
  getSearchGroups,
  saveSearchGroups,
  deleteLead,
  deleteSearchGroup,
  setExtractionStatus,
  getKnownLeadsForQuery,
} from '../src/background/storage.ts';
import { getScrollContainer, extractFromDetailPanel } from '../src/content/mapsScraper.ts';
import {
  generateCsv,
  generateXml,
} from '../src/lib/exporters.ts';

console.log('--- Running Tests ---');

// 1. normalizeName & namesMatch
console.log('Testing normalizeName & namesMatch...');
assert.strictEqual(normalizeName('Pet Bangla!'), 'petbangla');
assert.strictEqual(namesMatch('Pet Bangla', 'Pet Bangla'), true);
assert.strictEqual(namesMatch('Pet Bangla', 'pet bangla'), true);
assert.strictEqual(namesMatch('Pet Bangla', 'Pet Bangla (Mirpur 10)'), true);
assert.strictEqual(namesMatch('Pet Bangla (Mirpur 10)', 'Pet Bangla'), true);
assert.strictEqual(namesMatch('', 'Pet Bangla'), false);
assert.strictEqual(namesMatch('Pet Bangla', ''), false);
assert.strictEqual(namesMatch('ABC', 'ABCDEF'), false, 'sub-4 char substring should not match');
assert.strictEqual(namesMatch('ABC', 'ABC'), true, 'exact short name matches');

// Bengali support
assert.strictEqual(normalizeName('পেট বাংলা'), 'পেটবাংলা');
assert.strictEqual(namesMatch('পেট বাংলা', 'পেট বাংলা (মিরপুর ১০)'), true);
assert.strictEqual(namesMatch('মিরপুর ১০ পেট শপ', 'পেট শপ'), true);

// 2. getFtid
console.log('Testing getFtid...');
const mapsUrl1 = 'https://www.google.com/maps/place/Pet+Bangla/@23.807185,90.3686687,17z/data=!3m1!4b1!4m6!3m5!1s0x3755c129e0ef61e5:0x6a7eec6a7b7d6fa2!8m2!3d23.807185!4d90.3686687!16s%2Fg%2F11b8zbgw6m';
assert.strictEqual(getFtid(mapsUrl1), '0x3755c129e0ef61e5:0x6a7eec6a7b7d6fa2');
assert.strictEqual(getFtid('https://google.com/maps/search/pet+shop'), '');

// 3. unwrapGoogleRedirect
console.log('Testing unwrapGoogleRedirect...');
const redirectUrl = 'https://www.google.com/url?q=http%3A%2F%2Fwww.petbangla.com%2F&sa=D&sntz=1&usg=AOvVaw0...';
assert.strictEqual(unwrapGoogleRedirect(redirectUrl), 'http://www.petbangla.com/');
assert.strictEqual(unwrapGoogleRedirect('http://www.petbangla.com/'), 'http://www.petbangla.com/');

// 4. isSocialSharingOrExcluded & isInternalGoogleDomain
console.log('Testing isSocialSharingOrExcluded...');
assert.strictEqual(isSocialSharingOrExcluded('http://www.petbangla.com/'), false);
assert.strictEqual(isSocialSharingOrExcluded('https://www.facebook.com/petbangla'), false);
assert.strictEqual(isSocialSharingOrExcluded('https://www.facebook.com/sharer/sharer.php?u=foo'), true);
assert.strictEqual(isSocialSharingOrExcluded('https://twitter.com/intent/tweet?url=foo'), true);
assert.strictEqual(isSocialSharingOrExcluded('https://wa.me/?text=foo'), true);
assert.strictEqual(isSocialSharingOrExcluded('https://www.google.com/maps/place/...'), true);
assert.strictEqual(isSocialSharingOrExcluded('mailto:test@example.com'), true);
assert.strictEqual(isSocialSharingOrExcluded('tel:01784000999'), true);

// 5. extractFacebook
console.log('Testing extractFacebook...');
assert.strictEqual(extractFacebook('https://www.facebook.com/petbangla'), 'https://www.facebook.com/petbangla');
assert.strictEqual(extractFacebook('https://m.facebook.com/petbangla'), 'https://m.facebook.com/petbangla');
assert.strictEqual(extractFacebook('http://fb.com/petbangla'), 'http://fb.com/petbangla');
assert.strictEqual(extractFacebook('http://www.petbangla.com/'), undefined);
assert.strictEqual(extractFacebook(''), undefined);

// 6. cleanAddressText & parseCardName
console.log('Testing cleanAddressText & parseCardName...');
assert.strictEqual(cleanAddressText('Address: Road 10, Mirpur, Dhaka'), 'Road 10, Mirpur, Dhaka');
assert.strictEqual(cleanAddressText('ঠিকানা: রোড ১০, মিরপুর, ঢাকা'), 'রোড ১০, মিরপুর, ঢাকা');
assert.strictEqual(parseCardName('Pet Bangla · 4.5 ★ (120) · Pet store'), 'Pet Bangla');
assert.strictEqual(parseCardName('Pet Bangla\nMirpur 10'), 'Pet Bangla');
assert.strictEqual(parseCardName('A • B Studios'), 'A • B Studios');
assert.strictEqual(parseCardName('A • B Studios · 4.9 ★ (85)'), 'A • B Studios');
assert.strictEqual(parseCardName('A • B'), 'A • B');
assert.strictEqual(parseCardName('পেট বাংলা · ৪.৫ ★ (১২০) · পেট শপ'), 'পেট বাংলা');
assert.strictEqual(parseCardName('AB · 4.5 ★'), 'AB');

// 7. findDuplicateIndex
console.log('Testing findDuplicateIndex...');
const existing = [
  { id: '1', source: 'Google Maps', name: 'Pet Bangla', phone: '01784000999', email: '', website: 'http://petbangla.com', address: 'Road 10, Mirpur', facebook: 'https://facebook.com/petbangla' },
  { id: '2', source: 'Google Maps', name: 'Dhaka Pet Zone', phone: '', email: '', website: 'https://dhakapet.com', address: 'Sector 4, Uttara' },
  { id: '3', source: 'Google Maps', name: 'Mirpur Birds & Pet', phone: '', email: '', website: '', address: 'Plot 5, Section 10, Mirpur 10, Dhaka 1216' },
];

// Match by phone
assert.strictEqual(findDuplicateIndex({ id: 'c1', source: 'Google Maps', name: 'Different Name', phone: '01784-000999', email: '', website: '' }, existing), 0);

// Match by Facebook URL
assert.strictEqual(findDuplicateIndex({ id: 'c2', source: 'Google Maps', name: 'Different Name FB', phone: '', email: '', website: '', facebook: 'https://facebook.com/petbangla' }, existing), 0);

// Match by name + website
assert.strictEqual(findDuplicateIndex({ id: 'c3', source: 'Google Maps', name: 'Dhaka Pet Zone', phone: '', email: '', website: 'https://dhakapet.com' }, existing), 1);

// Match by name + address
assert.strictEqual(findDuplicateIndex({ id: 'c4', source: 'Google Maps', name: 'Mirpur Birds & Pet', phone: '', email: '', website: '', address: 'Plot 5, Section 10, Mirpur 10, Dhaka 1216' }, existing), 2);

// Ensure empty string websites are not treated as duplicate matches
assert.strictEqual(findDuplicateIndex({ id: 'c5', source: 'Google Maps', name: 'Mirpur Birds & Pet', phone: '', email: '', website: '', address: 'Different Street 123' }, existing), -1);

// Non-duplicate
assert.strictEqual(findDuplicateIndex({ id: 'c6', source: 'Google Maps', name: 'Brand New Shop', phone: '01999999999', email: '', website: 'https://newshop.com' }, existing), -1);

// 8. generateCsv & generateXml (checking Facebook column at end)
console.log('Testing generateCsv & generateXml...');
const sampleLeads = [
  {
    id: 'l1',
    source: 'Google Maps',
    name: 'Pet Bangla',
    phone: '01784000999',
    email: 'info@petbangla.com',
    website: '',
    address: 'Road 10, Mirpur',
    facebook: 'https://facebook.com/petbangla',
  },
  {
    id: 'l2',
    source: 'Google Maps',
    name: 'No Web Shop',
    phone: '01700000000',
    email: '',
    website: '',
    address: 'Mirpur 10',
  },
];

const csv = generateCsv(sampleLeads);
assert.ok(csv.startsWith('\uFEFFSource,Name,Phone,Email,Website,Address,Facebook'), 'CSV header should have Facebook at the end');
assert.ok(csv.includes('"Google Maps","Pet Bangla","01784000999","info@petbangla.com","","Road 10, Mirpur","https://facebook.com/petbangla"'));
assert.ok(csv.includes('"Google Maps","No Web Shop","01700000000","","","Mirpur 10",""'));

const xml = generateXml(sampleLeads);
assert.ok(xml.includes('<source>Google Maps</source>'));
assert.ok(xml.includes('<name>Pet Bangla</name>'));
assert.ok(xml.includes('<facebook>https://facebook.com/petbangla</facebook>'));
assert.ok(xml.includes('<facebook></facebook>'));

// 9. Storage, SearchGroups, Migration, and Scoped Deduplication
console.log('Testing SearchGroups, migration & scoped deduplication...');
await clearSearchGroups();

// 9.1: Automatic migration from legacy leads
storage = {
  leads: [
    { source: 'Google Maps', name: 'Legacy Lead 1', phone: '01711111111', email: '', website: '' },
    { source: 'Google Maps', name: 'Legacy Lead 2', phone: '01722222222', email: '', website: '' },
  ],
};
const migrated = await getSearchGroups();
assert.strictEqual(migrated.length, 1, 'Should migrate legacy leads into 1 SearchGroup');
assert.strictEqual(migrated[0].query, 'Previous Leads');
assert.strictEqual(migrated[0].leads.length, 2);
assert.ok(migrated[0].leads[0].id, 'Migrated leads must have IDs assigned');

// Clear storage for fresh test
await clearSearchGroups();

// 9.2: Save leads under query "pet shop mirpur 10"
await setExtractionStatus({ isExtracting: true, activeQuery: 'pet shop mirpur 10' });

const res1 = await enqueueSaveLead({
  id: '',
  source: 'Google Maps',
  name: 'Pet Bangla',
  phone: '01784-000999',
  email: '',
  website: '',
  address: '',
});
assert.strictEqual(res1.status, 'ok');
assert.strictEqual(res1.count, 1);

// 9.3: Merging duplicate within the same group
sentMessages = [];
const res2 = await enqueueSaveLead({
  id: '',
  source: 'Google Maps',
  name: 'Pet Bangla',
  phone: '01784000999',
  email: '',
  website: 'http://www.petbangla.com/',
  address: 'House 1, Road 10, Mirpur',
  facebook: 'https://facebook.com/petbangla',
});
assert.strictEqual(res2.status, 'merged');
assert.strictEqual(res2.count, 1);

let groups = await getSearchGroups();
assert.strictEqual(groups.length, 1);
assert.strictEqual(groups[0].query, 'pet shop mirpur 10');
assert.strictEqual(groups[0].leads.length, 1);
assert.strictEqual(groups[0].leads[0].website, 'http://www.petbangla.com/');
assert.strictEqual(groups[0].leads[0].address, 'House 1, Road 10, Mirpur');
assert.strictEqual(groups[0].leads[0].facebook, 'https://facebook.com/petbangla');
assert.ok(sentMessages.some((m) => m.type === 'SEARCH_GROUPS_UPDATED'));

// 9.4: Cross-group isolation test:
// Switch active query to "schools in mirpur". Even with identical phone/name,
// it belongs to a different search group and must NOT merge into "pet shop mirpur 10"!
await setExtractionStatus({ isExtracting: true, activeQuery: 'schools in mirpur' });

const resSchool = await enqueueSaveLead({
  id: '',
  source: 'Google Maps',
  name: 'Pet Bangla',
  phone: '01784-000999',
  email: '',
  website: 'http://www.petbangla.com/',
});
assert.strictEqual(resSchool.status, 'ok', 'Should create a new lead in the new search group');
assert.strictEqual(resSchool.count, 1);

groups = await getSearchGroups();
assert.strictEqual(groups.length, 2, 'Should have 2 distinct search groups');
assert.strictEqual(groups[0].query, 'schools in mirpur');
assert.strictEqual(groups[1].query, 'pet shop mirpur 10');
assert.strictEqual(groups[0].leads.length, 1);
assert.strictEqual(groups[1].leads.length, 1);

// 9.5: Delete single lead from group
console.log('Testing deleteLead...');
const schoolGroupId = groups[0].id;
const schoolLeadId = groups[0].leads[0].id;
assert.ok(schoolLeadId, 'Lead must have a valid ID');

const afterLeadDelete = await deleteLead(schoolGroupId, schoolLeadId);
const targetGroup = afterLeadDelete.find((g) => g.id === schoolGroupId);
assert.strictEqual(targetGroup.leads.length, 0, 'Target group lead must be deleted');

// 9.6: Delete search group by ID
console.log('Testing deleteSearchGroup...');
const afterGroupDelete = await deleteSearchGroup(schoolGroupId);
assert.strictEqual(afterGroupDelete.length, 1, 'Only 1 search group should remain');
assert.strictEqual(afterGroupDelete[0].query, 'pet shop mirpur 10');

// 9.7: Resumable incremental extraction on duplicate search queries
console.log('Testing resumable incremental extraction on duplicate search queries...');
await clearSearchGroups();
const queryIncremental = 'pet shop in mirpur 10';
await setExtractionStatus({ isExtracting: true, activeQuery: queryIncremental });

// Step 1: Save 5 initial leads
for (let i = 1; i <= 5; i++) {
  await enqueueSaveLead({
    id: '',
    source: 'Google Maps',
    name: `Shop ${i}`,
    phone: `0170000000${i}`,
    email: '',
    website: `http://shop${i}.com`,
    address: `Mirpur 10 Road ${i}`,
  });
}

// Step 2: Stop extraction and verify initial count
await setExtractionStatus({ isExtracting: false, activeQuery: '' });
let incGroups = await getSearchGroups();
assert.strictEqual(incGroups.length, 1, 'Should have exactly 1 group');
assert.strictEqual(incGroups[0].query, queryIncremental);
assert.strictEqual(incGroups[0].leads.length, 5, 'Should have 5 initial leads');

// Step 3: Check getKnownLeadsForQuery
const known = await getKnownLeadsForQuery(queryIncremental);
assert.strictEqual(known.phoneDigits.length, 5, 'Should have 5 known phones');
assert.strictEqual(known.normalizedNames.length, 5, 'Should have 5 known names');
assert.strictEqual(known.websites.length, 5, 'Should have 5 known websites');

// Step 4: Run search again with same query, re-feeding 5 existing (skipped/merged) + 3 new leads
await setExtractionStatus({ isExtracting: true, activeQuery: queryIncremental });

// Re-saving existing leads must not duplicate them
for (let i = 1; i <= 5; i++) {
  const res = await enqueueSaveLead({
    id: '',
    source: 'Google Maps',
    name: `Shop ${i}`,
    phone: `0170000000${i}`,
    email: `shop${i}@example.com`, // merged email
    website: `http://shop${i}.com`,
    address: `Mirpur 10 Road ${i}`,
  });
  assert.strictEqual(res.status, 'merged');
}

// 3 completely new leads (Leads 6 to 8)
for (let i = 6; i <= 8; i++) {
  const res = await enqueueSaveLead({
    id: '',
    source: 'Google Maps',
    name: `Shop ${i}`,
    phone: `0170000000${i}`,
    email: '',
    website: `http://shop${i}.com`,
    address: `Mirpur 10 Road ${i}`,
  });
  assert.strictEqual(res.status, 'ok');
}

// Step 5: Verify group is reused and leads are appended from 5 to 8 without duplicate groups
incGroups = await getSearchGroups();
assert.strictEqual(incGroups.length, 1, 'Must NOT create duplicate search groups for same query');
assert.strictEqual(incGroups[0].leads.length, 8, 'Leads must append incrementally from 5 to 8');
assert.strictEqual(incGroups[0].leads[0].email, 'shop1@example.com', 'Existing lead merged email properly');
assert.strictEqual(incGroups[0].leads[7].name, 'Shop 8', 'New lead appended correctly at the end');

// 10. getScrollContainer
console.log('Testing getScrollContainer...');
const dummyFeed = {
  scrollHeight: 500,
  clientHeight: 500,
  parentElement: {
    scrollHeight: 1000,
    clientHeight: 600,
    parentElement: null,
  },
};
const foundContainer = getScrollContainer(dummyFeed);
assert.strictEqual(foundContainer, dummyFeed.parentElement);

// 11. extractFromDetailPanel Facebook vs Website separation
console.log('Testing extractFromDetailPanel Facebook vs Website separation...');
const mockFbPane = {
  getAttribute: (attr) => (attr === 'aria-label' ? 'Pet Bangla FB' : null),
  querySelector: (sel) => {
    if (sel === 'h1') return { textContent: 'Pet Bangla FB' };
    if (sel.includes('authority')) return { href: 'https://www.facebook.com/petbangla', getAttribute: () => 'https://www.facebook.com/petbangla' };
    return null;
  },
  querySelectorAll: () => [],
  textContent: '',
};
const fbLead = extractFromDetailPanel(mockFbPane);
assert.strictEqual(fbLead.website, '', 'Facebook link should not be assigned to website');
assert.strictEqual(fbLead.facebook, 'https://www.facebook.com/petbangla', 'Facebook link should be assigned to facebook');
assert.ok(fbLead.id, 'extractFromDetailPanel must assign a lead ID');

const mockWebPane = {
  getAttribute: (attr) => (attr === 'aria-label' ? 'Pet Bangla Web' : null),
  querySelector: (sel) => {
    if (sel === 'h1') return { textContent: 'Pet Bangla Web' };
    if (sel.includes('authority')) return { href: 'http://petbangla.com/', getAttribute: () => 'http://petbangla.com/' };
    return null;
  },
  querySelectorAll: () => [],
  textContent: '',
};
const webLead = extractFromDetailPanel(mockWebPane);
assert.strictEqual(webLead.website, 'http://petbangla.com/', 'Regular website should be assigned to website');
assert.strictEqual(webLead.facebook, undefined, 'Regular website should not populate facebook');
assert.ok(webLead.id, 'extractFromDetailPanel must assign a lead ID');

console.log('All tests passed successfully!');
