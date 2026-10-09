// rate.js
// ================================================================
// ⭐ RATE GUILD MEMBERS (Podium votes)
// ================================================================
// What this script does:
//   Step 1: Open the guild page with an internal request and grab the HTML.
//   Step 2: Pull every member's name + lady id out of that HTML,
//           then remove the ladies in the exclusion set.
//   Step 3: Send one rating (3) request for each remaining lady.
//           Safety check: if ALL of the first 5 ratings fail, stop.
// ================================================================


// ================================================================
// ⚙️ SETTINGS: change these whenever you want
// ================================================================

// The guild (club) we want to go to. Change this number to rate another guild.
const GUILD_ID = 1221;

// The rating we give every lady (constant).
const RATING = 3;

// Exclusion set: ladies who must NOT be rated.
// A lady is removed if EITHER her id OR her name matches anything below.
const EXCLUDED_LADY_IDS = [
  5770038, // Bella Swan
  5780987  // R H A E N Y R A
];

const EXCLUDED_LADY_NAMES = [
  'Bella Swan',
  'R H A E N Y R A'
];

// Pause between two rating requests (milliseconds).
// Keeps us from hammering the server.
const DELAY_BETWEEN_RATINGS_MS = 500;

// Safety check: if ALL of the first N rating requests fail (anything other
// than success), we assume something is wrong (bad token, logged out,
// wrong guild...) and stop without sending the remaining ratings.
const EARLY_ABORT_CHECK_COUNT = 5;

// The game's base address. All internal requests go here.
const BASE_URL = 'https://v3.g.ladypopular.com';


// ================================================================
// 🧰 SMALL HELPERS
// ================================================================

// Makes names comparable: trims, collapses repeated spaces, ignores case.
// So "  Bella   Swan " matches "bella swan".
function normalizeName(name) {
  return String(name).replace(/\s+/g, ' ').trim().toLowerCase();
}

// The rating API needs an "Authorization: Bearer <token>" header.
// I can't see where your game stores that token, so we try, in order:
//   1. the environment variable LP_AUTH_TOKEN (if you set one)
//   2. browser localStorage / sessionStorage / cookies, looking for
//      anything shaped like a JWT (three base64 chunks starting with "eyJ")
// If nothing is found we return null and still try the request,
// because the session cookie alone may be enough.
async function findAuthToken(page) {

  if (process.env.LP_AUTH_TOKEN) {
    return process.env.LP_AUTH_TOKEN;
  }

  return await page.evaluate(() => {
    const jwtPattern = /eyJ[\w-]+\.[\w-]+\.[\w-]+/;

    // Look through localStorage and sessionStorage values.
    for (const store of [window.localStorage, window.sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const value = store.getItem(store.key(i)) || '';
        const match = value.match(jwtPattern);
        if (match) return match[0];
      }
    }

    // Look through cookies.
    const cookieMatch = document.cookie.match(jwtPattern);
    return cookieMatch ? cookieMatch[0] : null;
  });
}


// ================================================================
// 🚀 MAIN FUNCTION (called from mspc.js with the logged-in page)
// ================================================================

