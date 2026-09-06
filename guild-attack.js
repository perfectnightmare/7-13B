// ====================================================================
// 🏰 GUILD ATTACK SCRIPT
// ====================================================================
//
// This script checks the Guild page for an active "attack" (a duel
// between two clubs) and joins it automatically if we haven't
// already joined.
//
// There are exactly 3 possible situations ("cases") we can be in:
//
//   CASE A -> No attack is currently happening at all.
//             Nothing to do. We stop here.
//
//   CASE B -> An attack IS happening, but we have ALREADY joined it.
//             Nothing to do. We stop here.
//
//   CASE C -> An attack IS happening, and we have NOT joined yet.
//             We need to join it by sending an internal request
//             to the game's own AJAX endpoint (faster than clicking).
//
// How do we tell these apart? By inspecting specific elements in the
// page's HTML:
//
//   - #guildsAttack           -> only exists if an attack is active
//   - #duelAcceptAttackButton -> the "Participate in attack" button
//                                 -> if it HAS the class "display-none",
//                                    it means it's hidden, which means
//                                    we already joined (CASE B)
//                                 -> if it does NOT have "display-none",
//                                    it's visible, meaning we have not
//                                    joined yet (CASE C)
//
// ====================================================================

module.exports = async function runGuildAttack(page) {

  console.log("🏰 Checking for active guild attack...");

  try {

    // ------------------------------------------------------------
    // STEP 1: Go to the guild page and wait for it to load.
    // ------------------------------------------------------------

    await page.goto(
      'https://v3.g.ladypopular.com/guild.php',
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    );

    // Give the page a moment to finish any JS-driven rendering
    // (timers, dynamic classes, etc.) before we inspect it.
    await page.waitForTimeout(3000);


    // ------------------------------------------------------------
    // STEP 2: Inspect the page and figure out which CASE we're in.
    // ------------------------------------------------------------
    //
    // We do this INSIDE page.evaluate() because we need to read
    // the actual rendered DOM (document.querySelector), not the
    // raw HTML text.
    //
    // This block returns a small object describing what it found,
    // which we then use outside of page.evaluate() to decide what
    // to do next.
    // ------------------------------------------------------------

    const attackInfo = await page.evaluate(() => {

      // Try to find the "attack" block on the page.
      // If it doesn't exist at all -> there's no active attack.
      const attackDiv = document.querySelector('#guildsAttack');

      if (!attackDiv) {
        // ---------------------------------------------------
        // CASE A: No attack block found at all.
        // ---------------------------------------------------
        return { case: 'A' };
      }

      // The attack block exists, so an attack IS happening.
      // Now we need to check whether we've already joined it.

      const acceptBtn = attackDiv.querySelector('#duelAcceptAttackButton');
      const guildNameEl = attackDiv.querySelector('#guild-name');

      // Grab the target guild's name (just the visible text).
      const guildName = guildNameEl
        ? guildNameEl.textContent.trim()
        : 'Unknown Guild';

      // If, for some strange reason, the accept button itself is
      // missing, we can't tell anything more — treat as "no attack"
      // to be safe (this should not normally happen).
      if (!acceptBtn) {
        return { case: 'A' };
      }

      // Check if the "Participate in attack" button is hidden
      // (i.e. has the "display-none" class).
      const alreadyJoined = acceptBtn.classList.contains('display-none');

      if (alreadyJoined) {
        // ---------------------------------------------------
        // CASE B: Attack active, but we already joined.
        // ---------------------------------------------------
        return {
          case: 'B',
          guildName
        };
      }

      // ---------------------------------------------------
      // CASE C: Attack active, and we have NOT joined yet.
      // ---------------------------------------------------
      //
      // We need the duel ID to join. It's embedded inside the
      // button's onclick attribute, like this:
      //
      //     onclick="guildJoinDuel(205159)"
      //
      // So we use a small regex to pull the number out.
      // ---------------------------------------------------

      const onclickAttr = acceptBtn.getAttribute('onclick') || '';
      const duelMatch = onclickAttr.match(/guildJoinDuel\((\d+)\)/);
      const duelId = duelMatch ? duelMatch[1] : null;

      return {
        case: 'C',
        guildName,
        duelId
      };
    });


    // ------------------------------------------------------------
    // STEP 3: Act based on which case we detected.
    // ------------------------------------------------------------

    // ---------------- CASE A: nothing to do ----------------
    if (attackInfo.case === 'A') {
      console.log("Case A - No active attack.");
      return;
    }

    // ---------------- CASE B: nothing to do -----------------
    if (attackInfo.case === 'B') {
      console.log(`Case B - Already joined. Club: ${attackInfo.guildName}`);
      return;
    }

    // ---------------- CASE C: need to join ------------------
    if (attackInfo.case === 'C') {

      // Safety check: if we couldn't extract a duel ID for some
      // reason, we can't join. Log it and stop.
      if (!attackInfo.duelId) {
        console.log(
          `Case C - Club: ${attackInfo.guildName} | ⚠️ Could not extract duel ID, aborting join.`
        );
        return;
      }

      // --------------------------------------------------------
      // STEP 4: Send the internal "joinDuel" request directly,
      // instead of clicking the button. This is the same request
      // the game's own JS sends when you click "Participate in
      // attack" manually.
      //
      // Endpoint:   POST /ajax/guilds.php
      // Payload:    type=joinDuel & duel=<duelId>
      // Success:    response.status === 1
      // --------------------------------------------------------

      const response = await page.evaluate(async (duelId) => {

        const res = await fetch('/ajax/guilds.php', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest'
          },
          credentials: 'same-origin',
          body: new URLSearchParams({
            type: 'joinDuel',
            duel: duelId
          })
        });

        return await res.json();

      }, attackInfo.duelId);

      // response looks like: { status: 1 }  on success
      const success = !!(response && response.status === 1);

      console.log(
        `Case C - Club: ${attackInfo.guildName} | Success: ${success}`
      );
    }

  } catch (err) {

    // If anything unexpected goes wrong (page didn't load, selectors
    // changed, network hiccup, etc.), we log it but don't crash the
    // whole automation — mspc.js will just move on to the next script.
    console.log(`⚠️ Guild Attack script failed: ${err.message}`);

  }
};
