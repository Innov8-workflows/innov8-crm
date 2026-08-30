/* Innov8 Workflows site tracker — privacy-friendly, no cookies, no PII.
   Usage: <script defer src="https://crm.innov8workflows.co.uk/track.js" data-id="proj_xxxxxxxx"></script>
   Tracks: page views, click-to-call, WhatsApp, email, Maps, social, form submits.
*/
(function(){
  var script = document.currentScript || (function(){
    var scripts = document.getElementsByTagName('script');
    return scripts[scripts.length - 1];
  })();
  if (!script) return;
  var trackingId = script.getAttribute('data-id');
  if (!trackingId) return;

  var ENDPOINT = 'https://crm.innov8workflows.co.uk/api/track';
  var sent = {};

  function send(eventType, metadata) {
    var key = eventType + (metadata ? ':' + (metadata.href || metadata.target || '') : '');
    // Throttle duplicate events from same key within 1s
    if (sent[key] && Date.now() - sent[key] < 1000) return;
    sent[key] = Date.now();

    var body = JSON.stringify({
      tracking_id: trackingId,
      event_type: eventType,
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      metadata: metadata || null,
    });

    // Deliver with fetch, NEVER navigator.sendBeacon.
    //
    // sendBeacon cannot complete a request that needs a CORS preflight. A Blob
    // typed 'application/json' is not a CORS-safelisted content type, so Chrome
    // issues the OPTIONS, receives a valid 204, and then silently drops the POST
    // -- with or without a navigation, and while sendBeacon() still returns true.
    // Measured in real Chrome 151 (headless AND headful) against an endpoint
    // serving the same CORS headers as /api/track: the preflight arrived every
    // time, the POST never did. That is why call/WhatsApp/form events read zero
    // on every client site while page views trickled in from other engines.
    //
    // A text/plain body IS safelisted, so there is no preflight at all, and
    // keepalive lets the request survive the tab being carried off to the
    // dialler, WhatsApp, or a form POST. /api/track parses the JSON body
    // regardless of the declared Content-Type (verified against live).
    // Do not "simplify" this back to sendBeacon.
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body
      })['catch'](function () { /* never break the page */ });
    } catch (e) { /* swallow */ }
  }

  // Page view on load
  send('page_view');

  // Track interesting clicks via event delegation
  document.addEventListener('click', function(e) {
    var el = e.target;
    while (el && el !== document.body) {
      if (el.tagName === 'A') {
        var href = (el.getAttribute('href') || '').toLowerCase();
        if (href.indexOf('tel:') === 0) { send('call_click', { href: href.replace('tel:', '') }); return; }
        if (href.indexOf('mailto:') === 0) { send('email_click', { href: href.replace('mailto:', '') }); return; }
        if (href.indexOf('wa.me') >= 0 || href.indexOf('api.whatsapp.com') >= 0 || href.indexOf('whatsapp://') === 0) { send('whatsapp_click', { href: href }); return; }
        if (href.indexOf('m.me') >= 0 || href.indexOf('messenger.com') >= 0) { send('messenger_click', { href: href }); return; }
        if (href.indexOf('maps.google') >= 0 || href.indexOf('goo.gl/maps') >= 0 || href.indexOf('maps.app.goo.gl') >= 0) { send('map_click', { href: href }); return; }
        if (href.indexOf('instagram.com') >= 0) { send('social_click', { network: 'instagram', href: href }); return; }
        if (href.indexOf('facebook.com') >= 0 && href.indexOf('m.me') < 0) { send('social_click', { network: 'facebook', href: href }); return; }
        if (href.indexOf('tiktok.com') >= 0) { send('social_click', { network: 'tiktok', href: href }); return; }
        if (href.indexOf('calendly') >= 0 || href.indexOf('booking') >= 0 || href.indexOf('appointment') >= 0) { send('booking_click', { href: href }); return; }
      }
      el = el.parentElement;
    }
  }, true);

  // Form submissions
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    send('form_submit', { id: form.id || '', action: form.action || '' });
  }, true);
})();
