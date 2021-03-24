/* eslint no-param-reassign: ["error", { "props": false }] */

const httpAdapter = require('axios/lib/adapters/http');
const settle = require('axios/lib/core/settle');
const createError = require('axios/lib/core/createError');
const utils = require('axios/lib/utils');
const { accessSafe } = require('access-safe');
const { v4: uuidv4 } = require('uuid');

/**
 * Axios Adapter thats adds timing metrics and correlationid
 *
 * @param {*} config
 * @return {Promise}
 */
const timingAdapter = (config) => {
  const correlationid = uuidv4();
  const sendTime = new Date();

  config.correlationid = config.correlationid || correlationid;

  return new Promise((resolve, reject) => {
    httpAdapter(config)
      .then((response) => {
        const receivedTime = accessSafe(() => new Date(response.headers.date), new Date());
        response.timings = {
          sent: sendTime,
          received: receivedTime,
          durationms: receivedTime - sendTime,
        };

        // We need to confirm the response is JSON,
        // sometimes Percipio will return a 200 response but it wont be JSON
        if (config.responseType === 'json' || utils.isUndefined(config.responseType)) {
          try {
            if (utils.isString(response.data) && response.data.length) {
              response.data = JSON.parse(response.data);
            }
            settle(resolve, reject, response);
          } catch (error) {
            reject(
              createError(
                'Request did not return JSON',
                response.config,
                'ECONNABORTED',
                response.request,
                response
              )
            );
          }
        } else {
          settle(resolve, reject, response);
        }
      })
      .catch((err) => {
        reject(createError(`Request failed. ${err.message}`, config, null, null, null));
      });
  });
};

module.exports = timingAdapter;
