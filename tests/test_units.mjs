// Minimal browser/chrome mocks for Node environment
let storedLeads = [];
let sentMessages = [];

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb({ leads: JSON.parse(JSON.stringify(storedLeads)) }),
      set: (data, cb) => {
        if (data.leads) storedLeads = JSON.parse(JSON.stringify(data.leads));
        cb?.();
      },
      remove: (keys, cb) => {
        storedLeads = [];
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
  clearLeads,
  getLeads,
} from '../src/background/storage.ts';
import { getScrollContainer } from '../src/content/mapsScraper.ts';
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
  { source: 'Google Maps', name: 'Pet Bangla', phone: '01784000999', email: '', website: 'http://petbangla.com', address: 'Road 10, Mirpur' },
  { source: 'Google Maps', name: 'Dhaka Pet Zone', phone: '', email: '', website: 'https://dhakapet.com', address: 'Sector 4, Uttara' },
  { source: 'Google Maps', name: 'Mirpur Birds & Pet', phone: '', email: '', website: '', address: 'Plot 5, Section 10, Mirpur 10, Dhaka 1216' },
];

// Match by phone
assert.strictEqual(findDuplicateIndex({ source: 'Google Maps', name: 'Different Name', phone: '01784-000999', email: '', website: '' }, existing), 0);

// Match by name + website
assert.strictEqual(findDuplicateIndex({ source: 'Google Maps', name: 'Dhaka Pet Zone', phone: '', email: '', website: 'https://dhakapet.com' }, existing), 1);

// Match by name + address
assert.strictEqual(findDuplicateIndex({ source: 'Google Maps', name: 'Mirpur Birds & Pet', phone: '', email: '', website: '', address: 'Plot 5, Section 10, Mirpur 10, Dhaka 1216' }, existing), 2);

// Non-duplicate
assert.strictEqual(findDuplicateIndex({ source: 'Google Maps', name: 'Brand New Shop', phone: '01999999999', email: '', website: 'https://newshop.com' }, existing), -1);

// 8. generateCsv & generateXml (checking Facebook column at end)
console.log('Testing generateCsv & generateXml...');
const sampleLeads = [
  {
    source: 'Google Maps',
    name: 'Pet Bangla',
    phone: '01784000999',
    email: 'info@petbangla.com',
    website: 'https://facebook.com/petbangla',
    address: 'Road 10, Mirpur',
    facebook: 'https://facebook.com/petbangla',
  },
  {
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
assert.ok(csv.includes('"Google Maps","Pet Bangla","01784000999","info@petbangla.com","https://facebook.com/petbangla","Road 10, Mirpur","https://facebook.com/petbangla"'));
assert.ok(csv.includes('"Google Maps","No Web Shop","01700000000","","","Mirpur 10",""'));

const xml = generateXml(sampleLeads);
assert.ok(xml.includes('<source>Google Maps</source>'));
assert.ok(xml.includes('<name>Pet Bangla</name>'));
assert.ok(xml.includes('<facebook>https://facebook.com/petbangla</facebook>'));
assert.ok(xml.includes('<facebook></facebook>'));

// 9. enqueueSaveLead & Merging behavior
console.log('Testing enqueueSaveLead & Merging behavior...');
await clearLeads();

// 9.1: Save partial lead (only name + phone)
const res1 = await enqueueSaveLead({
  source: 'Google Maps',
  name: 'Pet Bangla',
  phone: '01784-000999',
  email: '',
  website: '',
  address: '',
});
assert.strictEqual(res1.status, 'ok');
assert.strictEqual(res1.count, 1);

// 9.2: Duplicate with website and address added -> should merge
sentMessages = [];
const res2 = await enqueueSaveLead({
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

const leadsAfterMerge = await getLeads();
assert.strictEqual(leadsAfterMerge.length, 1);
assert.strictEqual(leadsAfterMerge[0].phone, '01784-000999', 'original phone should be preserved');
assert.strictEqual(leadsAfterMerge[0].website, 'http://www.petbangla.com/');
assert.strictEqual(leadsAfterMerge[0].address, 'House 1, Road 10, Mirpur');
assert.strictEqual(leadsAfterMerge[0].facebook, 'https://facebook.com/petbangla');
assert.ok(sentMessages.some((m) => m.type === 'LEADS_UPDATED'), 'LEADS_UPDATED should be broadcast');

// 9.3: Exact duplicate with no new fields -> should return duplicate status without changing
sentMessages = [];
const res3 = await enqueueSaveLead({
  source: 'Google Maps',
  name: 'Pet Bangla',
  phone: '01784000999',
  email: '',
  website: 'http://www.petbangla.com/',
  address: 'House 1, Road 10, Mirpur',
});
assert.strictEqual(res3.status, 'duplicate');
assert.strictEqual(res3.count, 1);
assert.strictEqual(sentMessages.length, 0, 'No broadcast if unchanged');

// 9.4: Add new unique lead
const res4 = await enqueueSaveLead({
  source: 'Google Maps',
  name: 'Bengal Birds',
  phone: '01811111111',
  email: '',
  website: '',
  address: 'Mirpur 1',
});
assert.strictEqual(res4.status, 'ok');
assert.strictEqual(res4.count, 2);

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

console.log('All tests passed successfully!');
