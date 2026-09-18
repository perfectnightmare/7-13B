module.exports = async function runBurnEnergy(page) {
// ==============================================================
// 🎟️ TICKET SPENDING
// ==============================================================
//
// This function checks how many Beauty Pageant tickets we have.
//
// The script wants to KEEP 10 tickets in storage.
//
// Anything ABOVE 10 is spent by sending the game's own
// "competeInDuel" internal request.
//
// IMPORTANT:
// This entire function is kept unchanged from your original code.
// ==============================================================

async function spendExcessTickets() {
  try {

    console.log("🎟️ Checking ticket count...");

    // Ticket count is read from the Beauty Pageant page.
    await page.goto(
      'https://v3.g.ladypopular.com/beauty_pageant.php',
      {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      }
    );

    // ----------------------------------------------------------
    // Read the current number of tickets.
    // ----------------------------------------------------------

    const getTicketCount = async () => {
      const ticketText = await page.innerText('.bp-pass-amount');
      return parseInt(ticketText.trim());
    };

    const tickets = await getTicketCount();

    console.log(`🎟️ You have ${tickets} tickets.`);

    // ----------------------------------------------------------
    // Read the ticket reserve from the environment.
    // Normal workflow will provide 90.
    // Special 2–3 AM workflow will provide 0.
    // If nothing is provided, safely default to 90.
    // ----------------------------------------------------------

    const ticketReserve =
      Number(process.env.TICKET_RESERVE ?? 90);

    const ticketsToUse =
      tickets - ticketReserve;

    // If we have 10 or fewer tickets, there is nothing to spend.
    if (ticketsToUse <= 0) {
      console.log("🚫 No excess tickets to spend.");
      return;
    }

    console.log(
      `🎯 Sending ${ticketsToUse} competeInDuel requests...`
    );

    // ----------------------------------------------------------
    // Spend every ticket above the 10-ticket reserve.
    // ----------------------------------------------------------

    for (let i = 1; i <= ticketsToUse; i++) {

      try {

        // --------------------------------------------------------
        // Instead of clicking the button, send the game's own
        // internal request directly.
        // --------------------------------------------------------

        await page.evaluate(async () => {

          await fetch('/ajax/beauty_pageant.php', {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/x-www-form-urlencoded'
            },
            credentials: 'same-origin',
            body: new URLSearchParams({
              action: 'competeInDuel'
            })
          });

        });

        // Small delay between ticket requests.
        await page.waitForTimeout(10);

      } catch (err) {

        // If one individual ticket request fails,
        // log the error and continue with the next one.
        console.log(
          `⚠️ Ticket request ${i} failed: ${err.message}`
        );

      }
    }

    console.log("✅ Excess ticket spending finished.");

  } catch (err) {

    // If the entire ticket section fails, it should NOT stop
    // the rest of Burn Energy.
    console.log(
      `⚠️ Ticket spending skipped: ${err.message}`
    );

  }
}


// ==============================================================
// 💅 BEAUTY PAGEANT
// ==============================================================
//
// IMPORTANT CHANGE:
//
// The ticket spending function is called BEFORE EVERY
// INDIVIDUAL BEAUTY PAGEANT JUDGING CYCLE.
//
// The sequence will therefore be:
//
// 🎟️ Spend tickets
// 👑 Judge 1
//
// 🎟️ Spend tickets
// 👑 Judge 2
//
// 🎟️ Spend tickets
// 👑 Judge 3
//
// etc.
//
// The winner selection inside each judging cycle now uses
// the preferred-lady list provided by you.
// ==============================================================

