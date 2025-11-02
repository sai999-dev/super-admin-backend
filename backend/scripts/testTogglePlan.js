#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3002';
  try {
    let r = await fetch(`${base}/api/admin/subscriptions/plans?is_active=true&page=1&limit=1`);
    const list = await r.json();
    const plan = (list.data?.plans || [])[0];
    if (!plan) {
      console.log('No active plan found to toggle.');
      process.exit(0);
    }
    const id = plan.id;
    // Deactivate
    r = await fetch(`${base}/api/admin/subscriptions/plans/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: false })
    });
    const d1 = await r.json();
    console.log('Deactivate:', r.status, d1.success);
    // Reactivate
    r = await fetch(`${base}/api/admin/subscriptions/plans/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_active: true })
    });
    const d2 = await r.json();
    console.log('Reactivate:', r.status, d2.success);
  } catch (e) {
    console.error('Toggle test failed:', e);
    process.exit(1);
  }
})();
