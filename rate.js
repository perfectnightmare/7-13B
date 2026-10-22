// rate.js
// ================================================================
// ⭐ RATE GUILD MEMBERS (Podium votes)
// ================================================================
// What this script does:
//   Step 1: Open the guild page with an internal request and grab the HTML.
//   Step 2: Pull every member's name + lady id out of that HTML,
//           then remove the ladies in the exclusion set,
//           then add the ladies from the inclusion list.
//   Step 3: Send rating requests for each lady (try 5 first, then 3).
//           Safety check: if the first 5 ladies ALL fail, stop.
// ================================================================


// ================================================================
// ⚙️ SETTINGS: change these whenever you want
// ================================================================

// The guild (club) we want to go to. Change this number to rate another guild.
const GUILD_ID = 1221;

// ----- CHANGE 1 (replaces the old "const RATING = 3;" line) -----
// The ratings we try for each lady, in order.
// We try 5 first (works only for ladies with a booster).
// If that is not a success, we try 3.
const RATINGS_TO_TRY = [5, 3];
// ----------------------------------------------------------------

// Exclusion set: ladies who must NOT be rated.
// A lady is removed if EITHER her id OR her name matches anything below.
const EXCLUDED_LADY_IDS = [
  5770038, // Bella Swan
  5780987  // R H A E N Y R A
];

const EXCLUDED_LADY_NAMES = [
  'Bella Swan',
  'R H A E N Y R A',
  'хілларі',
  'Alex',
  'Katherine Auguste',
  'Liv Moore',
  'NirvanaOcean',
  'mimi',
  'Lamia',
  'alex-Rebecca',
  'Ellione',
  'Ismben',
  'Gypsii',
  'Ghilaine',
  'Албена К.',
  'Jane',
  'Anea',
  'Axel',
  'SissyL',
  'Simk',
  'Anna Bolena',
  'Indra',
  'Gabriela Nieves',
  'Alexandra_Sunshine',
  'Edu',
  'Noran',
  'Gloria',
  'Pamuk',
  'TigerLily',
  'MILANA20',
  'Hellga',
  'LadyDeeDee',
  'Rucsandra',
  'Kim Miu',
  'asli',
  'Metal Princess',
  'Yelyah',
  'xox19mama91xox',
  'Jurria',
  'Lina lyn',
  'Didiqn',
  '𝓐𝓷𝓷𝓪',
  'Lana turner'
];

// ----- CHANGE 2 (new list) -----
// Inclusion list: extra ladies who are NOT in the guild but should also be rated.
// Just type their lady ids here, separated by commas. Example:
//   const INCLUDED_LADY_IDS = [
//     1234567,
//     7654321
//   ];
const INCLUDED_LADY_IDS = [
  1905079, //rosa
  8242717, //vivienne
  7115204 //sherry
  
];
// -------------------------------

// Pause between two rating requests (milliseconds).
// Keeps us from hammering the server.
const DELAY_BETWEEN_RATINGS_MS = 500;

// Safety check: if ALL of the first N ladies fail (both rating 5 and
// rating 3 failed for each of them), we assume something is wrong
// (bad token, logged out, wrong guild...) and stop without sending
// the remaining ratings.
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

  // ----- CHANGE 2 (new block): add the ladies from the inclusion list -----
  // These ladies are outside the club, so we only know their ids.
  // If an id is already in the list (e.g. she is also in the club),
  // we skip it so she doesn't get rated twice.
  const alreadyInList = new Set(ladiesToRate.map(lady => lady.id));
  let addedCount = 0;

  for (const id of INCLUDED_LADY_IDS.map(Number)) {
    if (!alreadyInList.has(id)) {
      ladiesToRate.push({ id: id, name: `Outside lady ${id}` });
      alreadyInList.add(id);
      addedCount++;
    }
  }

  console.log(
    `➕ Added ${addedCount} lady/ladies from the inclusion list. ${ladiesToRate.length} total to rate.`
  );
  // -------------------------------------------------------------------------


  // ==============================================================
  // ⭐ STEP 3: SEND RATING REQUESTS FOR EACH REMAINING LADY
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

  // ----- CHANGE 1 (new helper): sends ONE vote request -----
  // This is your old fetch code, moved into a function so we can call it
  // twice (once for rating 5, once for rating 3).
  // It returns { success: true/false, message: '...' } and never crashes.
  async function sendVote(ladyId, rating) {
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
          ladyId: ladyId,
          rating: rating,
          token: authToken
        }
      );

      // The reply looks like:
      // { data: { profile: { podiumvote: { status: 1, message: "Thanks for your vote!" } } } }
      const vote = result?.data?.profile?.podiumvote;

      if (vote && vote.status === 1) {
        // ✅ Success
        return { success: true, message: vote.message };
      }

      // ❌ Failure or anything unexpected
      return {
        success: false,
        message:
          vote?.message ||
          result?.errors?.[0]?.message ||
          'unknown response'
      };

    } catch (err) {

      // A network/script error counts as a failure,
      // but must not crash the whole script.
      return { success: false, message: `request failed: ${err.message}` };
    }
  }
  // ---------------------------------------------------------

  // We use an index-based loop so we know exactly when the 5th lady is done.
  for (let i = 0; i < ladiesToRate.length; i++) {

    const lady = ladiesToRate[i];

    // ----- CHANGE 1 (replaces the old try/catch block) -----
    // Try each rating in order (5 first, then 3).
    // As soon as one succeeds, this lady is done and we stop trying.
    let rated = false;

    for (let r = 0; r < RATINGS_TO_TRY.length; r++) {

      const rating = RATINGS_TO_TRY[r];
      const isLastTry = r === RATINGS_TO_TRY.length - 1;

      const outcome = await sendVote(lady.id, rating);

      if (outcome.success) {
        // ✅ Success: lady is rated, no need to try the other rating
        rated = true;
        console.log(
          `⭐ ${lady.name} (id ${lady.id}) → rated ${rating} ✅ ${outcome.message}`
        );
        break;
      }

      // ❌ This rating did not work
      console.log(
        `⭐ ${lady.name} (id ${lady.id}) → rating ${rating} ❌ ${outcome.message}` +
        (isLastTry ? '' : ' (trying next rating...)')
      );

      // Short pause before trying the next rating
      if (!isLastTry) {
        await page.waitForTimeout(DELAY_BETWEEN_RATINGS_MS);
      }
    }

    if (rated) {
      successCount++;
    } else {
      // Both rating 5 and rating 3 failed = this lady counts as a failure
      failCount++;
    }
    // --------------------------------------------------------

    // ============================================================
    // 🛑 EARLY ABORT CHECK
    // ============================================================
    // Once we've tried exactly the first 5 ladies, look at the results.
    // If successCount is still 0, then ALL 5 ladies failed (both rating 5
    // and rating 3), so we stop here and skip the rest.
    // If at least one succeeded, we carry on normally.
    if (i + 1 === EARLY_ABORT_CHECK_COUNT && successCount === 0) {
      console.log(
        `🛑 First ${EARLY_ABORT_CHECK_COUNT} ladies all failed. Skipping the remaining ${ladiesToRate.length - (i + 1)} ladies and ending.`
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
