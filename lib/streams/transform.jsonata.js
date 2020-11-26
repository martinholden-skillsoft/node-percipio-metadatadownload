/* eslint-disable func-names */
const through2 = require('through2');
const jsonata = require('jsonata-extended');
const fs = require('fs');

const jsonataTransformStream = (opts) => {
  const defaults = {
    objectMode: true,
    highWaterMark: 16,
    loggingOptions: {
      label: 'jsonataTransformStream',
    },
  };

  const options = { ...defaults, ...opts };

  options.counter = 0;

  if (fs.existsSync(options.transform)) {
    options.transformExpr = fs.readFileSync(options.transform, 'utf8');
  } else {
    throw new Error(`jsonataTransformStream. No such file or directory ${options.transform}`);
  }

  options.transformer = jsonata(options.transformExpr);

  options.logger = typeof options.logger === 'object' ? options.logger : null;
  options.log = typeof options.logger === 'object';
  options.logcount = options.logcount || 500;

  // JSONata Bindings
  options.binding = options.jsonataBinding || {};

  if (options.log) {
    options.logger.debug(
      `JSONata Binding: ${JSON.stringify(options.binding)}`,
      options.loggingOptions
    );
  }

  const Th2 = through2.ctor(
    options,
    function (chunk, enc, callback) {
      const self = this.options;
      let data = chunk;

      if (typeof chunk !== 'object' && chunk !== null) {
        data = JSON.parse(chunk);
      }

      try {
        const result = self.transformer.evaluate(data, self.binding);

        if (Array.isArray(result)) {
          result.forEach((record) => {
            self.counter += 1;
            this.push(record);
          });
        } else {
          self.counter += 1;
          this.push(result);
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
  jsonataTransformStream,
};
