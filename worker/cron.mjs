export default {
  async scheduled(_event, env) {
    const response = await fetch('https://resaf-api.onrender.com/internal/expire', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}`, 'x-resaf-scheduler': 'cloudflare' },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) throw new Error(`Resaf expiration sweep returned HTTP ${response.status}`);
    console.log(await response.text());
  },
};
