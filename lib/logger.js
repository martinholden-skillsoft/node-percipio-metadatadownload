const { createLogger, format, transports } = require('winston');
const { accessSafe } = require('access-safe');
const _ = require('lodash');

const { combine, timestamp, printf } = format;

const errorFormatter = format((info) => {
  const errorInfo = info;

  if (info.message instanceof Error) {
    const err = info.message;
    errorInfo.message = `${err.name}: ${err.message}`;
    if (err.isAxiosError) {
      errorInfo.message = `${
        err.config.correlationid ? `CorrelationId: ${err.config.correlationid}` : ''
      } ${err.message}.`;

      // Check for Percipio error messages in response data
      if (accessSafe(() => _.isArray(err.response.data.errors), false)) {
        errorInfo.message += err.response.data.errors.reduce((accumulator, currentValue) => {
          return `${accumulator} ${JSON.stringify(currentValue)},`;
        }, ' Percipio Error Messages: [');
        errorInfo.message += ']';
      }
    }
  }

  if (info instanceof Error) {
    const err = info;
    errorInfo.message = `${err.name}: ${err.message}`;
    if (err.isAxiosError) {
      errorInfo.message = `${
        err.config.correlationid ? `CorrelationId: ${err.config.correlationid}` : ''
      } ${err.message}.`;

      // Check for Percipio error messages in response data
      if (accessSafe(() => _.isArray(err.response.data.errors), false)) {
        errorInfo.message += err.response.data.errors.reduce((accumulator, currentValue) => {
          return `${accumulator} ${JSON.stringify(currentValue)},`;
        }, ' Percipio Error Messages: [');
        errorInfo.message += ']';
      }
    }
  }
  return errorInfo;
});

const myFormat = printf((info) => {
  return `${info.timestamp} [${info.label}] ${info.level}: ${info.message}`;
});

const logger = createLogger({
  format: combine(timestamp(), errorFormatter(), myFormat),
  transports: [
    new transports.Console({
      colorize: true,
    }),
  ],
});

logger.level = process.env.LOG_LEVEL || 'info';

module.exports = logger;
