const { createLogger } = require('winston');
const { NullTransport } = require('winston-null');

const nulllogger = createLogger({
  transports: [new NullTransport()],
  silent: true,
});

module.exports = nulllogger;
