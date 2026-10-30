// Home page line: a daily useless fact and where the ISS is right now.
(function () {
  var fact = null, place = null, lastLookup = 0;

  function render() {
    var el = document.getElementById('today');
    if (!el || (!fact && !place)) return;
    // The fact and the ISS's location are coloured, since they're the bits that change
    var parts = fact ? ['Did you know that ', { live: fact }, '?'] : [];
    if (place) parts = parts.concat([fact ? ' Also the ISS is over ' : 'The ISS is over ', { live: place }, ' right now.']);
    el.textContent = '';
    parts.forEach(function (p) {
      if (typeof p === 'string') return el.appendChild(document.createTextNode(p));
      var span = document.createElement('span');
      span.className = 'live';
      span.textContent = p.live;
      el.appendChild(span);
    });
    el.hidden = false;
  }

  // Facts arrive as full sentences, so drop the final full stop and, for ordinary
  // opening words, the capital letter so it reads mid-sentence
  var LOWER = /^(A|An|The|It|In|On|At|If|In|There|Most|More|Every|All|Some|About|Only|During|Each|When|One|No|Many|People|Humans|Your|You|Our|This|That|These|Those|Almost|Over|Before|After|Back|Because)\b/;
  function tidy(s) {
    s = s.trim().replace(/[.!]+$/, '');
    return LOWER.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  }

  fetch('https://uselessfacts.jsph.pl/api/v2/facts/today?language=en')
    .then(function (r) { return r.json(); })
    .then(function (d) { fact = tidy(d.text); render(); })
    .catch(function () {});

  // Countries that read better with "the" in front
  var THE = /^(United |Netherlands|Philippines|Bahamas|Gambia|Maldives|Czech Republic|Dominican Republic|Central African Republic|Democratic Republic)/;

  // Rough ocean names for when the ISS isn't over any country
  function ocean(lat, lon) {
    if (lat > 66) return 'the Arctic Ocean';
    if (lat < -60) return 'the Southern Ocean';
    if (lat > 30 && lat < 46 && lon > -6 && lon < 37) return 'the Mediterranean Sea';
    if ((lon > -70 && lon < 20) || (lat > 8 && lon > -100 && lon <= -70)) return 'the Atlantic Ocean';
    if ((lon >= 20 && lon < 100 && lat < 25) || (lon >= 100 && lon < 147 && lat < -10)) return 'the Indian Ocean';
    return 'the Pacific Ocean';
  }

  function updateIss() {
    // OpenStreetMap asks for at most one lookup per second, so only look the place up once a minute
    if (place && Date.now() - lastLookup < 60000) return;
    lastLookup = Date.now();
    fetch('https://api.wheretheiss.at/v1/satellites/25544')
      .then(function (r) { return r.json(); })
      .then(function (iss) {
        return fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=3&accept-language=en&lat=' + iss.latitude + '&lon=' + iss.longitude)
          .then(function (r) { return r.json(); })
          .then(function (geo) {
            place = geo.name ? (THE.test(geo.name) ? 'the ' + geo.name : geo.name) : ocean(iss.latitude, iss.longitude);
          })
          .catch(function () { place = ocean(iss.latitude, iss.longitude); })
          .then(render);
      })
      .catch(function () {});
  }

  updateIss();
  setInterval(updateIss, 20000);
})();
