(function () {
  "use strict";

  // Register the single dockable panel declared in the UXP manifest.
  const { entrypoints } = require("uxp");

  entrypoints.setup({
    panels: {
      "pmt-main": {
        show(rootNode) {
          // Mount the panel only when Premiere asks UXP to show it.
          window.PMT_UI.mount(rootNode);
        }
      }
    }
  });
}());

