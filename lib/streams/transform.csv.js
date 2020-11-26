/* eslint-disable func-names */
const through2 = require('through2');
const papa = require('papaparse');

const csvTransformStream = (opts) => {
  const defaults = {
    objectMode: true,
    highWaterMark: 16,
    loggingOptions: {
      label: 'csvTransformStream',
    },
    papaparse: {
      quotes: true,
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ',',
      header: true,
      newline: '\r\n',
    },
  };

  const options = { ...defaults, ...opts };

  options.counter = 0;
  options.logger = typeof options.logger === 'object' ? options.logger : null;
  options.log = typeof options.logger === 'object';
  options.logcount = options.logcount || 500;

  const Th2 = through2.ctor(
    options,
    function (chunk, enc, callback) {
      const self = this.options;
      let data = chunk;

      if (chunk === undefined) {
        return callback(null);
      }

      try {
        if (typeof chunk !== 'object' && chunk !== null) {
          data = JSON.parse(chunk);
        }

        if (self.counter === 1 && self.papaparse.header) {
          self.papaparse.header = false;
        }

        const result = papa.unparse([data], self.papaparse);

        if (Array.isArray(result)) {
          result.forEach((record) => {
            self.counter += 1;
            this.push(`${record}${self.papaparse.newline}`);
          });
        } else {
          self.counter += 1;
          this.push(`${result}${self.papaparse.newline}`);
        }

        if (self.log && self.counter % self.logcount === 0) {
          self.logger.info(
            `Processing. Processed: ${self.counter.toLocaleString()}`,
            self.loggingOptions
          );
        }

        return callback(null);
      } catch (error) {
        return callback(error);
      }
    },
    function (callback) {
      const self = this.options;
      if (self.log) {
        self.logger.info(`Processed: ${self.counter.toLocaleString()}`, self.loggingOptions);
      }
      callback();
    }
  );

  return Th2();
};

module.exports = {
  csvTransformStream,
};
