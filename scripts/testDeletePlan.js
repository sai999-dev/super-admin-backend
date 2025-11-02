#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3002';
  try {
    let r = await fetch(`${base}/api/admin/subscriptions/plans?page=1&limit=50`);
    const list = await r.json();
    const target = (list.data?.plans || []).find(p => (p.plan_name || p.name) === 'CLI Test Plan');
    if (!target) {
      console.log('No CLI Test Plan found to delete.');
      process.exit(0);
    }
    r = await fetch(`${base}/api/admin/subscriptions/plans/${target.id}`, { method: 'DELETE' });
    const del = await r.json();
    console.log('Delete status:', r.status, del);
  } catch (e) {
    console.error('Delete test failed:', e);
    process.exit(1);
  }
})();
