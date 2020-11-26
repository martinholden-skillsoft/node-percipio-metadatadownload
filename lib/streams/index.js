const { jsonataTransformStream } = require('./transform.jsonata');
const { csvTransformStream } = require('./transform.csv');

module.exports = {
  jsonataTransformStream,
  csvTransformStream,
};
