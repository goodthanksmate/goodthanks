// Shared guestbook helpers: the anonymous browser ID, signing, and sign forms.
// Pages with a `.sign-nudge` element show it only to browsers that haven't signed yet.
(function () {
  var api = document.documentElement.dataset.api;
  if (!api) return;

  var client;
  try { client = localStorage.getItem('reactions-client'); } catch (e) {}
  if (!client) {
    client = crypto.randomUUID();
    try { localStorage.setItem('reactions-client', client); } catch (e) {}
  }

  var g = window.goodthanks = { api: api, client: client };

  // Hooks up a sign form; onSigned gets the guestbook's new state
  g.bindForm = function (form, onSigned) {
    var msg = form.querySelector('.form-msg');
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var button = form.querySelector('button');
      button.disabled = true;
      msg.textContent = '';
      fetch(api + '/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: client, name: form.elements.name.value, emoji: form.elements.emoji.value })
      })
        .then(function (r) { return r.json(); })
        .then(function (d) { if (d.error) msg.textContent = d.error; else onSigned(d); })
        .catch(function () { msg.textContent = "Couldn't sign right now, try again in a bit."; })
        .then(function () { button.disabled = false; });
    });
  };

  document.addEventListener('DOMContentLoaded', function () {
    var nudges = document.querySelectorAll('.sign-nudge');
    if (!nudges.length) return;
    fetch(api + '/guestbook?me&client=' + client)
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.guest) [].forEach.call(nudges, function (n) { n.hidden = false; }); })
      .catch(function () {});
  });
})();
