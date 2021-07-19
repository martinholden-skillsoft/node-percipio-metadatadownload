require('dotenv-safe').config();

const config = require('config');
const Axios = require('axios');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const stringifySafe = require('json-stringify-safe');
const jsonfile = require('jsonfile');
const Combiner = require('stream-combiner');
const JSONStream = require('jsonstream2');
const rateLimit = require('axios-rate-limit');
const rax = require('retry-axios');
const { accessSafe } = require('access-safe');
const { v4: uuidv4 } = require('uuid');

const { transports } = require('winston');
const logger = require('./lib/logger');
const pjson = require('./package.json');

const { jsonataTransformStream, csvTransformStream } = require('./lib/streams');

const timingAdapter = require('./lib/timingAdapter');

/**
 * Process the URI Template strings
 *
 * @param {string} templateString
 * @param {object} templateVars
 * @return {string}
 */
const processTemplate = (templateString, templateVars) => {
  const compiled = _.template(templateString.replace(/{/g, '${'));
  return compiled(templateVars);
};

/**
 * Call Percipio API
 *
 * @param {*} options
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise}
 */
const callPercipio = (options, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const opts = _.cloneDeep(options);
    const requestUri = processTemplate(opts.request.uritemplate, opts.request.path);

    let requestParams = opts.request.query || {};
    requestParams = _.omitBy(requestParams, _.isNil);

    let requestBody = opts.request.body || {};
    requestBody = _.omitBy(requestBody, _.isNil);

    const axiosConfig = {
      baseURL: opts.request.baseURL,
      url: requestUri,
      headers: {
        Authorization: `Bearer ${opts.request.bearer}`,
      },
      method: opts.request.method,
      timeout: opts.request.timeout || 2000,
      correlationid: uuidv4(),
      logger,
    };

    if (!_.isEmpty(requestBody)) {
      axiosConfig.data = requestBody;
    }

    if (!_.isEmpty(requestParams)) {
      axiosConfig.params = requestParams;
    }

    axiosInstance
      .request(axiosConfig)
      .then((response) => {
        resolve(response);
      })
      .catch((err) => {
        reject(err);
      });
  });
};

/**
 * Calling the API to retrieve and process page.
 *
 * @param {*} options
 * @param {Number} offset the offset position of the page
 * @param {Combiner} [transformProcessStream=new Combiner([])] the processing stream for the results
 * @param {Combiner} [rawProcessStream=new Combiner([])] the processing stream for the raw results
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} Resolves to number of records processed
 */
