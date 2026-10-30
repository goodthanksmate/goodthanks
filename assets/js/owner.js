// Hidden /owner/ page: signs this browser in (or out) as the site owner.
(function () {
  var box = document.querySelector('.owner');
  var g = window.goodthanks;
  if (!box || !g) return;
  var form = box.querySelector('.owner-form');
  var msg = form.querySelector('.form-msg');
  var signedIn = box.querySelector('.owner-in');

  function show(owner) {
    form.hidden = owner;
    signedIn.hidden = !owner;
    box.hidden = false;
  }

  function post(path, body) {
    return fetch(g.api + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ client: g.client }, body))
    }).then(function (r) { return r.json(); });
  }

  fetch(g.api + '/guestbook?me&client=' + g.client)
    .then(function (r) { return r.json(); })
    .then(function (d) { show(!!d.owner); })
    .catch(function () { show(false); });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    msg.textContent = '';
    post('/owner', { password: form.elements.password.value })
      .then(function (d) {
        if (d.error) { msg.textContent = d.error; return; }
        form.reset();
        show(true);
        g.refreshMe();
      })
      .catch(function () { msg.textContent = "Couldn't sign in right now."; });
  });

  box.querySelector('.owner-out').addEventListener('click', function () {
    post('/owner?signout', {}).then(function () { show(false); g.refreshMe(); });
  });
})();
