#!/usr/bin/env node
(async () => {
  const base = 'http://localhost:3002';
  const headers = { 'Content-Type': 'application/json' };
  try {
    // Create
    const createRes = await fetch(`${base}/api/admin/subscriptions/plans`, {
      method: 'POST', headers, body: JSON.stringify({ plan_name: 'Temp Plan CRUD', base_price: 11.23, is_active: false })
    });
    const createJson = await createRes.json().catch(() => ({}));
    console.log('Create:', createRes.status, createJson.success);
    const id = createJson?.data?.plan?.id;
    if (!id) throw new Error('No plan id');

    // Update name and is_active
    const putRes = await fetch(`${base}/api/admin/subscriptions/plans/${id}`, {
      method: 'PUT', headers, body: JSON.stringify({ plan_name: 'Temp Plan CRUD Updated', is_active: true })
    });
    const putJson = await putRes.json().catch(() => ({}));
    console.log('Update:', putRes.status, putJson.success);

    // Deactivate
    const deactRes = await fetch(`${base}/api/admin/subscriptions/plans/${id}`, {
      method: 'PUT', headers, body: JSON.stringify({ is_active: false })
    });
    const deactJson = await deactRes.json().catch(() => ({}));
    console.log('Deactivate:', deactRes.status, deactJson.success);

    // Delete
    const delRes = await fetch(`${base}/api/admin/subscriptions/plans/${id}`, { method: 'DELETE' });
    const delJson = await delRes.json().catch(() => ({}));
    console.log('Delete:', delRes.status, delJson.success);

    process.exit(0);
  } catch (e) {
    console.error('CRUD test failed:', e.message || e);
    process.exit(1);
  }
})();
