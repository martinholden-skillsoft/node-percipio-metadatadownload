/* eslint-disable func-names */
const through2 = require('through2');
const papa = require('papaparse');

const csvTransformStream = (opts) => {
  const defaults = {
    objectMode: true,
    highWaterMark: 16,
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

  const Th2 = through2.ctor(
    options,
    function (chunk, enc, callback) {
      let data = chunk;

      if (chunk === undefined) {
        return callback(null);
      }

      try {
        if (typeof chunk !== 'object' && chunk !== null) {
          data = JSON.parse(chunk);
        }

        if (this.options.counter === 1 && this.options.papaparse.header) {
          this.options.papaparse.header = false;
        }

        const result = papa.unparse([data], this.options.papaparse);

        if (Array.isArray(result)) {
          result.forEach((record) => {
            this.options.counter += 1;
            this.emit('progress', this.options.counter);
            this.push(`${record}${this.options.papaparse.newline}`, enc);
          });
        } else {
          this.options.counter += 1;
          this.emit('progress', this.options.counter);
          this.push(`${result}${this.options.papaparse.newline}`, enc);
        }
        return callback(null);
      } catch (error) {
        return callback(error);
      }
    },
    function (callback) {
      this.emit('flush', this.options.counter);
      callback();
    }
  );

  return Th2();
};

module.exports = {
  csvTransformStream,
};