const getPage = (
  options,
  offset,
  transformProcessStream = new Combiner([]),
  rawProcessStream = new Combiner([]),
  axiosInstance = Axios
) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getPage',
    };

    const opts = _.cloneDeep(options);
    opts.request.query.offset = offset;

    callPercipio(opts, axiosInstance)
      .then((response) => {
        const result = {
          count: accessSafe(() => response.data.length, 0),
          start: accessSafe(() => response.config.params.offset, 0),
          end:
            accessSafe(() => response.config.params.offset, 0) +
            accessSafe(() => response.config.params.max, 0),
          durationms: accessSafe(() => response.timings.durationms, null),
          sent: accessSafe(() => response.timings.sent.toISOString(), null),
          correlationid: accessSafe(() => response.config.correlationid, null),
        };

        const message = [];
        message.push(`CorrelationId: ${result.correlationid}.`);
        message.push(
          `Records Requested: ${result.start.toLocaleString()} to ${result.end.toLocaleString()}.`
        );
        message.push(`Duration ms: ${result.durationms}.`);
        message.push(`Records Returned: ${result.count.toLocaleString()}.`);
        logger.info(`${message.join(' ')}`, loggingOptions);

        if (result.count > 0) {
          response.data.forEach((record) => {
            if (
              accessSafe(
                () =>
                  _.isBoolean(opts.output.includeRawdata) ? opts.output.includeRawdata : false,
                false
              )
            ) {
              rawProcessStream.write(record);
            }
            transformProcessStream.write(record);
          });
          resolve(result);
        } else {
          resolve(result);
        }
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Loop thru calling the API until all pages are delivered.
 *
 * @param {*} options
 * @param {int} maxrecords The total number of records to retrieve
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} resolves to boolean to indicate if results saved and the filename
 */
const getAllPages = (options, maxrecords, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getAllPages',
    };

    const opts = _.cloneDeep(options);
    const outputFile = Path.join(opts.output.path, opts.output.filename);
    const rawoutputfile = Path.join(opts.output.path, opts.output.rawdatafilename);
    opts.logcount = opts.logcount || 1000;

    let downloadedRecords = 0;
    let rejectedRequests = [];

    const jsonataStream = jsonataTransformStream(opts);
    const csvStream = csvTransformStream(opts); // Use object mode and outputs object
    const outputStream = fs.createWriteStream(outputFile);

    if (opts.includeBOM) {
      outputStream.write(Buffer.from('\uFEFF'));
    }

    outputStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    jsonataStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    csvStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    csvStream.on('progress', (counter) => {
      if (counter % opts.logcount === 0) {
        logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
          label: `${loggingOptions.label}-csvStream`,
        });
      }
    });

    jsonataStream.on('progress', (counter) => {
      if (counter % opts.logcount === 0) {
        logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
          label: `${loggingOptions.label}-jsonataStream`,
        });
      }
    });

    outputStream.on('finish', () => {
      let saved = false;
      const rejectedrequestcount = accessSafe(() => rejectedRequests.length, 0);
      const includeRawdata = accessSafe(
        () => (_.isBoolean(opts.output.includeRawdata) ? opts.output.includeRawdata : false),
        false
      );

      if (rejectedrequestcount > 0) {
        if (includeRawdata) {
          // Delete the raw output file because incomplete request
          logger.warn(
            `Rawdata file deleted because ${rejectedRequests.length} requests did not complete. `,
            loggingOptions
          );
          fs.unlinkSync(rawoutputfile);
        }
        // Delete the output file because incomplete request
        logger.warn(
          `Downloaded Records file deleted because ${rejectedRequests.length} requests did not complete. `,
          loggingOptions
        );
        fs.unlinkSync(outputFile);
      }

      if (downloadedRecords === 0 && rejectedrequestcount === 0) {
        logger.info('No records downloaded', loggingOptions);
        fs.unlinkSync(outputFile);
      }

      if (downloadedRecords > 0 && rejectedrequestcount === 0) {
        logger.info(
          `Total Records Downloaded: ${downloadedRecords.toLocaleString()}`,
          loggingOptions
        );
        saved = true;
        logger.info(`Records Saved. Path: ${outputFile}`, loggingOptions);
      }

      resolve({
        saved,
        outputFile,
        rejectedrequestcount,
      });
    });

    const rawsteps = [];

    if (
      accessSafe(
        () => (_.isBoolean(opts.output.includeRawdata) ? opts.output.includeRawdata : false),
        false
      )
    ) {
      rawsteps.push(JSONStream.stringify());
      rawsteps.push(fs.createWriteStream(rawoutputfile));
    }

    const rawchain = new Combiner(rawsteps);
    rawchain.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    const chain = new Combiner([jsonataStream, csvStream, outputStream]);
    chain.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    const requests = [];
    for (let index = 0; index <= maxrecords; index += opts.request.query.max) {
      requests.push(getPage(opts, index, chain, rawchain, axiosInstance));
    }

    Promise.allSettled(requests)
      .then((data) => {
        rejectedRequests = data.filter((request) => {
          return request.status === 'rejected';
        });

        logger.debug(`Results. ${stringifySafe(data)}`, loggingOptions);
        downloadedRecords = data.reduce((total, currentValue) => {
          const count = accessSafe(() => currentValue.value.count, 0);
          return total + count;
        }, 0);

        // Once we've written each record in the record-set, we have to end the stream so that
        // the TRANSFORM stream knows to output the end of the array it is generating.
        // jsonataStream.end();
        rawchain.end();
        chain.end();
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Request one item so we can get count
 *
 * @param {*} options
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {Promise} Promise object resolves to obect with total and pagingRequestId.
 */
const getAssetCount = (options, axiosInstance = Axios) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'getAssetCount',
    };

    const opts = _.cloneDeep(options);
    opts.request.query.max = 1;

    const results = {
      total: null,
      pagingRequestId: null,
    };

    callPercipio(opts, axiosInstance)
      .then((response) => {
        results.total = parseInt(response.headers['x-total-count'], 10);
        results.pagingRequestId = response.headers['x-paging-request-id'];
        const message = [];
        message.push(`Total Records ['x-total-count']: ${results.total.toLocaleString()}`);

        if (results.pagingRequestId !== null) {
          message.push(`Paging request id ['x-paging-request-id']: ${results.pagingRequestId}`);
        }
        logger.info(`${message.join(' ')}`, loggingOptions);
        resolve(results);
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        reject(err);
      });
  });
};

