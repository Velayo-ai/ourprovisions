// Point the harness at a LOCAL build instead of the dev deployment.
//   node -r ./local/use-local.js signin.js      sign the test account in at the local URL
// The checks in this folder require it directly for LOCAL_URL. Port: OP_LOCAL_PORT (default 3000).
const lib = require("../lib");
const LOCAL_URL = `http://localhost:${process.env.OP_LOCAL_PORT || 3000}/`;
lib.DEV_URL = LOCAL_URL;   // signin.js reads lib.DEV_URL when it loads
module.exports = { LOCAL_URL };