module.exports = async function runRate(page) {

  // ==============================================================
  // 🏰 STEP 1: GO TO THE CLUB PAGE (internal request)
  // ==============================================================

  console.log(`🏰 Opening guild page (id=${GUILD_ID})...`);

  // Our internal requests must run from a page on the game's own domain
  // (v3.g.ladypopular.com) so the login cookies are sent along.
  // If we're somewhere else, hop to a normal game page first.
  if (!page.url().startsWith(BASE_URL)) {
    await page.goto(`${BASE_URL}/ladygram.php`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  }

  // Send the same GET request the browser sent: guilds.php?id=1221
  // This runs INSIDE the page, like the game's own JavaScript would.
  const guildHtml = await page.evaluate(async (guildId) => {

    const res = await fetch(`/guilds.php?id=${guildId}`, {
      method: 'GET',
      credentials: 'same-origin'
    });

    // The guild page is HTML (not JSON), so we read it as text.
    return await res.text();

  }, GUILD_ID);

  // The response is huge, but we only need the member list from it.
  if (!guildHtml || !guildHtml.includes('guild-member')) {
    throw new Error(
      `Guild page for id=${GUILD_ID} has no member list (wrong id or not logged in?)`
    );
  }

  console.log(`📄 Guild page received (${guildHtml.length} characters).`);


  // ==============================================================
  // 👥 STEP 2: EXTRACT LADIES + REMOVE THE EXCLUSION SET
  // ==============================================================

  // Each member in the HTML looks like this:
  //   <a href="/ladygram.php?openprofile=true&game_id=int&lady_id=5512863" class="">Anna Bolena<span class="level">76</span></a>
  //
  // This pattern captures:
  //   group 1 = the lady id   (digits after "lady_id=")
  //   group 2 = the lady name (text before <span class="level">)
  const memberRegex =
    /lady_id=(\d+)"[^>]*>([^<]*)<span class="level">/g;

  const allMembers = [];

  for (const match of guildHtml.matchAll(memberRegex)) {
    allMembers.push({
      id: Number(match[1]),
      name: match[2].trim()
    });
  }

  // The number of members found is the total strength of the club
  // (never more than 50).
  const clubStrength = allMembers.length;
  console.log(`👥 Club strength: ${clubStrength} members found.`);

  if (clubStrength === 0) {
    throw new Error('Could not extract any members from the guild page.');
  }

  // Turn the exclusion lists into fast lookup sets.
  const excludedIds = new Set(EXCLUDED_LADY_IDS.map(Number));
  const excludedNames = new Set(EXCLUDED_LADY_NAMES.map(normalizeName));

  // Keep a lady only if NEITHER her id NOR her name is in the exclusion set.
  const ladiesToRate = allMembers.filter(lady =>
    !excludedIds.has(lady.id) &&
    !excludedNames.has(normalizeName(lady.name))
  );

  const removedCount = clubStrength - ladiesToRate.length;
  console.log(
    `🚫 Excluded ${removedCount} lady/ladies. ${ladiesToRate.length} left to rate.`
  );


  // ==============================================================
  // ⭐ STEP 3: SEND A RATING REQUEST FOR EACH REMAINING LADY
  // ==============================================================

  // Find the Authorization token once and reuse it for every lady.
  const authToken = await findAuthToken(page);

  if (!authToken) {
    console.log(
      '⚠️ No auth token found. Trying with cookies only (set LP_AUTH_TOKEN if ratings fail).'
    );
  }

  // The GraphQL mutation, copied from the request you captured.
  // $ladyId and $rating are filled in from "variables" below.
  const query =
    'mutation ProfilePodiumVote($ladyId: Int!, $rating: Int!) {\n' +
    '  profile {\n' +
    '    podiumvote(ladyId: $ladyId, rating: $rating) {\n' +
    '      status\n' +
    '      message\n' +
    '      __typename\n' +
    '    }\n' +
    '    __typename\n' +
    '  }\n' +
    '}';

  let successCount = 0;
  let failCount = 0;

  // We use an index-based loop so we know exactly when the 5th lady is done.
  for (let i = 0; i < ladiesToRate.length; i++) {

    const lady = ladiesToRate[i];

    try {

      // Send the vote from inside the page (so cookies go along).
      const result = await page.evaluate(
        async ({ query, ladyId, rating, token }) => {

          const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/graphql-response+json,application/json;q=0.9'
          };

          // Only add the Authorization header if we have a token.
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }

          const res = await fetch('/api/graphql/index.php', {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({
              operationName: 'ProfilePodiumVote',
              variables: { ladyId, rating },
              query
            })
          });

          return await res.json();
        },
        {
          query,
          ladyId: lady.id,
          rating: RATING,
          token: authToken
        }
      );

      // The reply looks like:
      // { data: { profile: { podiumvote: { status: 1, message: "Thanks for your vote!" } } } }
      const vote = result?.data?.profile?.podiumvote;

      if (vote && vote.status === 1) {
        // ✅ Success
        successCount++;
        console.log(
          `⭐ ${lady.name} (id ${lady.id}) → rated ${RATING} ✅ ${vote.message}`
        );
      } else {
        // ❌ Failure or anything unexpected
        failCount++;
        const reason =
          vote?.message ||
          result?.errors?.[0]?.message ||
          'unknown response';
        console.log(
          `⭐ ${lady.name} (id ${lady.id}) → rated ${RATING} ❌ ${reason}`
        );
      }

    } catch (err) {

      // A network/script error for one lady counts as a failure,
      // but must not crash the whole script.
      failCount++;
      console.log(
        `⭐ ${lady.name} (id ${lady.id}) → rated ${RATING} ❌ request failed: ${err.message}`
      );
    }

    // ============================================================
    // 🛑 EARLY ABORT CHECK
    // ============================================================
    // Once we've tried exactly the first 5 ladies, look at the results.
    // If successCount is still 0, then ALL 5 were failures (or any other
    // non-success response), so we stop here and skip the rest.
    // If at least one succeeded, we carry on normally.
    if (i + 1 === EARLY_ABORT_CHECK_COUNT && successCount === 0) {
      console.log(
        `🛑 First ${EARLY_ABORT_CHECK_COUNT} ratings all failed. Skipping the remaining ${ladiesToRate.length - (i + 1)} ladies and ending.`
      );
      return; // ends rate.js immediately
    }

    // Short pause before the next lady.
    await page.waitForTimeout(DELAY_BETWEEN_RATINGS_MS);
  }


  // ==============================================================
  // 🏁 SUMMARY
  // ==============================================================

  console.log(
    `🏁 Rating finished. Success: ${successCount}, Failed: ${failCount}, Excluded: ${removedCount}.`
  );
};
