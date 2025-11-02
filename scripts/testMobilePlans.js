#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3002';
  try {
    const r = await fetch(`${base}/api/mobile/subscription/plans`);
    const text = await r.text();
    let j = null;
    try { j = JSON.parse(text); } catch {}
    console.log('Status:', r.status);
    if (j) {
      console.log('Count:', j?.data?.plans?.length || 0);
      console.log('Sample:', (j?.data?.plans || []).slice(0,2));
      console.log('Body:', j);
    } else {
      console.log('Raw:', text);
    }
  } catch (e) {
    console.error('Failed:', e.message || e);
    process.exit(1);
  }
})();
