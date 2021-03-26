const { createLogger, format, transports } = require('winston');

const { combine, timestamp, printf } = format;

const errorFormatter = format((info) => {
  const errorInfo = info;

  if (info.message instanceof Error) {
    const err = info.message;
    errorInfo.message = `${err.name}: ${err.message}`;
    if (err.isAxiosError) {
      errorInfo.message = `${
        err.config.correlationid ? `CorrelationId: ${err.config.correlationid}` : ''
      } ${err.code}: ${err.message}.`;
    }
  }

  if (info instanceof Error) {
    const err = info;
    errorInfo.message = `${err.name}: ${err.message}`;
    if (err.isAxiosError) {
      errorInfo.message = `${
        err.config.correlationid ? `CorrelationId: ${err.config.correlationid}` : ''
      } ${err.code}: ${err.message}.`;
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
