// tele.js..

module.exports = async function runTeleportEvent(page) {
  const teleportUrl = process.env.LP_TELEPORT_URL;

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
};