async function runBeautyPageant() {

  // ------------------------------------------------------------
  // Calculate how many judging cycles can be performed from
  // the current amount of blue Beauty Pageant energy.
  //
  // Every judging cycle uses 2 blue energy.
  // ------------------------------------------------------------

  async function getJudgeCycles() {

    const energySelector =
      '#header > div.wrapper > div > div.player-panel-middle > div.player-panel-energy > a.player-energy.player-bp-energy > span.player-energy-value';

    const blueEnergyText =
      await page.innerText(energySelector);

    const blueEnergy =
      parseInt(blueEnergyText.trim());

    // 2 blue energy = 1 judging cycle.
    const judgeCycles =
      Math.floor(blueEnergy / 2);

    return {
      blueEnergy,
      judgeCycles
    };
  }


  // ==========================================================
  // 👑 PERFORM ONE BEAUTY PAGEANT JUDGING CYCLE
  // ==========================================================
  //
  // This function performs ONE:
  //
  // judgeDuel
  //      ↓
  // chooseWinner
  //
  // cycle.
  //
  // The only change here is how the winner is selected.
  // ==============================================================

  async function performJudgeCycle() {

    const timeoutMs = 10000;
    const pollInterval = 500;
    const startTime = Date.now();

    // Keep trying to obtain valid duel information for up to
    // 10 seconds.
    while (Date.now() - startTime < timeoutMs) {

      // --------------------------------------------------------
      // Ask the game for a Beauty Pageant duel.
      // --------------------------------------------------------

      const duelRes = await page.evaluate(async () => {

        const res = await fetch(
          '/ajax/beauty_pageant.php',
          {
            method: 'POST',
            body: new URLSearchParams({
              action: 'judgeDuel'
            }),
            credentials: 'same-origin'
          }
        );

        return await res.json();

      });


      // --------------------------------------------------------
      // Extract the two ladies from the HTML returned by the game.
      // --------------------------------------------------------

      const matchRegex =
        /<a id="ladyIdContainer-(\d+)-([^"]+)"/g;

      const matches =
        [...duelRes.html.matchAll(matchRegex)];


      // We only continue when:
      //
      // 1. A duel ID was returned.
      // 2. Exactly two ladies were found.
      //

      if (
        duelRes.duel_id &&
        matches.length === 2
      ) {

        // ------------------------------------------------------
        // Get information for Lady #1.
        // ------------------------------------------------------

        const id1 = matches[0][1];
        const gameId1 = matches[0][2];

        // ------------------------------------------------------
        // Get information for Lady #2.
        // ------------------------------------------------------

        const id2 = matches[1][1];
        const gameId2 = matches[1][2];


        // ------------------------------------------------------
        // Preferred ladies
        // ------------------------------------------------------
        //
        // A lady is considered a match ONLY when BOTH:
        //
        //   lady ID
        //   corresponding game ID
        //
        // match one of the pairs below.
        //
        // "int" is intentionally treated as the literal string
        // "int", as provided.
        // ------------------------------------------------------

        const preferredLadies = new Set([
          '5770038|int',
          '8523231|int',
          '8523270|int',
          '8523871|int',
          '8523849|int',
          '8524213|int',
          '8524649|int',
          '8546619|int',
          '8547010|int',
          '8547617|int',
          '8547627|int',
          '8725053|int',
          '8725189|int',
          '8728257|int',
          '8728376|int',
          '8730372|int',
          '8731108|int',
          '8733740|int',
          '8735184|int',
          '8735348|int',
          '8737577|int',
          '8737785|int',
          '8738056|int',
          '8738263|int',
          '8738389|int',
          '8738838|int',
          '8738960|int',
          '8739109|int',
          '8739246|int',
          '8739352|int'
        ]);


        // ------------------------------------------------------
        // Check whether each of the two ladies is in the list.
        //
        // The match requires the ID + game ID combination.
        // ------------------------------------------------------

        const lady1IsPreferred =
          preferredLadies.has(`${id1}|${gameId1}`);

        const lady2IsPreferred =
          preferredLadies.has(`${id2}|${gameId2}`);


        let winner;
        let winnerGameId;


        // ======================================================
        // CASE 1
        // ======================================================
        //
        // Only Lady #1 is in the preferred list.
        //
        // → Lady #1 automatically wins.
        // ======================================================

        if (
          lady1IsPreferred &&
          !lady2IsPreferred
        ) {

          winner = id1;
          winnerGameId = gameId1;

          console.log(
            `🎯 Preferred lady found: ${id1} (${gameId1})`
          );

        }


        // ======================================================
        // CASE 1
        // ======================================================
        //
        // Only Lady #2 is in the preferred list.
        //
        // → Lady #2 automatically wins.
        // ======================================================

        else if (
          lady2IsPreferred &&
          !lady1IsPreferred
        ) {

          winner = id2;
          winnerGameId = gameId2;

          console.log(
            `🎯 Preferred lady found: ${id2} (${gameId2})`
          );

        }


        // ======================================================
        // CASE 2
        // CASE 3
        // ======================================================
        //
        // If BOTH ladies are preferred:
        // → randomly choose one.
        //
        // If NEITHER lady is preferred:
        // → randomly choose one.
        //
        // So both situations use the same random selection.
        // ======================================================

        else {

          const pickFirst =
            Math.random() < 0.5;

          winner =
            pickFirst ? id1 : id2;

          winnerGameId =
            pickFirst ? gameId1 : gameId2;

          if (
            lady1IsPreferred &&
            lady2IsPreferred
          ) {

            console.log(
              `🎲 Both ladies are preferred. Randomly selected ${winner} (${winnerGameId}).`
            );

          } else {

            console.log(
              `🎲 Neither lady is preferred. Randomly selected ${winner} (${winnerGameId}).`
            );

          }
        }


        // ------------------------------------------------------
        // Tell the game which lady was selected.
        // ------------------------------------------------------

        await page.evaluate(
          async ({
            duelId,
            winnerId,
            winnerGameId
          }) => {

            const res = await fetch(
              '/ajax/beauty_pageant.php',
              {
                method: 'POST',
                body: new URLSearchParams({
                  action: 'chooseWinner',
                  duel_id: duelId,
                  winner_id: winnerId,
                  winner_game_id: winnerGameId
                }),
                credentials: 'same-origin'
              }
            );

            return await res.json();

          },
          {
            duelId: duelRes.duel_id,
            winnerId: winner,
            winnerGameId
          }
        );


        // One judging cycle is complete.
        console.log(
          `👑 Judged duel ${duelRes.duel_id} ✔️`
        );

        return;
      }


      // If valid duel information wasn't received yet,
      // wait 500 ms and try again.
      await page.waitForTimeout(pollInterval);
    }


    // If valid duel information could not be obtained within
    // 10 seconds, skip this judging cycle.
    console.log(
      '❌ Timeout: Could not get valid duel data in 10s. Skipping.'
    );
  }


  console.log(
    "🔷 Starting Beauty Pageant energy burn..."
  );


  try {

    // ----------------------------------------------------------
    // Keep checking Beauty Pageant energy until there is no
    // complete judging cycle left.
    // ----------------------------------------------------------

    while (true) {

      // Open the Beauty Pageant page.
      await page.goto(
        'https://v3.g.ladypopular.com/beauty_pageant.php',
        {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        }
      );

      // Give the page time to fully update its displayed energy.
      await page.waitForTimeout(5000);


      // Read blue energy and calculate available judge cycles.
      const {
        blueEnergy,
        judgeCycles
      } = await getJudgeCycles();


      console.log(
        `🔷 You have ${blueEnergy} blue energy. Judge cycles: ${judgeCycles}`
      );


      // If there isn't enough energy for even one cycle,
      // Beauty Pageant judging is finished.
      if (judgeCycles < 1) {

        console.log(
          "✅ No judge cycles left. Skipping Beauty Pageant judging."
        );

        break;
      }


      // --------------------------------------------------------
      // 🎟️ TICKETS → 👑 JUDGE → 🎟️ TICKETS → 👑 JUDGE
      // --------------------------------------------------------

      for (
        let i = 0;
        i < judgeCycles;
        i++
      ) {

        try {

          // ====================================================
          // 🎟️ SPEND EXCESS TICKETS FIRST
          // ====================================================
          //
          // The upcoming judging cycle should award 2 tickets.
          //
          // So we first make room in the ticket storage.
          // ====================================================

          await spendExcessTickets();


          // ====================================================
          // 👑 NOW PERFORM EXACTLY ONE JUDGING CYCLE
          // ====================================================

          await performJudgeCycle();


          // Keep the original 3-second delay after judging.
          await page.waitForTimeout(3000);

        } catch (err) {

          // If one judging cycle fails, log it and continue
          // with the next cycle.
          console.log(
            `⚠️ Judge cycle ${i + 1} failed: ${err.message}`
          );

        }
      }
    }

  } catch (err) {

    // Beauty Pageant failure must not prevent the rest of
    // Burn Energy from continuing.
    console.log(
      `⚠️ Beauty Pageant section failed: ${err.message}`
    );

  }
}


