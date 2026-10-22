// ================================================================
// 🚀 TELEPORT FLASHBACK EVENT — FULL INTEGRATED SINGLE FLOW
// Activation (or detection) → Zone Detection → Zone Activation → Playing
// ================================================================

module.exports = async function runTeleport(page) {

  // ==============================================================
  // 🔑 AUTH TOKEN HELPER (for GraphQL requests)
  // ==============================================================
  //
  // Your captured GraphQL request included an
  // "authorization: Bearer <token>" header.
  //
  // I don't know for certain where the site stores this token
  // client-side. This helper tries common localStorage key names.
  //
  // If the GraphQL calls below fail (401/403, or an "errors"
  // field in the JSON), open DevTools → Application → Local
  // Storage on the teleport page and tell me the real key name.
  // ==============================================================

  async function getAuthToken() {
    return await page.evaluate(() => {
      const candidateKeys = [
        'token',
        'authToken',
        'auth_token',
        'jwt',
        'access_token',
        'accessToken'
      ];

      for (const key of candidateKeys) {
        const val = localStorage.getItem(key);
        if (val && val.length > 10) {
          return val;
        }
      }

      return null;
    });
  }


  // ==============================================================
  // 🧬 GENERIC GRAPHQL REQUEST HELPER
  // ==============================================================

  async function runGraphQL({ operationName, query, variables }) {

    const token = await getAuthToken();

    return await page.evaluate(
      async ({ operationName, query, variables, token }) => {

        const headers = {
          'Content-Type': 'application/json',
        };

        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
        }

        const res = await fetch(
          'https://v3.g.ladypopular.com/api/graphql/index.php',
          {
            method: 'POST',
            headers,
            credentials: 'same-origin',
            body: JSON.stringify({
              operationName,
              query,
              variables,
              extensions: {
                clientLibrary: {
                  name: '@apollo/client',
                  version: '4.0.5'
                }
              }
            })
          }
        );

        return await res.json();

      },
      { operationName, query, variables, token }
    );
  }


  // ==============================================================
  // 📜 GRAPHQL QUERY / MUTATION STRINGS (copied from your capture)
  // ==============================================================

  const TELEPORT_EVENT_INFO_QUERY = `query Teleport($eventId: Int!) {
  teleport {
    EventInfo(eventId: $eventId) {
      id
      title
      icon
      type
      total_rewards_count {
        ...EventsTotalRewardsCount
        __typename
      }
      timeleft
      next_free_game_time
      is_event_completed
      active_zone_id
      final_rewards {
        event_final {
          ...EventsRewards
          __typename
        }
        __typename
      }
      zone_info {
        id
        name
        map {
          flag
          pending
          is_opened
          __typename
        }
        unlock_after_completed_zones_count
        zone_active_until_time
        zone_active_time_cooldown
        open_square_info {
          emerald_tries_amount
          max_emerald_tries_amount
          timeleft_until_next_try
          open_square_price_emeralds
          open_square_price_credits
          __typename
        }
        background_id
        __typename
      }
      zones_info {
        id
        name
        is_boyfriend_zone
        is_locked
        is_completed
        is_active
        unlock_after_completed_zones_count
        rewards {
          final {
            ...EventsRewards
            __typename
          }
          regular {
            ...EventsRewards
            __typename
          }
          event_final {
            ...EventsRewards
            __typename
          }
          __typename
        }
        total_rewards_count {
          ...EventsTotalRewardsCount
          __typename
        }
        background_id
        __typename
      }
      price_enter_zone {
        emeralds
        credits
        dollars
        __typename
      }
      is_tutorial_flashback
      is_flashback
      is_favourite
      can_be_deactivated
      can_be_activated
      can_be_played
      activation_duration
      activation_price {
        credits
        emeralds
        dollars
        __typename
      }
      __typename
    }
    __typename
  }
}

fragment EventsRewards on EventRewards {
  color
  colors
  default_color
  fashion_points
  html_image
  html_indexes
  num
  modelref
  remove_body_parts_flag
  flags
  id
  name
  amount
  item_type
  owned_amount
  thumb
  tooltip
  energy_type
  type
  price
  currency
  status
  total_amount
  zone_id
  reward_type
  type_name
  item_pack_reward_type
  __typename
}

fragment EventsTotalRewardsCount on EventRewardsTotalCount {
  id
  total
  owned
  __typename
}`;


  const ENTER_ZONE_MUTATION = `mutation EventTeleportEnterZone($eventId: Int, $zoneId: Int) {
  teleport {
    EnterZoneMutation(eventId: $eventId, zoneId: $zoneId) {
      status
      message
      show_credits
      next_free_game_time
      lady_stats {
        emeralds
        credits
        dollars
        fashion_points
        __typename
      }
      zone_info {
        id
        name
        map {
          flag
          pending
          is_opened
          __typename
        }
        unlock_after_completed_zones_count
        zone_active_until_time
        zone_active_time_cooldown
        open_square_info {
          emerald_tries_amount
          max_emerald_tries_amount
          timeleft_until_next_try
          open_square_price_emeralds
          open_square_price_credits
          __typename
        }
        background_id
        __typename
      }
      notifications {
        vip_gift_to_claim
        __typename
      }
      __typename
    }
    __typename
  }
}`;


  // ==============================================================
  // 🎮 STEP 5 PLAY LOGIC (your tele.js click engine, verbatim)
  // ==============================================================
  //
  // Kept as a small internal helper purely because it's a big
  // block of grid-solving logic — it is only ever called ONCE,
  // at the very end of this file's single linear flow.
  // ==============================================================

  async function playTeleportGame(teleportUrl) {

    console.log("🌐 Navigating to teleport event page...");
    await page.goto(teleportUrl, { waitUntil: 'domcontentloaded' });

    console.log('🔄 Refresh & wait...');
    await page.reload();
    await page.waitForTimeout(30000);

    const emeraldText = await page.textContent('#player-emeralds');
    const emeralds = parseInt(emeraldText.replace(/\D/g, ''), 10);
    console.log('💎 Emeralds:', emeralds);
    if (emeralds < 3) {
      console.log('➡️ Not enough emeralds. Exiting teleport script.');
      return;
    }

    let tries = await page.$$eval('div.currency-tries > span.currency-circle-full', els => els.length);
    console.log('🎲 Initial tries:', tries);
    if (tries === 0) {
      console.log('➡️ No tries available. Exiting teleport script.');
      return;
    }

    const getIndex = (r, c) => (r - 1) * 10 + c;
    const getCoords = idx => [Math.floor((idx - 1) / 10) + 1, ((idx - 1) % 10) + 1];
    const getNeighbors = (r, c) => {
      const n = [];
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 1 && rr <= 10 && cc >= 1 && cc <= 10) n.push([rr, cc]);
        }
      }
      return n;
    };
    const key = ([r, c]) => `${r},${c}`;
    const randomPick = arr => arr[Math.floor(Math.random() * arr.length)];

    while (tries > 0) {
      const grid = await page.$$eval('div.zone-grid > div > span', spans =>
        spans.map((sp, i) => {
          const cls = sp.className;
          let t = 'untouched';
          if (cls.includes('opened miss')) t = 'block';
          else if (cls.includes('opened reward')) t = 'reward';
          else if (cls.includes('opened empty')) t = 'empty';
          else if (cls.includes('pending hint')) t = 'hint';
          return { idx: i + 1, type: t };
        })
      );

      const sets = { block: [], reward: [], empty: [], hint: [], untouched: [] };
      grid.forEach(c => {
        const [r, c0] = getCoords(c.idx);
        sets[c.type].push([r, c0]);
      });

      const toMap = arr => new Set(arr.map(key));
      const blockSet = toMap(sets.block);
      const rewardSet = toMap(sets.reward);
      const emptySet = toMap(sets.empty);
      const hintSet = toMap(sets.hint);
      const untouchedSet = toMap(sets.untouched);

      const bigBlock = new Set();
      blockSet.forEach(k => {
        const [r, c0] = k.split(',').map(Number);
        getNeighbors(r, c0).forEach(nn => bigBlock.add(key(nn)));
      });
      blockSet.forEach(b => bigBlock.add(b));
      rewardSet.forEach(r0 => bigBlock.delete(r0));
      emptySet.forEach(e0 => bigBlock.delete(e0));

      const sacrificialHint = new Set([...hintSet].filter(h => bigBlock.has(h)));
      const laggingHint = new Set([...hintSet].filter(h => !bigBlock.has(h)));
      const qualifiedUntouch = new Set([...untouchedSet].filter(u => !bigBlock.has(u)));
      const highProb = new Set([...laggingHint, ...qualifiedUntouch]);

      const totalCheck = bigBlock.size + rewardSet.size + emptySet.size + laggingHint.size + qualifiedUntouch.size;
      const altCheck = bigBlock.size + rewardSet.size + emptySet.size + highProb.size;
      console.log('🧪 Grid validation:', totalCheck === 100, altCheck === 100);

      let clicked = false;

      // Phase I: Hint-driven click
      const hintArr = [...hintSet];
      if (hintArr.length > 0) {
        let minMark = Infinity, hingeList = [];
        hintArr.forEach(hk => {
          const [hr, hc] = hk.split(',').map(Number);
          const marks = getNeighbors(hr, hc).filter(nk => highProb.has(key(nk))).length;
          if (marks <= minMark) {
            if (marks < minMark) hingeList = [];
            minMark = marks;
            hingeList.push({ cell: hk, marks });
          }
        });

        if (minMark <= 3 && hingeList.length) {
          const sac = hingeList.filter(h => sacrificialHint.has(h.cell));
          const chosenH = randomPick(sac.length ? sac : hingeList);
          const [hr, hc] = chosenH.cell.split(',').map(Number);
          const targetNeighbors = getNeighbors(hr, hc).filter(nk => highProb.has(key(nk)));

          if (targetNeighbors.length) {
            let clickTarget;
            if (targetNeighbors.length === 1) {
              clickTarget = targetNeighbors[0];
            } else {
              if (!sacrificialHint.has(chosenH.cell)) {
                const others = targetNeighbors.filter(t => key(t) !== chosenH.cell);
                clickTarget = others.length ? randomPick(others) : randomPick(targetNeighbors);
              } else {
                clickTarget = randomPick(targetNeighbors);
              }
            }

            console.log('🎯 Phase I click:', clickTarget);
            const idx = getIndex(...clickTarget);
            await page.click(`.zone-grid > div > span:nth-child(${idx})`);
            tries--;
            await page.waitForTimeout(20000);
            clicked = true;
          }
        }
      }

      // Phase II: Strategy fallbacks
      if (!clicked && tries > 0) {
        const progress = await page.textContent('.all-rewards-button-label');
        const collected = parseInt(progress.split('/')[0].trim());
        const priority = collected < 12
          ? [[2, 2], [2, 9], [9, 2], [9, 9]]
          : [[2, 2], [2, 9], [9, 2], [9, 9]];
        const candidates = priority.filter(p => highProb.has(key(p)));
        if (candidates.length >= 2) {
          const tk = randomPick(candidates);
          console.log('🎯 Priority click:', tk);
          const idx = getIndex(...tk);
          await page.click(`.zone-grid > div > span:nth-child(${idx})`);
          tries--;
          await page.waitForTimeout(20000);
          clicked = true;
        }
      }

      if (!clicked && tries > 0) {
        const candidateHP = [...highProb];
        let best = [], bestCount = -1;
        candidateHP.forEach(hk => {
          const [hr, hc] = hk.split(',').map(Number);
          const overlap = getNeighbors(hr, hc).filter(nk => bigBlock.has(key(nk))).length;
          if (overlap > bestCount) { bestCount = overlap; best = [hk]; }
          else if (overlap === bestCount) best.push(hk);
        });
        if (bestCount > 0) {
          const tk = randomPick(best).split(',').map(Number);
          console.log('🎯 Overlap-bigblock click:', tk);
          const idx = getIndex(...tk);
          await page.click(`.zone-grid > div > span:nth-child(${idx})`);
          tries--;
          await page.waitForTimeout(20000);
          clicked = true;
        }
      }

      if (!clicked && tries > 0) {
        const candidateHP = [...highProb];
        let best = [], bestCount = -1;
        candidateHP.forEach(hk => {
          const [hr, hc] = hk.split(',').map(Number);
          const overlap = getNeighbors(hr, hc).filter(nk => laggingHint.has(key(nk))).length;
          if (overlap > bestCount) { bestCount = overlap; best = [hk]; }
          else if (overlap === bestCount) best.push(hk);
        });
        if (bestCount > 0) {
          const tk = randomPick(best).split(',').map(Number);
          console.log('🎯 Overlap-lagging click:', tk);
          const idx = getIndex(...tk);
          await page.click(`.zone-grid > div > span:nth-child(${idx})`);
          tries--;
          await page.waitForTimeout(20000);
          clicked = true;
        }
      }

      if (!clicked && tries > 0) {
        const candidates = [...highProb];
        const tk = randomPick(candidates).split(',').map(Number);
        console.log('🎯 Fallback click:', tk);
        const idx = getIndex(...tk);
        await page.click(`.zone-grid > div > span:nth-child(${idx})`);
        tries--;
        await page.waitForTimeout(20000);
      }

      console.log('➡️ Remaining tries:', tries);
    }

    console.log('🎉 All done — no tries left.');
  }


  // ==============================================================
  // OPEN GUILD PAGE
  // CHECK WHETHER A FLASHBACK EVENT IS ALREADY ACTIVE
  // ==============================================================

  try {

    await page.goto(
      'https://v3.g.ladypopular.com/guild.php',
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    );

  } catch (error) {

    console.log(`❌ Guild page failed to load: ${error.message}`);

    throw error;

  }


  // ==============================================================
  // DETECT CURRENTLY ACTIVE FLASHBACK EVENT
  // ==============================================================

  const activeFlashbackElement = page.locator(
    '#header-events-container .header-event-banner[data-is_flashback="1"]'
  ).first();


  const activeFlashbackEvents = await activeFlashbackElement.count();


  // --------------------------------------------------------------
  // 🔴 THIS IS THE SHARED VARIABLE.
  //
  // Whichever branch runs below (CASE 1 or CASE 2), it will
  // populate this single variable with the event id. Steps 1–5
  // further down use THIS variable — there is only one copy of
  // Steps 1–5 in the whole file, executed once, linearly.
  // --------------------------------------------------------------

  let eventId;


  // --------------------------------------------------------------
  // CASE 1
  // A flashback event is already active.
  // --------------------------------------------------------------

  if (activeFlashbackEvents > 0) {

    const activeFlashbackId = await activeFlashbackElement.getAttribute(
      'data-id'
    );

    const activeFlashbackTitle = await activeFlashbackElement.locator(
      '.item-title'
    ).innerText();


    // Store the currently active flashback event.
    const activeFlashbackEvent = {
      id: activeFlashbackId,
      title: activeFlashbackTitle.trim()
    };


    console.log('🚀 Flashback event already active.');

    console.log(
      `📌 Active flashback: ${activeFlashbackEvent.title} (ID ${activeFlashbackEvent.id})`
    );

    console.log('🚀 Skipping Teleport activation. Feeding event ID into Steps 1–5.');

    eventId = Number(activeFlashbackEvent.id);

  } else {


    // --------------------------------------------------------------
    // CASE 2
    // No flashback event is active.
    // Continue to Teleport event request.
    // --------------------------------------------------------------


    // ==============================================================
    // GET TELEPORT FLASHBACK EVENTS
    // ==============================================================

    let eventsResponse;


    try {

      eventsResponse = await page.evaluate(async () => {

        const response = await fetch(
          'https://v3.g.ladypopular.com/ajax/events.php',
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },

            body: new URLSearchParams({
              'event_types[]': 'teleport',
              'ignore_won_rewards': 'false',
              type: 'loadMoreEvents',
              offset: '0',
              name: ''
            }),

            credentials: 'same-origin'
          }
        );

        return await response.json();

      });


      console.log(
        `🚀 Teleport events loaded. Server status=${eventsResponse?.status}`
      );


    } catch (error) {

      console.log(`❌ Teleport events request failed: ${error.message}`);

      throw error;

    }


    // --------------------------------------------------------------
    // Make sure the response has the structure we expect.
    // --------------------------------------------------------------

    if (!eventsResponse) {

      console.log('❌ Teleport events response was empty.');

      throw new Error(
        'Empty response received from events.php.'
      );

    }


    if (eventsResponse.status !== 1) {

      console.log(
        `❌ Teleport events request returned status=${eventsResponse.status}`
      );

      throw new Error(
        `Teleport flashback event request failed with status ${eventsResponse.status}.`
      );

    }


    // --------------------------------------------------------------
    // Get event list.
    // --------------------------------------------------------------

    const events = eventsResponse.search_events?.list;


    if (!Array.isArray(events)) {

      console.log('❌ Teleport event list missing or invalid.');

      throw new Error(
        'Unexpected events response structure: search_events.list is missing.'
      );

    }


    // ==============================================================
    // FILTER TELEPORT FLASHBACK EVENTS
    // ==============================================================

    const unlockedEvents = [];
    const lockedEvents = [];


    for (const event of events) {

      if (event.is_flashback !== true) {

        continue;

      }


      if (event.can_be_activated === true) {

        unlockedEvents.push({
          id: event.id,
          title: event.title
        });

      } else {

        lockedEvents.push({
          id: event.id,
          title: event.title,
          lockReason: event.lock_type_info
        });

      }

    }


    console.log(
      `🚀 Teleport flashbacks found: ${events.length} total | ${unlockedEvents.length} unlocked`
    );


    // --------------------------------------------------------------
    // If there are no unlocked events, we cannot activate anything.
    // --------------------------------------------------------------

    if (unlockedEvents.length === 0) {

      console.log('🚀 No unlocked Teleport flashback events. Skipping.');

      return;

    }


    // ==============================================================
    // RANDOMLY CHOOSE ONE UNLOCKED EVENT
    // ==============================================================

    const randomIndex = Math.floor(
      Math.random() * unlockedEvents.length
    );


    const selectedEvent = unlockedEvents[randomIndex];


    console.log(
      `🎯 Activating Teleport event: ${selectedEvent.title} (ID ${selectedEvent.id})`
    );


    // ==============================================================
    // ACTIVATE EVENT
    // ==============================================================

    let activationResponse;


    try {

      activationResponse = await page.evaluate(async (id) => {

        const response = await fetch(
          'https://v3.g.ladypopular.com/ajax/events.php',
          {
            method: 'POST',

            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'X-Requested-With': 'XMLHttpRequest'
            },

            body: new URLSearchParams({
              type: 'activateEvent',
              event_id: String(id)
            }),

            credentials: 'same-origin'
          }
        );

        return await response.json();

      }, selectedEvent.id);


    } catch (error) {

      console.log(`❌ Teleport event activation request failed: ${error.message}`);

      throw error;

    }


    if (activationResponse?.status === 1) {

      console.log(
        `✅ Teleport flashback activated: ${selectedEvent.title}`
      );

    } else {

      console.log(
        `❌ Teleport event activation failed. Status=${activationResponse?.status}`
      );

      throw new Error(
        `Failed to activate Teleport event "${selectedEvent.title}" (ID ${selectedEvent.id}). Server status: ${activationResponse?.status}`
      );

    }


    // Feed the newly activated event's ID into the shared variable.
    eventId = Number(selectedEvent.id);

  }


  // ================================================================
  // 🔁 STEPS 1–5 — SINGLE, SHARED, RUNS EXACTLY ONCE
  // ================================================================
  //
  // At this point, `eventId` has been populated by whichever
  // branch ran above (CASE 1 or CASE 2). Everything from here
  // down is ONE linear continuation of the same function —
  // not a separate callable block, not invoked twice.
  // ================================================================


  // ----------------------------------------------------------------
  // STEP 1 — Go to event URL
  // ----------------------------------------------------------------

  const teleportUrl = `https://v3.g.ladypopular.com/events/teleport.php?event_id=${eventId}`;

  console.log(`🌐 [Step 1] Navigating to event URL: ${teleportUrl}`);

  await page.goto(teleportUrl, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  });


  // ----------------------------------------------------------------
  // STEP 2 — Get zone list data via GraphQL
  // ----------------------------------------------------------------

  console.log('📡 [Step 2] Requesting Teleport EventInfo via GraphQL...');

  let infoResponse;

  try {

    infoResponse = await runGraphQL({
      operationName: 'Teleport',
      query: TELEPORT_EVENT_INFO_QUERY,
      variables: { eventId }
    });

  } catch (error) {

    console.log(`❌ [Step 2] GraphQL request failed: ${error.message}`);
    throw error;

  }


  if (infoResponse?.errors) {

    console.log(
      `❌ [Step 2] GraphQL returned errors: ${JSON.stringify(infoResponse.errors)}`
    );

    throw new Error('GraphQL EventInfo request returned errors.');

  }


  const eventInfo = infoResponse?.data?.teleport?.EventInfo;

  if (!eventInfo) {

    console.log('❌ [Step 2] EventInfo missing from GraphQL response.');
    throw new Error('EventInfo missing from GraphQL response.');

  }


  // ----------------------------------------------------------------
  // STEP 3 — Activity determination
  // ----------------------------------------------------------------

  // ---------- CASE 1 of Step 3: a zone is already active ----------

  if (eventInfo.active_zone_id !== null && eventInfo.active_zone_id !== undefined) {

    console.log(
      `✅ [Step 3] Zone already active (ID ${eventInfo.active_zone_id}). Skipping ahead to Step 5.`
    );

    await playTeleportGame(teleportUrl);

    console.log('🏁 Teleport flow finished.');

    return;

  }


  console.log('🔎 [Step 3] No zone currently active. Checking activation type...');


  // ---------- Subcase 2.1 of Step 3: paid activation ----------

  if (eventInfo.next_free_game_time && eventInfo.next_free_game_time !== 0) {

    console.log(
      `💰 [Step 3.1] Zone activation is currently PAID (next free at ${eventInfo.next_free_game_time}). Stopping here.`
    );

    return;

  }


  // ---------- Subcase 2.2 of Step 3: free activation ----------

  console.log('🆓 [Step 3.2] Zone activation is FREE. Gathering uncompleted zones...');

  const zonesInfo = eventInfo.zones_info;

  if (!Array.isArray(zonesInfo)) {

    console.log('❌ [Step 3.2] zones_info missing or invalid.');
    throw new Error('zones_info missing or invalid in EventInfo response.');

  }

  const uncompletedZones = zonesInfo
    .filter(z => z.is_completed === false)
    .map(z => ({ id: z.id, name: z.name }));

  console.log(
    `🗺️ [Step 3.2] Found ${uncompletedZones.length} uncompleted zone(s): ` +
    uncompletedZones.map(z => `${z.name} (${z.id})`).join(', ')
  );

  if (uncompletedZones.length === 0) {

    console.log('✅ [Step 3.2] No uncompleted zones left. Nothing to activate.');
    return;

  }


  // ----------------------------------------------------------------
  // STEP 4 — Activate a random uncompleted zone
  // ----------------------------------------------------------------

  const zoneRandomIndex = Math.floor(Math.random() * uncompletedZones.length);
  const chosenZone = uncompletedZones[zoneRandomIndex];

  console.log(
    `🎯 [Step 4] Activating zone: ${chosenZone.name} (ID ${chosenZone.id})`
  );

  let enterResponse;

  try {

    enterResponse = await runGraphQL({
      operationName: 'EventTeleportEnterZone',
      query: ENTER_ZONE_MUTATION,
      variables: { eventId, zoneId: chosenZone.id }
    });

  } catch (error) {

    console.log(`❌ [Step 4] Zone activation request failed: ${error.message}`);
    throw error;

  }


  if (enterResponse?.errors) {

    console.log(
      `❌ [Step 4] GraphQL returned errors: ${JSON.stringify(enterResponse.errors)}`
    );

    throw new Error('GraphQL EnterZoneMutation returned errors.');

  }


  const enterStatus = enterResponse?.data?.teleport?.EnterZoneMutation?.status;

  if (enterStatus !== 1) {

    console.log(
      `❌ [Step 4] Zone activation failed. Status=${enterStatus}, message=${enterResponse?.data?.teleport?.EnterZoneMutation?.message}`
    );

    throw new Error(
      `Failed to enter zone "${chosenZone.name}" (ID ${chosenZone.id}). Status: ${enterStatus}`
    );

  }

  console.log(`✅ [Step 4] Zone "${chosenZone.name}" activated successfully.`);


  // ----------------------------------------------------------------
  // STEP 5 — Play the game
  // ----------------------------------------------------------------

  await playTeleportGame(teleportUrl);

  console.log('🏁 Teleport flow finished.');

};
