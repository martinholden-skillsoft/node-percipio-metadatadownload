require('dotenv-safe').config();

const config = require('config');
const Axios = require('axios');
const fs = require('fs');
const Path = require('path');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const promiseRetry = require('promise-retry');
const stringifySafe = require('json-stringify-safe');
const delve = require('dlv');
const jsonfile = require('jsonfile');
const Combiner = require('stream-combiner');
const JSONStream = require('jsonstream2');

const { transports } = require('winston');
const logger = require('./lib/logger');
const pjson = require('./package.json');

const { jsonataTransformStream, csvTransformStream } = require('./lib/streams');

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
 * @returns
 */
const callPercipio = async (options, axiosInstance = Axios) => {
  return promiseRetry(async (retry, numberOfRetries) => {
    const loggingOptions = {
      label: 'callPercipio',
    };

    const requestUri = processTemplate(options.request.uritemplate, options.request.path);
    options.logger.debug(`Request URI: ${requestUri}`, loggingOptions);

    let requestParams = options.request.query || {};
    requestParams = _.omitBy(requestParams, _.isNil);
    options.logger.debug(
      `Request Querystring Parameters: ${stringifySafe(requestParams)}`,
      loggingOptions
    );

    let requestBody = options.request.body || {};
    requestBody = _.omitBy(requestBody, _.isNil);
    options.logger.debug(`Request Body: ${stringifySafe(requestBody)}`, loggingOptions);

    const axiosConfig = {
      baseURL: options.request.baseURL,
      url: requestUri,
      headers: {
        Authorization: `Bearer ${options.request.bearer}`,
      },
      method: options.request.method,
      timeout: options.request.timeout || 2000,
    };

    if (!_.isEmpty(requestBody)) {
      axiosConfig.data = requestBody;
    }

    if (!_.isEmpty(requestParams)) {
      axiosConfig.params = requestParams;
    }

    options.logger.debug(`Axios Config: ${stringifySafe(axiosConfig)}`, loggingOptions);

    try {
      const response = await axiosInstance.request(axiosConfig);
      options.logger.debug(`Response Headers: ${stringifySafe(response.headers)}`, loggingOptions);
      return response;
    } catch (err) {
      options.logger.warn(
        `Trying to get report. Got Error after Attempt# ${numberOfRetries} : ${err}`,
        loggingOptions
      );
      if (err.response) {
        options.logger.debug(
          `Response Headers: ${stringifySafe(err.response.headers)}`,
          loggingOptions
        );
        options.logger.debug(`Response Body: ${stringifySafe(err.response.data)}`, loggingOptions);
      } else {
        options.logger.debug('No Response Object available', loggingOptions);
      }
      if (numberOfRetries < options.retry_options.retries + 1) {
        retry(err);
      } else {
        options.logger.error('Failed to call Percipio', loggingOptions);
      }
      throw err;
    }
  }, options.retry_options);
};

/**
 * Loop thru calling the API until all pages are delivered.
 *
 * @param {*} options
 * @param {Axios} [axiosInstance=Axios] HTTP request client that provides an Axios like interface
 * @returns {string} json file path
 */