// ==============================================================
// 🟧 FASHION ARENA
// ==============================================================
//
// This section is unchanged.
//
// The ONLY difference in the overall script is that this
// function is called FIRST in the final execution order.
// ==============================================================

async function runFashionArena() {

  let arenaEnergy = 1;
  let arenaErrors = 0;


  while (arenaEnergy > 0) {

    try {

      console.log(
        "🟧 Navigating to BP..."
      );


      await page.goto(
        'https://v3.g.ladypopular.com/beauty_pageant.php',
        {
          timeout: 60000
        }
      );


      // --------------------------------------------------------
      // Original 3 page refreshes.
      // --------------------------------------------------------

      for (let i = 1; i <= 3; i++) {

        console.log(
          `🔄 Refreshing Fashion Arena page (${i}/3)...`
        );

        await page.reload({
          timeout: 30000
        });

        await page.waitForLoadState(
          'domcontentloaded'
        );
      }


      // --------------------------------------------------------
      // Read Fashion Arena energy.
      // --------------------------------------------------------

      const energyText =
        await page.innerText(
          '#header > div.wrapper > div > div.player-panel-middle > div.player-panel-energy > a.player-energy.player-arena-energy > span.player-energy-value > span'
        );


      arenaEnergy =
        parseInt(energyText.trim());


      // If there is no Arena energy, stop.
      if (
        arenaEnergy <= 0 ||
        isNaN(arenaEnergy)
      ) {

        console.log(
          "✅ No energy left. Skipping Fashion Arena."
        );

        break;
      }


      console.log(
        `🔋 You have ${arenaEnergy} energy. Starting duels...`
      );


      // --------------------------------------------------------
      // Send one challenge request for each Arena energy.
      // --------------------------------------------------------

      for (
        let i = 0;
        i < arenaEnergy;
        i++
      ) {

        try {

          await page.evaluate(() => {

            return fetch(
              'https://v3.g.ladypopular.com/ajax/arena.php',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/x-www-form-urlencoded',
                  'X-Requested-With':
                    'XMLHttpRequest'
                },
                body: new URLSearchParams({
                  action: 'challenge'
                })
              }
            );

          });


          console.log(
            `⚔️ Duel ${i + 1}`
          );

          // Original 100 ms delay.
          await page.waitForTimeout(100);

        } catch (e) {

          console.log(
            `⚠️ Duel ${i + 1} failed: ${e.message}`
          );

          throw e;
        }
      }


      // --------------------------------------------------------
      // Reload and check Arena energy again.
      // --------------------------------------------------------

      await page.reload({
        timeout: 30000
      });

      await page.waitForLoadState(
        'domcontentloaded'
      );


      const energyAfter =
        await page.innerText(
          '#header > div.wrapper > div > div.player-panel-middle > div.player-panel-energy > a.player-energy.player-arena-energy > span.player-energy-value > span'
        );


      arenaEnergy =
        parseInt(energyAfter.trim());


      // If Arena energy remains, repeat the Arena process.
      if (arenaEnergy > 0) {

        console.log(
          `🔁 Still ${arenaEnergy} energy left. Repeating duels.`
        );

      } else {

        console.log(
          "✅ Finished all duels in Fashion Arena."
        );

        break;
      }


      // Successful cycle resets consecutive errors.
      arenaErrors = 0;


    } catch (err) {

      arenaErrors++;


      console.log(
        `⚠️ Fashion Arena error ${arenaErrors}/3: ${err.message}`
      );


      // Give up after 3 consecutive errors.
      if (arenaErrors >= 3) {

        console.log(
          "⛔ Fashion Arena failed 3 times. Moving on."
        );

        break;
      }


      console.log(
        "🔁 Refreshing page to retry Fashion Arena..."
      );


      try {

        await page.reload({
          timeout: 60000
        });

        await page.waitForTimeout(5000);

      } catch (reloadError) {

        console.log(
          `⚠️ Retry refresh failed: ${reloadError.message}`
        );

      }
    }
  }
}


// ==============================================================
// 🔄 FINAL EXECUTION ORDER
// ==============================================================
//
// NEW ORDER:
//
// 1. Fashion Arena
// 2. Beauty Pageant
//
// And inside Beauty Pageant:
//
// Tickets → Judge
// Tickets → Judge
// Tickets → Judge
// etc.
//
// Winner selection during each Judge cycle:
//
// 1. If exactly one lady is in the preferred list → choose her.
// 2. If both ladies are in the preferred list → random.
// 3. If neither lady is in the preferred list → random.
// ==============================================================


// 1️⃣ FIRST: BURN ALL FASHION ARENA ENERGY
await runFashionArena();


// 2️⃣ SECOND: BURN BEAUTY PAGEANT ENERGY
//
// Ticket spending is automatically performed before
// every individual judging cycle inside this function.

await runBeautyPageant();


// ==============================================================
// 🏁 FINISHED
// ==============================================================

console.log(
  "🏁 Burn Energy finished."
);

};
