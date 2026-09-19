async function runFurniture(page) {
  function parseDollars(text) {
    text = text.toLowerCase().replace(',', '').trim();
    if (text.endsWith('k')) return parseFloat(text) * 1000;
    if (text.endsWith('m')) return parseFloat(text) * 1_000_000;
    return parseFloat(text);
  }

  const ITEM_PRICE = 260;
  const MAX_CART_ITEMS = 20;
  const MAX_LOOPS = 10;

  let loopCount = 0;

  while (loopCount < MAX_LOOPS) {
    loopCount++;
    console.log(`🔄 Furniture loop ${loopCount}/${MAX_LOOPS}...`);

    console.log('🛒 Navigating to cart page...');
    await page.goto('https://v3.g.ladypopular.com/mall/cart.php?action=loadMallContent');
    await page.waitForLoadState('networkidle');

    // 💰 Check if we have enough dollars
    const dollarText = await page.locator('#player-dollars').innerText();
    const dollars = parseDollars(dollarText);
    console.log(`💰 Current dollars: ${dollars}`);
    if (dollars < ITEM_PRICE * MAX_CART_ITEMS) {
      console.log('💸 Dollars below threshold. Stopping furniture loop.');
      break;
    }

    // 🛍️ Add items to cart — fire requests in concurrent batches instead of one-by-one.
    // Each batch is awaited fully before the next batch starts, so a failure stops
    // things quickly without sending all 100 requests regardless of outcome.
    const BATCH_SIZE = MAX_CART_ITEMS; // fire the whole 20-item cycle as one batch
    console.log(`📦 Adding ${MAX_CART_ITEMS} items to cart in batches of ${BATCH_SIZE}...`);

    function addOneItem() {
      return page.request.post('https://v3.g.ladypopular.com/ajax/mall/cart.php', {
        form: {
          action: 'addToCart',
          mallType: '3',
          itemId: '726',
          itemCategoryId: '19',
          itemCollectionId: '19',
          itemColor: '1',
          pageNum: '1',
          collectionsPage: 'false',
          orderBy: 'id',
          orderType: 'desc'
        }
      });
    }

    let addedCount = 0;
    let stop = false;

    for (
      let batchStart = 0;
      batchStart < MAX_CART_ITEMS && !stop;
      batchStart += BATCH_SIZE
    ) {
      const batchLen = Math.min(
        BATCH_SIZE,
        MAX_CART_ITEMS - batchStart
      );

      const responses = await Promise.all(
        Array.from({ length: batchLen }, () => addOneItem())
      );

      for (let j = 0; j < responses.length; j++) {
        let json;

        try {
          json = await responses[j].json();
        } catch (err) {
          console.warn(
            `⚠️ Failed to parse response for item ${batchStart + j + 1}:`,
            err.message
          );
          stop = true;
          break;
        }

        if (json?.status !== 1) {
          console.warn(
            `⚠️ Failed to add item ${batchStart + j + 1}: ${
              json?.message || 'unknown error'
            }`
          );
          stop = true;
          break;
        }

        addedCount++;
      }
    }

    if (addedCount === 0) {
      console.warn('⚠️ No items were added this cycle. Stopping.');
      break;
    }

    console.log(`✅ Added ${addedCount} item(s) to cart.`);

    // 🧾 Buy items directly via the internal checkout API — no UI click, no waiting for a button.
    console.log('🪙 Sending checkout request...');

    let buySuccess = false;

    try {
      const buyResponse = await page.request.post(
        'https://v3.g.ladypopular.com/ajax/mall/cart.php',
        {
          form: {
            action: 'checkoutCart',
            collectionsPage: 'false'
          }
        }
      );

      const buyJson = await buyResponse.json();
      buySuccess = buyJson?.status === 1;
    } catch (err) {
      console.error('❌ Checkout request failed:', err.message);
      buySuccess = false;
    }

    console.log(
      buySuccess
        ? '✅ Buying success.'
        : '❌ Buying failed.'
    );

    if (!buySuccess) {
      break;
    }
  }

  if (loopCount >= MAX_LOOPS) {
    console.log(`🛑 Maximum of ${MAX_LOOPS} furniture loops reached.`);
  }

  console.log('🏁 Furniture automation complete.');
}

module.exports = runFurniture;
