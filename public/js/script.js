
    (function() {
      if (document.getElementById('lt-br-fp-lib')) {
        return;
      }

      var script = document.createElement('script');
      script.src = 'https://assets.production.linktr.ee/client-brfp/br-fp-script.js';
      script.async = true;
      script.id = 'lt-br-fp-lib';

      script.onload = function() {
        if (typeof window.__lt_br_fp !== 'undefined' && typeof window.__lt_br_fp.generate === 'function') {
          window.__lt_br_fp.generate({
            networkProfile: {
              asNumber: '29447',
              country: 'IT',
              city: 'campo calabro',
              region: 'RC',
              acceptEncoding: 'gzip, deflate, br, zstd',
              acceptLanguage: '',
              ja4: 't13d521100_b262b3658495_8e6e362c5eac'
            }
          })
        }
      };

      document.head.appendChild(script);
    })();
  