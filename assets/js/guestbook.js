// Guestbook tab: the sign form and everyone's signatures with their guest numbers.
(function () {
  var book = document.querySelector('.guestbook');
  var g = window.goodthanks;
  if (!book || !g) return;
  var form = book.querySelector('.sign-form');
  var list = book.querySelector('.guestbook-entries');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function render(data) {
    list.textContent = '';
    data.entries.forEach(function (e) {
      var li = el('li');
      var date = el('time', null, new Date(e.created).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }));
      date.dateTime = e.created;
      li.append(el('span', 'pic', e.emoji), el('span', 'name', e.name), el('span', 'num', '#' + e.number), date);
      list.appendChild(li);
    });
    book.querySelector('.guestbook-empty').hidden = data.entries.length > 0;
    form.hidden = !!data.guest;
    var signed = book.querySelector('.signed-msg');
    signed.hidden = !data.guest;
    if (data.guest) signed.querySelector('span').textContent = data.guest.toLocaleString('en');
  }

  fetch(g.api + '/guestbook?client=' + g.client)
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function () {});

  g.bindForm(form, render);
})();