/**
 * Read an existing JSON file
 *
 * @param {*} options
 * @returns {Promise} resolves to boolean to indicate if results saved and the filename
 */
const readJSON = (options, source) => {
  return new Promise((resolve, reject) => {
    const loggingOptions = {
      label: 'readJSON',
    };

    const opts = _.cloneDeep(options);
    const outputFile = Path.join(opts.output.path, opts.output.filename);
    opts.logcount = opts.logcount || 1000;

    let loadedRecords = 0;

    const inputStream = fs.createReadStream(source);
    // When we read in the Array, we want to emit a "data" event for every item in
    // the serialized record-set. As such, we are going to use the path "*".
    const parseJSONStream = JSONStream.parse('*');
    const jsonataStream = jsonataTransformStream(opts);
    const csvStream = csvTransformStream(opts); // Use object mode and outputs object
    const outputStream = fs.createWriteStream(outputFile);

    if (opts.includeBOM) {
      outputStream.write(Buffer.from('\uFEFF'));
    }

    parseJSONStream.on('data', () => {
      if (loadedRecords !== 0 && loadedRecords % opts.logcount === 0) {
        logger.info(`Processing. Processed: ${loadedRecords.toLocaleString()}`, {
          label: `${loggingOptions.label}-parseJSONStream`,
        });
      }
      loadedRecords += 1;
    });

    outputStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    jsonataStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    csvStream.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });

    csvStream.on('progress', (counter) => {
      if (counter % opts.logcount === 0) {
        logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
          label: `${loggingOptions.label}-csvStream`,
        });
      }
    });

    jsonataStream.on('progress', (counter) => {
      if (counter % opts.logcount === 0) {
        logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
          label: `${loggingOptions.label}-jsonataStream`,
        });
      }
    });

    outputStream.on('finish', () => {
      let saved = false;

      if (loadedRecords === 0) {
        logger.info('No records downloaded', loggingOptions);
        fs.unlinkSync(outputFile);
      }

      if (loadedRecords > 0) {
        logger.info(`Total Records Downloaded: ${loadedRecords.toLocaleString()}`, loggingOptions);
        saved = true;
        logger.info(`Records Saved. Path: ${outputFile}`, loggingOptions);
      }

      resolve({
        saved,
        outputFile,
      });
    });

    const chain = new Combiner([
      inputStream,
      parseJSONStream,
      jsonataStream,
      csvStream,
      outputStream,
    ]);
    chain.on('error', (err) => {
      logger.error(err, loggingOptions);
      reject(err);
    });
  });
};

/**
 * Process the Percipio call
 *
 * @param {*} options
 * @returns
 */
