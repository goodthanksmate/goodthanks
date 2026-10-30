// Shared guestbook helpers: the anonymous browser ID, signing, and sign forms. Shows the signed-in
// guest's name and icon in the header, and `.sign-nudge` elements only to browsers that haven't signed.
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
        .then(function (d) { if (d.error) msg.textContent = d.error; else { onSigned(d); g.refreshMe(); } })
        .catch(function () { msg.textContent = "Couldn't sign right now, try again in a bit."; })
        .then(function () { button.disabled = false; });
    });
  };

  g.refreshMe = function () {
    fetch(api + '/guestbook?me&client=' + client)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var known = !!(d.guest || d.owner);
        [].forEach.call(document.querySelectorAll('.sign-nudge'), function (n) { n.hidden = known; });
        var chip = document.querySelector('.me-chip');
        if (!chip) return;
        chip.hidden = !known;
        if (!known) return;
        chip.querySelector('.emoji').textContent = d.emoji;
        chip.querySelector('.me-name').textContent = d.name;
        chip.title = d.owner ? "You're the owner" : "You're guest #" + d.guest;
      })
      .catch(function () {});
  };

  document.addEventListener('DOMContentLoaded', g.refreshMe);
})();
