// This script is used to load the consent.js script from the DataGrail API.
(function () {
    var config = JSON.parse('{"customerId":"b8f6c3bf-2519-4023-963a-974547789e46","consentContainerVersion":"a40645f8-e387-489e-9ed0-04529839540c","privacyDomain":"api.consentjs.datagrail.io","plugins":{},"gppUsnat":false}');
    var scriptUrl = "https://".concat(config.privacyDomain, "/consent/").concat(config.customerId, "/").concat(config.consentContainerVersion, "/consent.js");
    var script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    document.head.appendChild(script);
})();