const main = (configOptions) => {
  const loggingOptions = {
    label: 'main',
  };

  const options = configOptions ? { ...configOptions } : null;

  if (_.isNull(options)) {
    logger.error('Invalid configuration', loggingOptions);
    return false;
  }

  // Create logging folder if one does not exist
  if (!_.isNull(options.debug.path)) {
    if (!fs.existsSync(options.debug.path)) {
      mkdirp.sync(options.debug.path);
    }
  }

  // Create output folder if one does not exist
  if (!_.isNull(options.output.path)) {
    if (!fs.existsSync(options.output.path)) {
      mkdirp.sync(options.output.path);
    }
  }

  // Add logging to a file
  logger.add(
    new transports.File({
      filename: Path.join(options.debug.path, options.debug.filename),
      options: {
        flags: 'w',
      },
    })
  );
  logger.info(`Start ${pjson.name} - v${pjson.version}`, loggingOptions);

  logger.debug(`Options: ${stringifySafe(options)}`, loggingOptions);

  if (accessSafe(() => options.source, false)) {
    if (fs.existsSync(options.source)) {
      logger.info(`Processing local JSON: ${options.source}`, loggingOptions);
      readJSON(options, options.source)
        .then(() => {
          logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
        })
        .catch((err) => {
          logger.error(err, loggingOptions);
          logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
        });
    } else {
      logger.error(`File not found for local JSON: ${options.source}`, loggingOptions);
      logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
    }
  } else {
    // Check if we should load the lastrun date from file - we do this only if:
    // updatedSinceis null - so not set in config or passed thru ENV
    // If file does not exist we use null
    const lastrunFile = 'lastrun.json';

    // If the ALLRECORDS env is set force null updatedSince
    if (accessSafe(() => (_.isBoolean(options.allRecords) ? options.allRecords : false), false)) {
      if (fs.existsSync(lastrunFile)) {
        fs.unlinkSync(lastrunFile);
      }
    }

    if (_.isNull(options.request.query.updatedSince)) {
      if (fs.existsSync(lastrunFile)) {
        const lastrun = jsonfile.readFileSync(lastrunFile);
        if (lastrun.orgid === options.request.path.orgId) {
          options.request.query.updatedSince = lastrun.date;

          logger.info(
            `Request updatedSince filter set to: ${options.request.query.updatedSince}`,
            loggingOptions
          );
        } else {
          fs.unlinkSync(lastrunFile);
          logger.info('Last run file from different orgid and so deleted', loggingOptions);
        }
      }
    }

    logger.info('Calling Percipio', loggingOptions);

    // Create an axios instance that this will allow us to replace
    // with ratelimiting
    // see https://github.com/aishek/axios-rate-limit
    const axiosInstance = rateLimit(Axios.create({ adapter: timingAdapter }), options.ratelimit);

    // Add Axios Retry
    // see https://github.com/JustinBeckwith/retry-axios
    axiosInstance.defaults.raxConfig = _.merge(
      {},
      {
        instance: axiosInstance,
        // You can detect when a retry is happening, and figure out how many
        // retry attempts have been made
        onRetryAttempt: (err) => {
          const raxcfg = rax.getConfig(err);
          logger.warn(
            `CorrelationId: ${err.config.correlationid}. Retry attempt #${raxcfg.currentRetryAttempt}`,
            {
              label: 'onRetryAttempt',
            }
          );
        },
        // Override the decision making process on if you should retry
        shouldRetry: (err) => {
          const cfg = rax.getConfig(err);
          // ensure max retries is always respected
          if (cfg.currentRetryAttempt >= cfg.retry) {
            logger.warn(`CorrelationId: ${err.config.correlationid}. Maximum retries reached.`, {
              label: `shouldRetry`,
            });
            return false;
          }

          // ensure max retries for NO RESPONSE errors is always respected
          if (cfg.currentRetryAttempt >= cfg.noResponseRetries) {
            logger.warn(
              `CorrelationId: ${err.config.correlationid}. Maximum retries reached for No Response Errors.`,
              {
                label: `shouldRetry`,
              }
            );
            return false;
          }

          // Always retry if response was not JSON
          if (err.message.includes('Request did not return JSON')) {
            logger.warn(
              `CorrelationId: ${err.config.correlationid}. Request did not return JSON. Retrying.`,
              {
                label: `shouldRetry`,
              }
            );
            return true;
          }

          // Handle the request based on your other config options, e.g. `statusCodesToRetry`
          if (rax.shouldRetryRequest(err)) {
            return true;
          }

          logger.error(`CorrelationId: ${err.config.correlationid}. None retryable error.`, {
            label: `shouldRetry`,
          });
          return false;
        },
      },
      options.rax
    );
    rax.attach(axiosInstance);

    getAssetCount(options, axiosInstance)
      .then((response) => {
        // Percipio API returns a paged response, so retrieve all pages
        options.request.query.pagingRequestId = response.pagingRequestId;

        if (response.total > 0) {
          getAllPages(options, response.total, axiosInstance)
            .then((results) => {
              if (results.rejectedrequestcount === 0) {
                const obj = {
                  orgid: options.request.path.orgId,
                  date: options.startTime.format(),
                };
                jsonfile.writeFileSync(lastrunFile, obj);
              }
              logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
            })
            .catch((err) => {
              logger.error(err, loggingOptions);
            });
        } else {
          logger.info('No records to download', loggingOptions);
          logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
        }
      })
      .catch((err) => {
        logger.error(err, loggingOptions);
        logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
      });
  }
  return true;
};

try {
  main(config);
} catch (error) {
  throw new Error(`A problem occurred during configuration. ${error.message}`);
}