const getAllPages = async (options, axiosInstance = Axios) => {
  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve, reject) => {
    const loggingOptions = {
      label: 'getAllPages',
    };

    const opts = options;
    const outputFile = Path.join(opts.output.path, opts.output.filename);
    const rawoutputfile = Path.join(opts.output.path, opts.output.rawdatafilename);
    opts.logcount = opts.logcount || 500;

    let keepGoing = true;
    let reportCount = true;
    let totalRecords = 0;
    let downloadedRecords = 0;

    try {
      const jsonataStream = jsonataTransformStream(options);
      const csvStream = csvTransformStream(options); // Use object mode and outputs object
      const outputStream = fs.createWriteStream(outputFile);

      if (opts.includeBOM) {
        outputStream.write(Buffer.from('\uFEFF'));
      }

      outputStream.on('error', (error) => {
        opts.logger.error(`Error. Path: ${stringifySafe(error)}`, loggingOptions);
      });

      jsonataStream.on('error', (error) => {
        opts.logger.error(`Error. Path: ${stringifySafe(error)}`, loggingOptions);
      });

      csvStream.on('error', (error) => {
        opts.logger.error(`Error. Path: ${stringifySafe(error)}`, loggingOptions);
      });

      csvStream.on('progress', (counter) => {
        if (counter % opts.logcount === 0) {
          opts.logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
            label: `${loggingOptions.label}-csvStream`,
          });
        }
      });

      jsonataStream.on('progress', (counter) => {
        if (counter % opts.logcount === 0) {
          opts.logger.info(`Processing. Processed: ${counter.toLocaleString()}`, {
            label: `${loggingOptions.label}-jsonataStream`,
          });
        }
      });

      outputStream.on('finish', () => {
        if (downloadedRecords === 0) {
          opts.logger.info('No records downloaded', loggingOptions);
          fs.unlinkSync(outputFile);
        } else {
          opts.logger.info(`Records Saved. Path: ${outputFile}`, loggingOptions);
        }

        resolve({ data: [], saved: true, outputFile });
      });

      const rawsteps = [];

      if (opts.output.includeRawdata) {
        rawsteps.push(JSONStream.stringify());
        rawsteps.push(fs.createWriteStream(rawoutputfile));
      }

      const rawchain = new Combiner(rawsteps);
      rawchain.on('error', (error) => {
        opts.logger.error(`Error. Path: ${stringifySafe(error)}`, loggingOptions);
      });

      const chain = new Combiner([jsonataStream, csvStream, outputStream]);
      chain.on('error', (error) => {
        opts.logger.error(`Error. Path: ${stringifySafe(error)}`, loggingOptions);
      });

      while (keepGoing) {
        let response = null;
        let recordsInResponse = 0;

        try {
          // eslint-disable-next-line no-await-in-loop
          response = await callPercipio(opts, axiosInstance);
        } catch (err) {
          opts.logger.error('ERROR: trying to download results', loggingOptions);
          keepGoing = false;
          reject(err);
          break;
        }

        if (reportCount) {
          totalRecords = parseInt(response.headers['x-total-count'], 10);
          opts.request.query.pagingRequestId = response.headers['x-paging-request-id'];
          opts.logger.info(
            `Total Records to download as reported in header['x-total-count'] ${totalRecords.toLocaleString()}`,
            loggingOptions
          );
          opts.logger.info(
            `Paging request id in header['x-paging-request-id'] ${opts.request.query.pagingRequestId}`,
            loggingOptions
          );
          reportCount = false;
        }

        recordsInResponse = delve(response, 'data.length', 0);

        if (recordsInResponse > 0) {
          downloadedRecords += recordsInResponse;

          opts.logger.info(
            `Records Downloaded ${downloadedRecords.toLocaleString()} of ${totalRecords.toLocaleString()}`,
            loggingOptions
          );

          // Set offset - number of records in response
          opts.request.query.offset += opts.request.query.max;

          // Stream the results
          // Iterate over the records and write EACH ONE to the stream individually.
          // Each one of these records will become a JSON object in the output file.

          response.data.forEach((record) => {
            if (opts.output.includeRawdata) {
              rawchain.write(record);
            }
            chain.write(record);
          });
        }

        if (opts.request.query.offset >= totalRecords) {
          keepGoing = false;
          // Once we've written each record in the record-set, we have to end the stream so that
          // the TRANSFORM stream knows to output the end of the array it is generating.
          // jsonataStream.end();
          rawchain.end();
          chain.end();
        }
      }
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Process the Percipio call
 *
 * @param {*} options
 * @returns
 */
const main = async (configOptions) => {
  const loggingOptions = {
    label: 'main',
  };

  const options = configOptions || null;

  options.logger = logger;

  if (_.isNull(options)) {
    options.logger.error('Invalid configuration', loggingOptions);
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
  options.logger.add(
    new transports.File({
      filename: Path.join(options.debug.path, options.debug.filename),
      options: {
        flags: 'w',
      },
    })
  );
  options.logger.info(`Start ${pjson.name} - v${pjson.version}`, loggingOptions);

  options.logger.debug(`Options: ${stringifySafe(options)}`, loggingOptions);

  // Check if we should load the lastrun date from file - we do this only if:
  // updatedSinceis null - so not set in config or passed thru ENV
  // If file does not exist we use null
  const lastrunFile = 'lastrun.json';

  // If the ALLRECORDS env is set force null updatedSince
  if (delve(options, 'allRecords', false)) {
    if (fs.existsSync(lastrunFile)) {
      fs.unlinkSync(lastrunFile);
    }
  }

  if (_.isNull(options.request.query.updatedSince)) {
    if (fs.existsSync(lastrunFile)) {
      const lastrun = jsonfile.readFileSync(lastrunFile);
      if (lastrun.orgid === options.request.path.orgId) {
        options.request.query.updatedSince = lastrun.date;

        options.logger.info(
          `Request updatedSince filter set to: ${options.request.query.updatedSince}`,
          loggingOptions
        );
      } else {
        fs.unlinkSync(lastrunFile);
        options.logger.info('Last run file from different orgid and so deleted', loggingOptions);
      }
    }
  }

  options.logger.info('Calling Percipio', loggingOptions);

  // Create an axios instance that this will allow us to replace
  // axios if desired with any HTTP request client that provides
  // an axios like interface.
  // For example https://github.com/googleapis/gaxios
  const axiosInstance = Axios.create();

  // Percipio API returns a paged response, so retrieve all pages
  await getAllPages(options, axiosInstance)
    .then(() => {
      const obj = {
        orgid: options.request.path.orgId,
        date: options.startTime.format(),
      };
      jsonfile.writeFileSync(lastrunFile, obj);
    })
    .catch((err) => {
      options.logger.error(`Error:  ${err}`, loggingOptions);
    });

  options.logger.info(`End ${pjson.name} - v${pjson.version}`, loggingOptions);
  return true;
};

try {
  main(config);
} catch (error) {
  throw new Error(`A problem occurred during configuration. ${error.message}`);
}
