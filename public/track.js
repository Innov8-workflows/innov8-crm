

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

    if (sent[key] && Date.now() - sent[key] < 1000) return;
    sent[key] = Date.now();

    var body = JSON.stringify({
      tracking_id: trackingId,
      event_type: eventType,
      path: location.pathname + location.search,
      referrer: document.referrer || '',
      metadata: metadata || null,
    });

















    try {
      fetch(ENDPOINT, {
        method: 'POST',
        mode: 'no-cors',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: body
      })['catch'](function () {   });
    } catch (e) {   }
  }


  send('page_view');


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


  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    send('form_submit', { id: form.id || '', action: form.action || '' });
  }, true);
})();
