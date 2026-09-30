async page => {
  const target = page.context().browser().contexts().flatMap(c => c.pages())
    .find(p => p.url().includes('stream-recovery-test=20260911'));
  if (!target) throw new Error('請先執行 setup-recovery-test.js 建立隔離頁面');
  const results = [];
  await target.evaluate(async () => {
    if (document.getElementById('vidEl')) closePlayer();
    const key = driveURL(driveEntry('115暑電子09').id);
    const data = readJSON(PL_LS, {});
    data[key] = {t: 4923.133, dur: 5823.133, pct: 85, at: todayStr()};
    localStorage.setItem(PL_LS, JSON.stringify(data));
    window.__beforeIndexFailure = fetch;
    let failed = false;
    window.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('.fragidx.json') && !failed) {
        failed = true;
        return Promise.resolve(new Response('', {status: 503}));
      }
      return window.__beforeIndexFailure(input, options);
    };
    await drivePlay('115暑電子09', '115暑電子09 MOSFET');
  });
  await target.getByText('串流準備失敗，請重新連線。', {exact: true}).waitFor();
  await target.getByRole('button', {name: '重新連線', exact: true}).click();
  await target.waitForFunction(() => vidEl().readyState >= 2 && !driveMSERestoring(vidEl()), null, {timeout: 45000});
  const initial = await target.evaluate(() => {
    window.fetch = window.__beforeIndexFailure;
    return {time: vidEl().currentTime, paused: vidEl().paused};
  });
  if (Math.abs(initial.time - 4923.133) > .2) throw new Error('第一次載入失敗後重試遺失續播位置');
  results.push({case: '第一次載入失敗後保留既有續播位置', ...initial, pass: true});
  await target.evaluate(async () => {
    const v = vidEl(); v.muted = true; vidRate(3); await v.play().catch(() => {});
    window.__beforeRecoveryDelay = fetch;
    window.fetch = (input, options) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('.fragidx.json')) return new Promise(resolve => {
        window.__releaseRecovery = () => resolve(window.__beforeRecoveryDelay(input, options));
      });
      return window.__beforeRecoveryDelay(input, options);
    };
    driveMSERecover(v);
  });
  await target.waitForFunction(() => typeof window.__releaseRecovery === 'function');
  await target.evaluate(() => { void vidEl().play().catch(() => {}); });
  await target.waitForTimeout(100);
  await target.evaluate(() => vidEl().pause());
  await target.waitForTimeout(100);
  await target.evaluate(() => { window.fetch = window.__beforeRecoveryDelay; window.__releaseRecovery(); });
  await target.waitForFunction(() => vidEl().readyState >= 2 && !driveMSERestoring(vidEl()), null, {timeout: 45000});
  await target.waitForTimeout(200);
  const paused = await target.evaluate(() => ({paused: vidEl().paused, rate: vidEl().playbackRate}));
  if (!paused.paused || paused.rate !== 3) throw new Error('恢復完成後覆蓋了使用者最新的暫停或倍速選擇');
  results.push({case: '恢復期間按暫停，完成後仍保持暫停', ...paused, pass: true});
  for (const rate of [2.5, 3]) {
    const position = rate === 2.5 ? 3123.133 : 4923.133;
    await target.evaluate(({rate, position}) => {
      window.__beforeRateDelay = fetch;
      window.__heldForBuffer = false;
      window.fetch = async (input, options) => {
        const url = typeof input === 'string' ? input : input.url;
        const response = await window.__beforeRateDelay(input, options);
        if (url.includes('/drive/')) {
          const read = response.arrayBuffer.bind(response);
          response.arrayBuffer = async () => {
            await new Promise(resolve => setTimeout(resolve, 1600));
            return read();
          };
        }
        return response;
      };
      const v = vidEl();
      window.__bufferObserver = () => { if (driveMSEBuffering(v)) window.__heldForBuffer = true; };
      v.addEventListener('pause', window.__bufferObserver);
      v.currentTime = position; vidRate(rate);
      void v.play().catch(() => {});
    }, {rate, position});
    await target.waitForFunction(position => vidEl().currentTime > position + 1 && !vidEl().paused && !driveMSEBuffering(vidEl()), position, {timeout: 45000});
    const start = await target.evaluate(() => ({time: vidEl().currentTime, wall: performance.now()}));
    await target.waitForTimeout(6000);
    const sample = await target.evaluate(start => {
      const v = vidEl();
      const result = {rate: v.playbackRate, advanced: v.currentTime - start.time,
        wallSeconds: (performance.now() - start.wall) / 1000, prebuffered: window.__heldForBuffer,
        error: v.error?.code || null};
      v.pause(); v.removeEventListener('pause', window.__bufferObserver);
      window.fetch = window.__beforeRateDelay;
      return result;
    }, start);
    if (!sample.prebuffered || sample.advanced < sample.wallSeconds * rate * .9 || sample.error)
      throw new Error('高倍速預先緩衝或持續播放未通過：' + JSON.stringify(sample));
    results.push({case: rate + '倍先緩衝再連續播放（受控延遲）', ...sample, pass: true});
  }
  await target.evaluate(async () => {
    await driveMSEAttach(vidEl(), driveURL(driveEntry('115暑電子09').id), '115暑電子09',
      {time: 5818, rate: 3, play: false});
  });
  await target.waitForFunction(() => vidEl().readyState >= 2 && !driveMSERestoring(vidEl()), null, {timeout: 15000});
  await target.waitForTimeout(1200);
  await target.evaluate(() => { vidEl().currentTime = 4200; void vidEl().play().catch(() => {}); });
  await target.waitForFunction(() => vidEl().currentTime > 4201 && vidEl().readyState >= 2, null, {timeout: 15000});
  const backwards = await target.evaluate(() => { const v = vidEl(); v.pause(); return {time: v.currentTime, rate: v.playbackRate}; });
  results.push({case: '尾段下載完成後仍可跳回前面', ...backwards, pass: true});
  return results;
}
