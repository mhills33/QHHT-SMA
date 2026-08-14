const fs = require('fs');

const TOKEN = process.env.CALENDLY_TOKEN;
const EVENT_SCHEDULING_URL = 'https://calendly.com/marniqhht/qhht-session-with-marni';
const TIME_ZONE = 'America/Mexico_City';
const OUTPUT = 'availability.json';

if (!TOKEN) throw new Error('CALENDLY_TOKEN GitHub secret is missing.');

async function api(path) {
  const response = await fetch(`https://api.calendly.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' }
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Calendly API ${response.status}: ${body}`);
  return JSON.parse(body);
}

function normalizeUrl(url) {
  return (url || '').replace(/\/+$/, '').toLowerCase();
}

function displayParts(iso) {
  const dt = new Date(iso);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).formatToParts(dt);
}

function displayTime(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

(async () => {
  const me = await api('/users/me');
  const userUri = me.uri;

  const eventTypes = await api(`/event_types?user=${encodeURIComponent(userUri)}`);

  const eventType = eventTypes.collection.find(et =>
    normalizeUrl(et.scheduling_url) === normalizeUrl(EVENT_SCHEDULING_URL)
  );

  if (!eventType) {
    const names = eventTypes.collection
      .map(et => `${et.name} -> ${et.scheduling_url}`)
      .join('\n');

    throw new Error(
      `Could not find the QHHT event type. Available event types:\n${names}`
    );
  }

  const start = new Date();
  start.setSeconds(0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 31);

  const params = new URLSearchParams({
    event_type: eventType.uri,
    start_time: start.toISOString(),
    end_time: end.toISOString()
  });

  const availability = await api(`/event_type_available_times?${params}`);

  const slots = (availability.collection || [])
    .filter(slot => slot.start_time)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))
    .slice(0, 5);

  const output = {
    updated_at: new Date().toISOString(),
    time_zone: TIME_ZONE,
    event_type: eventType.name,
    scheduling_url: EVENT_SCHEDULING_URL,
    appointments: slots.map(slot => {
      const parts = displayParts(slot.start_time);

      const month = parts.find(p => p.type === 'month').value.toUpperCase();
      const day = parts.find(p => p.type === 'day').value;

      return {
        date: `${month} ${day}`,
        time: displayTime(slot.start_time),
        start_time: slot.start_time
      };
    })
  };

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(output, null, 2) + '\n'
  );

  console.log(
    `Wrote ${slots.length} upcoming appointments to ${OUTPUT}`
  );
})();
