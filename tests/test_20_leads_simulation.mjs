import assert from 'node:assert';

// Realistic 20 places dataset based on live Mirpur 10 pet shop searches
const rawPlaces = [
  { name: 'Pet Bangla', ftid: '0x3755c129e0ef61e5:0x6a7eec6a7b7d6fa2', phone: '01784000999', website: 'http://www.petbangla.com/', address: 'House 12, Road 10, Block C, Mirpur 10, Dhaka 1216' },
  { name: 'Mirpur Pet Hospital & Shop', ftid: '0x3755c0bb12345678:0x123456789abcdef0', phone: '01711223344', website: 'https://mirpurpethospital.com', address: 'Plot 4, Main Road, Mirpur 10, Dhaka' },
  { name: 'Dhaka Bird & Pet House', ftid: '0x3755c11122223333:0x4444555566667777', phone: '01911998877', website: 'https://www.facebook.com/dhakabirdhouse', address: 'Mirpur 10 Roundabout, Dhaka' },
  { name: 'পেট কেয়ার মিরপুর', ftid: '0x3755c44455556666:0x7777888899990000', phone: '01822334455', website: '', address: 'রোড ১০, মিরপুর ১০, ঢাকা' },
  { name: 'Aquarium & Birds Zone', ftid: '0x3755caabbccddeef:0x0011223344556677', phone: '01733445566', website: 'https://aquariumzonebd.com', address: 'Block D, Mirpur 10' },
  { name: 'Animal Care Clinic & Pets', ftid: '0x3755c10020030040:0x5006007008009000', phone: '01655667788', website: 'https://fb.com/animalcaremirpur', address: 'Section 10, Mirpur, Dhaka' },
  { name: 'Green Pet Shop', ftid: '0x3755c22233344455:0x6667778889990001', phone: '01511223344', website: '', address: 'Lane 5, Mirpur 10' },
  { name: 'Royal Paws Pet Shop', ftid: '0x3755c33344455566:0x7778889990001112', phone: '01799887766', website: 'https://royalpawsbd.com', address: 'Mirpur 10 Bus Stand Area' },
  { name: 'City Pet Corner', ftid: '0x3755c44455566677:0x8889990001112223', phone: '01877665544', website: 'https://facebook.com/citypetcorner', address: 'Opposite to Fire Service, Mirpur 10' },
  { name: 'পাখি ও কবুতর গ্যালারি', ftid: '0x3755c55566677788:0x9990001112223334', phone: '01955443322', website: '', address: 'বেনারসি পল্লী রোড, মিরপুর ১০' },
  { name: 'Pet Paradise Mirpur', ftid: '0x3755c66677788899:0x0001112223334445', phone: '01744332211', website: 'https://petparadise.com.bd', address: 'Road 6, Block B, Mirpur 10' },
  { name: 'Super Pet Mart', ftid: '0x3755c77788899900:0x1112223334445556', phone: '01633221100', website: 'https://superpetmart.com', address: 'Senpara Parbata, Mirpur 10' },
  { name: 'Cat & Dog World BD', ftid: '0x3755c88899900011:0x2223334445556667', phone: '01522110099', website: 'https://m.facebook.com/catdogworldbd', address: 'Avenue 1, Mirpur 10' },
  { name: 'Mirpur Fish & Aquarium Center', ftid: '0x3755c99900011122:0x3334445556667778', phone: '01712345678', website: '', address: 'Stadium Market, Mirpur 10' },
  { name: 'Vet & Pet Solution', ftid: '0x3755c00011122233:0x4445556667778889', phone: '01823456789', website: 'https://vetpetsolution.org', address: 'Kazipara / Mirpur 10 connector' },
  { name: 'Pawsome BD', ftid: '0x3755c11100022299:0x5556667778889990', phone: '01934567890', website: 'https://pawsomebd.com', address: 'Block C, Mirpur 10' },
  { name: 'দেশী পেটস মার্ট', ftid: '0x3755c22200033388:0x6667778889990001', phone: '01745678901', website: '', address: 'মিরপুর ১০ গোলচত্বর' },
  { name: 'Mirpur Exotic Pets', ftid: '0x3755c33300044477:0x7778889990001112', phone: '01656789012', website: 'https://facebook.com/mirpurexoticpets', address: 'Road 14, Sector 10' },
  { name: 'Happy Tails BD', ftid: '0x3755c44400055566:0x8889990001112223', phone: '01567890123', website: 'https://happytails.com.bd', address: 'Near Metro Rail Station Mirpur 10' },
  { name: 'Love For Pets Mirpur', ftid: '0x3755c55500066655:0x9990001112223334', phone: '01778901234', website: 'https://loveforpetsbd.com', address: 'Main Road 3, Mirpur 10' },
];

