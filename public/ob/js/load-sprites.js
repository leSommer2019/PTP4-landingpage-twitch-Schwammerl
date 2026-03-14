(function() {
  fetch('img/sprites.svg')
    .then(function(r) { return r.text(); })
    .then(function(text) {
      if (text.includes('<svg')) {
          var div = document.createElement('div');
          div.innerHTML = text;
          var svg = div.firstElementChild;
          if (svg) {
              svg.style.display = 'none';
              document.body.appendChild(svg);
          }
      }
    })
    .catch(function(e) { console.error('Failed to load sprites', e); });
})();