// Post lists (blog page, home page, post sidebar): each post's total reactions with its top three emojis stacked.
(function () {
  [].forEach.call(document.querySelectorAll('[data-reactions-api]'), function (list) {
    var slots = [].slice.call(list.querySelectorAll('.post-reactions'));
    if (!slots.length) return;
    var reactions = JSON.parse(list.dataset.reactions);
    var posts = slots.map(function (s) { return s.dataset.post; });

    fetch(list.dataset.reactionsApi + '?posts=' + posts.map(encodeURIComponent).join(','))
      .then(function (r) { return r.json(); })
      .then(function (all) {
        slots.forEach(function (slot) {
          var counts = all[slot.dataset.post] || {};
          // Most popular first; ties keep the order from _config.yml
          var top = reactions
            .filter(function (r) { return counts[r.name] > 0; })
            .sort(function (a, b) { return counts[b.name] - counts[a.name]; })
            .slice(0, 3);
          var total = reactions.reduce(function (sum, r) { return sum + (counts[r.name] || 0); }, 0);
          if (!total) return;

          var stack = document.createElement('span');
          stack.className = 'stack';
          top.forEach(function (r) {
            var e = document.createElement('span');
            e.textContent = r.emoji;
            e.title = r.label;
            stack.appendChild(e);
          });
          slot.appendChild(stack);
          var count = document.createElement('span');
          count.className = 'total';
          count.textContent = total;
          slot.appendChild(count);
          slot.title = total + (total === 1 ? ' reaction' : ' reactions');
        });
      })
      .catch(function () {});
  });
})();