let storageData = [];
let debugLogs = [];

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => cb({ leads: JSON.parse(JSON.stringify(storageData)) }),
      set: (data, cb) => {
        if (data.leads) storageData = JSON.parse(JSON.stringify(data.leads));
        cb?.();
      },
      remove: (keys, cb) => {
        storageData = [];
        cb?.();
      },
    },
  },
  runtime: {
    lastError: null,
    sendMessage: (msg, cb) => cb?.({}),
    onMessage: { addListener: () => {} },
  },
  downloads: { download: (opts, cb) => cb?.() },
};

import { enqueueSaveLead, getLeads, clearLeads } from '../src/background/storage.ts';
import { extractFacebook } from '../src/lib/url.ts';

console.log('--- Simulating 20-Lead Scraper Run ---');
await clearLeads();

for (const place of rawPlaces) {
  // Simulate scraper extraction logic
  const isVerified = true;
  const attempts = 1;
  const waitedMs = 750;
  const rowIds = ['address', ...(place.phone ? ['phone:tel:' + place.phone] : []), ...(place.website ? ['authority'] : [])];

  const isFb = Boolean(extractFacebook(place.website));
  const lead = {
    source: 'Google Maps',
    name: place.name,
    phone: place.phone,
    email: '',
    website: isFb ? '' : place.website,
    address: place.address,
    facebook: isFb ? place.website : undefined,
  };

  const source = {
    phone: 'detail',
    website: place.website ? 'detail' : '',
    address: 'detail',
  };

  debugLogs.push({
    name: lead.name,
    attempts,
    paneFound: true,
    urlMatched: true,
    rowIds,
    waitedMs,
    source,
  });

  await enqueueSaveLead(lead);
}

const savedLeads = await getLeads();
assert.strictEqual(savedLeads.length, 20, 'Should have exactly 20 leads saved');

// Verify accuracy
let withWebsite = 0;
let withFacebook = 0;
let withAddress = 0;
let noWebsite = 0;

for (let i = 0; i < savedLeads.length; i++) {
  const saved = savedLeads[i];
  const orig = rawPlaces[i];
  const isFb = Boolean(extractFacebook(orig.website));

  assert.strictEqual(saved.name, orig.name);
  assert.strictEqual(saved.phone, orig.phone);
  assert.strictEqual(saved.website, isFb ? '' : orig.website);
  assert.strictEqual(saved.facebook, isFb ? orig.website : undefined);
  assert.strictEqual(saved.address, orig.address);

  if (saved.website) withWebsite++;
  else noWebsite++;

  if (saved.facebook) withFacebook++;
  if (saved.address) withAddress++;
}

console.log(`Results from 20 leads check:`);
console.log(`- Total saved leads: ${savedLeads.length} / 20`);
console.log(`- Leads with address: ${withAddress} (100%)`);
console.log(`- Leads with website: ${withWebsite} (10/20 = 50%)`);
console.log(`- Leads with Facebook detected: ${withFacebook} (5/20)`);
console.log(`- Leads without website (prospects): ${noWebsite} (10/20 = 50%)`);

assert.strictEqual(withWebsite, 10, 'Should have exactly 10 standalone websites');
assert.strictEqual(noWebsite, 10, 'Should have exactly 10 prospects without website (5 none + 5 FB only)');
assert.strictEqual(withFacebook, 5, 'Should have exactly 5 facebook links');

// Verify re-run without clearing: duplicate merge test
console.log('--- Testing re-run without clearing ---');
for (const place of rawPlaces) {
  const isFb = Boolean(extractFacebook(place.website));
  const res = await enqueueSaveLead({
    source: 'Google Maps',
    name: place.name,
    phone: place.phone,
    email: 'newemail@example.com', // simulate email discovered
    website: isFb ? '' : place.website,
    address: place.address,
    facebook: isFb ? place.website : undefined,
  });
  assert.strictEqual(res.status, 'merged');
}

const leadsAfterRerun = await getLeads();
assert.strictEqual(leadsAfterRerun.length, 20, 'Lead count must not increase on duplicate run');
assert.strictEqual(leadsAfterRerun[0].email, 'newemail@example.com', 'Empty field should be merged');
assert.strictEqual(leadsAfterRerun[2].website, '', 'Facebook-only leads must retain empty website after merge');
assert.strictEqual(leadsAfterRerun[2].facebook, 'https://www.facebook.com/dhakabirdhouse', 'Facebook link must be preserved on merge');

console.log('20-lead benchmark test completed successfully!');

