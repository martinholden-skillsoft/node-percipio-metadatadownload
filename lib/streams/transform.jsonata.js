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

  // JSONata Bindings
  options.binding = options.jsonataBinding || {};

  const Th2 = through2.ctor(
    options,
    function (chunk, enc, callback) {
      let data = chunk;

      if (typeof chunk !== 'object' && chunk !== null) {
        data = JSON.parse(chunk);
      }

      try {
        const result = this.options.transformer.evaluate(data, this.options.binding);

        if (Array.isArray(result)) {
          result.forEach((record) => {
            this.options.counter += 1;
            this.emit('progress', this.options.counter);
            this.push(record, enc);
          });
        } else {
          this.options.counter += 1;
          this.emit('progress', this.options.counter);
          this.push(result, enc);
        }
        return callback(null);
      } catch (error) {
        return callback(error);
      }
    },
    function (callback) {
      callback();
    }
  );

  return Th2();
};

module.exports = {
  jsonataTransformStream,
};
