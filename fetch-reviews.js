// GitHub Action script to fetch Google reviews
// Runs every 4 days, saves to reviews.json
// Hard limit: stops if request count exceeds 10/month

const https = require('https');
const fs = require('fs');

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const PLACE_ID = 'ChIJjb-wxc25l0cRy7ET2a0f6OE'; // KAIRO 1980 Hockenheim
const OUTPUT_FILE = 'reviews.json';
const MAX_REQUESTS_PER_MONTH = 10;

// Check request counter
let requestLog = { month: new Date().getMonth(), count: 0 };
if (fs.existsSync('request-log.json')) {
  requestLog = JSON.parse(fs.readFileSync('request-log.json', 'utf8'));
  // Reset counter if new month
  if (requestLog.month !== new Date().getMonth()) {
    requestLog = { month: new Date().getMonth(), count: 0 };
  }
}

// Hard stop if too many requests
if (requestLog.count >= MAX_REQUESTS_PER_MONTH) {
  console.log(`❌ Request limit reached (${MAX_REQUESTS_PER_MONTH}/month). Skipping.`);
  process.exit(0);
}

const url = `https://places.googleapis.com/v1/places/${PLACE_ID}?fields=rating,userRatingCount,reviews&languageCode=de&key=${API_KEY}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const place = JSON.parse(data);

      if (!place.rating) {
        console.log('❌ No data returned:', data);
        process.exit(1);
      }

      // Update request counter
      requestLog.count++;
      fs.writeFileSync('request-log.json', JSON.stringify(requestLog));

      // Build reviews output
      const output = {
        lastUpdated: new Date().toISOString(),
        rating: place.rating,
        totalRatings: place.userRatingCount,
        reviews: (place.reviews || [])
          .filter(r => r.rating >= 4) // Only 4 and 5 star reviews
          .slice(0, 10) // Max 10 reviews
          .map(r => ({
            author: r.authorAttribution?.displayName || 'Anonym',
            avatar: r.authorAttribution?.photoUri || '',
            rating: r.rating,
            text: r.text?.text || '',
            time: r.relativePublishTimeDescription || ''
          }))
      };

      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
      console.log(`✅ Fetched ${output.reviews.length} reviews. Rating: ${output.rating}⭐ (${output.totalRatings} total)`);
      console.log(`📊 API requests this month: ${requestLog.count}/${MAX_REQUESTS_PER_MONTH}`);

    } catch(e) {
      console.log('❌ Error parsing response:', e.message);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.log('❌ Request failed:', e.message);
  process.exit(1);
});
