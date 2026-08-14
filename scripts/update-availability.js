const fs = require('fs');

const TOKEN = process.env.CALENDLY_TOKEN;
const EVENT_SCHEDULING_URL =
  'https://calendly.com/marniqhht/qhht-session-with-marni';

const TIME_ZONE = 'America/Mexico_City';
const OUTPUT = 'availability.json';

if (!TOKEN) {
  throw new Error('CALENDLY_TOKEN GitHub secret is missing.');
}

async function api(path) {
  const response = await fetch(`https://api.calendly.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/json'
    }
  });

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Calendly API ${response.status}: ${body}`
    );
  }

  return JSON.parse(body);
}

function normalizeUrl(url) {
  return (url || '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function formatDate(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(new Date(iso)).toUpperCase();
}

function formatTime(iso) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(iso));
}

(async () => {
  console.log('Getting Calendly user information...');

  const meResponse = await api('/users/me');

  /*
   * Calendly personal access tokens return the user URI
   * directly as "uri". This fallback also handles a
   * wrapped "resource" response if one is ever returned.
   */
  const me = meResponse.resource || meResponse;
  const userUri = me.uri;

  if (!userUri) {
    throw new Error(
      `Calendly did not return a user URI. Response keys: ${Object.keys(meResponse).join(', ')}`
    );
  }

  if (!userUri.startsWith('https://api.calendly.com/users/')) {
    throw new Error(
      `Calendly returned an unexpected user URI: ${userUri}`
    );
  }

  console.log(`User URI found: ${userUri}`);

  console.log('Getting your Calendly event types...');

  const eventTypesResponse = await api(
    `/event_types?user=${encodeURIComponent(userUri)}`
  );

  const eventTypes = eventTypesResponse.collection || [];

  console.log(`Found ${eventTypes.length} event type(s).`);

  if (eventTypes.length === 0) {
    throw new Error(
      'Calendly returned no event types for this user.'
    );
  }

  /*
   * Find the exact event connected to your public Calendly URL.
   */
  const targetUrl = normalizeUrl(EVENT_SCHEDULING_URL);

  const eventType = eventTypes.find((event) => {
    const schedulingUrl = normalizeUrl(event.scheduling_url);
    const schedulingUri = normalizeUrl(event.scheduling_uri);

    return (
      schedulingUrl === targetUrl ||
      schedulingUri === targetUrl
    );
  });

  if (!eventType) {
    const available = eventTypes
      .map((event) =>
        `${event.name || '(unnamed)'} → ${event.scheduling_url || event.scheduling_uri || '(no scheduling URL)'}`
      )
      .join('\n');

    throw new Error(
      `Could not find your QHHT event type.\n\nAvailable event types:\n${available}`
    );
  }

  if (!eventType.uri) {
    throw new Error(
      'The QHHT event type was found, but Calendly did not return its event type URI.'
    );
  }

  console.log(`Found event type: ${eventType.name}`);
  console.log(`Event type URI: ${eventType.uri}`);

  /*
   * Calendly currently allows up to 31 days for this endpoint.
   */
  const start = new Date();
  start.setSeconds(0, 0);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 31);

  const params = new URLSearchParams({
    event_type: eventType.uri,
    start_time: start.toISOString(),
    end_time: end.toISOString()
  });

  console.log('Getting available appointment times...');

  const availabilityResponse = await api(
    `/event_type_available_times?${params.toString()}`
  );

  const availableTimes = (availabilityResponse.collection || [])
    .filter((slot) => slot.start_time)
    .sort(
      (a, b) =>
        new Date(a.start_time) - new Date(b.start_time)
    )
    .slice(0, 5);

  console.log(
    `Found ${availableTimes.length} upcoming appointment(s).`
  );

  const output = {
    updated_at: new Date().toISOString(),
    time_zone: TIME_ZONE,
    event_type: eventType.name,
    scheduling_url: EVENT_SCHEDULING_URL,
    appointments: availableTimes.map((slot) => ({
      date: formatDate(slot.start_time),
      time: formatTime(slot.start_time),
      start_time: slot.start_time
    }))
  };

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(output, null, 2) + '\n',
    'utf8'
  );

  console.log(`Successfully updated ${OUTPUT}.`);
})();
