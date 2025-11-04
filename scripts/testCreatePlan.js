#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3002';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  try {
    // wait for server to be up
    let ok = false;
    for (let i = 0; i < 20; i++) {
      try {
        const r = await fetch(`${base}/api/health`);
        if (r.ok) { ok = true; break; }
      } catch {}
      await sleep(500);
    }
    if (!ok) {
      console.error('Server not reachable on', base);
      process.exit(1);
    }

    // List plans
    let r = await fetch(`${base}/api/admin/subscriptions/plans?page=1&limit=10`);
    const before = await r.json();
    console.log('Plans before:', before.data?.plans?.length ?? 0);

    // Create plan
    const payload = {
      name: 'CLI Test Plan',
      base_price: 123,
      base_units: 10,
      unit_type: 'zipcode',
      additional_unit_price: 7.5,
      max_units: 50,
      is_active: true
    };
    r = await fetch(`${base}/api/admin/subscriptions/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const created = await r.json();
    console.log('Create status:', r.status, created);

    // List again
    r = await fetch(`${base}/api/admin/subscriptions/plans?page=1&limit=10`);
    const after = await r.json();
    console.log('Plans after:', after.data?.plans?.length ?? 0);
  } catch (e) {
    console.error('Test failed:', e);
    process.exit(1);
  }
})();
